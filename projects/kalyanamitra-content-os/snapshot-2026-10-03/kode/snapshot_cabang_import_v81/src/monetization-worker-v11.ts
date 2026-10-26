import monetizationWorkerV10 from './monetization-worker-v10';
import { learningContext } from './monetization-learning';

type LegacyQueueMessage={
  kind:'operational_probe'|'integration_event';
  correlationId:string;
  metadata?:Record<string,unknown>;
};

type ResearchPayload={
  topic:string;
  keywords:string[];
  platform:'threads'|'instagram';
  lookbackDays:number;
  providerId?:string;
};

type ResearchRetryMessage={
  kind:'openclaw_research_retry';
  correlationId:string;
  attempt:number;
  maxAttempts:number;
  queuedAt:string;
  revenueLearningApplied:boolean;
  appliedGuidanceKeywordCount:number;
  payload:ResearchPayload;
};

type QueueMessage=LegacyQueueMessage|ResearchRetryMessage;

type Env={
  DB:D1Database;
  CONTENT_OS:Fetcher;
  MONETIZATION_QUEUE?:Queue<QueueMessage>;
  MONETIZATION_INGEST_TOKEN?:string;
  LYNK_WEBHOOK_SECRET?:string;
  DEEPSEEK_API_KEY?:string;
  DEEPSEEK_MODEL?:string;
  MONETIZATION_AI_ENABLED?:string;
};

type JsonRecord=Record<string,unknown>;
type JobLogRow={status:string;error_code:string|null;error_message:string|null;metadata_json:string;created_at:string};

const MAX_BODY_BYTES=16*1024;
const MAX_RETRY_ATTEMPTS=4;
const ALLOWED_PLATFORMS=new Set(['threads','instagram']);
const RETRYABLE_STATUSES=new Set([429,502,503,504]);
const JOB_ID_PATTERN=/^research-job-[0-9a-f-]{36}$/i;

function json(data:unknown,status=200):Response{
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer'
    }
  });
}

function isRecord(value:unknown):value is JsonRecord{
  return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
}

function text(value:unknown,max:number):string|null{
  if(typeof value!=='string')return null;
  const cleaned=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  return cleaned?cleaned.slice(0,max):null;
}

function safeArray(value:unknown,maxItems=12,maxLength=80):string[]{
  if(!Array.isArray(value))return [];
  return value.map((item)=>text(item,maxLength)).filter((item):item is string=>Boolean(item)).slice(0,maxItems);
}

function dedupe(values:string[]):string[]{
  const seen=new Set<string>();
  const result:string[]=[];
  for(const item of values){
    const key=item.toLocaleLowerCase('id-ID');
    if(seen.has(key))continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function parseMetadata(value:string):JsonRecord{
  try{
    const parsed=JSON.parse(value) as unknown;
    return isRecord(parsed)?parsed:{};
  }catch{
    return {};
  }
}

async function verifyOpenClaw(request:Request,env:Env):Promise<boolean>{
  const authorization=request.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer '))return false;
  try{
    const response=await env.CONTENT_OS.fetch(new Request('https://content-os.internal/api/internal/openclaw/verify',{
      method:'POST',
      headers:{Authorization:authorization}
    }));
    return response.status===200;
  }catch{
    return false;
  }
}

async function readBody(request:Request):Promise<JsonRecord>{
  const contentLength=Number(request.headers.get('Content-Length')??0);
  if(Number.isFinite(contentLength)&&contentLength>MAX_BODY_BYTES)throw new Error('Payload riset terlalu besar.');
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw new Error('Payload riset terlalu besar.');
  const parsed=JSON.parse(raw) as unknown;
  if(!isRecord(parsed))throw new Error('Payload riset tidak valid.');
  return parsed;
}

function guidanceKeywords(body:unknown):string[]{
  if(!isRecord(body))return [];
  const guidance=isRecord(body.guidance)?body.guidance:{};
  const research=isRecord(guidance.researchGuidance)?guidance.researchGuidance:{};
  return dedupe([...safeArray(research.prioritize),...safeArray(research.commercialPatterns)]).slice(0,12);
}

async function sha256Prefix(value:string):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  const hex=Array.from(new Uint8Array(digest)).map((byte)=>byte.toString(16).padStart(2,'0')).join('');
  return hex.slice(0,32);
}

async function normalizeRetryPayload(input:JsonRecord,env:Env):Promise<{
  payload:ResearchPayload;
  revenueLearningApplied:boolean;
  appliedGuidanceKeywordCount:number;
  topicHash:string;
}>{
  const topic=text(input.topic,300);
  if(!topic||topic.length<8)throw new Error('Topik harus berisi 8-300 karakter.');
  const platform=(text(input.platform,20)??'threads').toLowerCase();
  if(!ALLOWED_PLATFORMS.has(platform))throw new Error('Platform riset OpenClaw hanya threads atau instagram.');
  const lookbackDays=Number(input.lookbackDays??7);
  if(!Number.isInteger(lookbackDays)||lookbackDays<1||lookbackDays>30)throw new Error('Periode riset harus 1-30 hari.');
  const supplied=safeArray(input.keywords);
  const useRevenueLearning=input.useRevenueLearning!==false;
  const learning=useRevenueLearning?await learningContext(env):{status:200,body:{}};
  const enriched=useRevenueLearning&&learning.status>=200&&learning.status<300?guidanceKeywords(learning.body):[];
  const candidates=dedupe([...supplied,...enriched,topic]);
  const primary=candidates[0]??topic;
  const providerId=text(input.providerId,100)??undefined;
  return {
    payload:{
      topic,
      keywords:[primary],
      platform:platform as 'threads'|'instagram',
      lookbackDays,
      ...(providerId?{providerId}:{})
    },
    revenueLearningApplied:useRevenueLearning&&enriched.length>0,
    appliedGuidanceKeywordCount:useRevenueLearning?enriched.length:0,
    topicHash:await sha256Prefix(topic)
  };
}

async function recordJobState(
  env:Env,
  correlationId:string,
  status:'success'|'warning'|'error',
  state:'queued'|'processing'|'waiting_provider'|'ready'|'failed',
  metadata:JsonRecord={},
  errorCode?:string,
  errorMessage?:string
):Promise<void>{
  await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,error_code,error_message,correlation_id,metadata_json)
    VALUES ('repliz','research_retry',?1,?2,?3,?4,?5)`)
    .bind(status,errorCode??null,errorMessage??null,correlationId,JSON.stringify({
      evidenceVersion:'1.0',
      state,
      asynchronous:true,
      readOnly:true,
      publishing:false,
      piiStored:false,
      ...metadata,
      recordedAt:new Date().toISOString()
    })).run();
}

async function latestJobState(env:Env,correlationId:string):Promise<{row:JobLogRow;metadata:JsonRecord}|null>{
  const row=await env.DB.prepare(`SELECT status,error_code,error_message,metadata_json,created_at
    FROM monetization_integration_logs
    WHERE provider='repliz' AND operation='research_retry' AND correlation_id=?1
    ORDER BY id DESC LIMIT 1`).bind(correlationId).first<JobLogRow>();
  return row?{row,metadata:parseMetadata(row.metadata_json)}:null;
}

function isLegacyQueueMessage(value:unknown):value is LegacyQueueMessage{
  if(!isRecord(value))return false;
  return (value.kind==='operational_probe'||value.kind==='integration_event')&&Boolean(text(value.correlationId,180));
}

function isResearchRetryMessage(value:unknown):value is ResearchRetryMessage{
  if(!isRecord(value)||value.kind!=='openclaw_research_retry'||!isRecord(value.payload))return false;
  return Boolean(text(value.correlationId,180))&&Number.isInteger(value.attempt)&&Number.isInteger(value.maxAttempts);
}

async function enqueueTimeoutRetry(request:Request,response:Response,env:Env):Promise<Response>{
  if(!env.MONETIZATION_QUEUE)return response;
  try{
    const input=await readBody(request);
    const normalized=await normalizeRetryPayload(input,env);
    const correlationId=`research-job-${crypto.randomUUID()}`;
    const queuedAt=new Date().toISOString();
    const message:ResearchRetryMessage={
      kind:'openclaw_research_retry',
      correlationId,
      attempt:1,
      maxAttempts:MAX_RETRY_ATTEMPTS,
      queuedAt,
      revenueLearningApplied:normalized.revenueLearningApplied,
      appliedGuidanceKeywordCount:normalized.appliedGuidanceKeywordCount,
      payload:normalized.payload
    };
    await recordJobState(env,correlationId,'warning','queued',{
      attempt:1,
      maxAttempts:MAX_RETRY_ATTEMPTS,
      topicHash:normalized.topicHash,
      platform:normalized.payload.platform,
      lookbackDays:normalized.payload.lookbackDays,
      revenueLearningApplied:normalized.revenueLearningApplied,
      appliedGuidanceKeywordCount:normalized.appliedGuidanceKeywordCount
    });
    await env.MONETIZATION_QUEUE.send(message);

    const upstreamUnknown:unknown=await response.clone().json().catch(()=>({}));
    const upstream=isRecord(upstreamUnknown)?upstreamUnknown:{};
    const research=isRecord(upstream.research)?upstream.research:{};
    return json({
      ok:true,
      accepted:true,
      queued:true,
      orchestrator:'openclaw',
      mode:'read-only',
      publishing:false,
      revenueLearningApplied:normalized.revenueLearningApplied,
      appliedGuidanceKeywordCount:normalized.appliedGuidanceKeywordCount,
      research:{
        ok:true,
        status:'waiting_provider',
        provider:'repliz',
        jobId:correlationId,
        pollPath:`/api/monetization/openclaw/research-jobs/${correlationId}`,
        previousAttempt:{
          requestId:text(research.requestId,80),
          runId:text(research.runId,80),
          error:text(research.error,240)
        }
      }
    },202);
  }catch(error){
    console.error(JSON.stringify({message:'research_retry_enqueue_failed',error:error instanceof Error?error.message:'unknown'}));
    return response;
  }
}

async function readResearchJob(request:Request,env:Env,jobId:string):Promise<Response>{
  if(!(await verifyOpenClaw(request,env)))return json({ok:false,error:'Unauthorized'},401);
  if(!JOB_ID_PATTERN.test(jobId))return json({ok:false,error:'Research job ID tidak valid.'},400);
  const result=await env.DB.prepare(`SELECT status,error_code,error_message,metadata_json,created_at
    FROM monetization_integration_logs
    WHERE provider='repliz' AND operation='research_retry' AND correlation_id=?1
    ORDER BY id DESC LIMIT 20`).bind(jobId).all<JobLogRow>();
  if(!result.results.length)return json({ok:false,error:'Research job tidak ditemukan.'},404);

  const history=result.results.map((row)=>({
    status:row.status,
    errorCode:row.error_code,
    error:row.error_message,
    createdAt:row.created_at,
    metadata:parseMetadata(row.metadata_json)
  }));
  const latest=history[0]!;
  const state=typeof latest.metadata.state==='string'?latest.metadata.state:'waiting_provider';
  let research:unknown=null;
  const contentOsRunId=text(latest.metadata.contentOsRunId,80);
  if(state==='ready'&&contentOsRunId){
    try{
      const response=await env.CONTENT_OS.fetch(new Request(`https://content-os.internal/api/topic-research/runs/${encodeURIComponent(contentOsRunId)}`));
      research=await response.json().catch(()=>null);
    }catch{
      research=null;
    }
  }
  return json({
    ok:true,
    job:{
      id:jobId,
      status:state,
      provider:'repliz',
      asynchronous:true,
      readOnly:true,
      publishing:false,
      attempt:latest.metadata.attempt??null,
      maxAttempts:latest.metadata.maxAttempts??MAX_RETRY_ATTEMPTS,
      error:latest.error,
      contentOsRunId:contentOsRunId??null,
      research
    },
    history
  });
}

async function processResearchRetry(message:Message<unknown>,body:ResearchRetryMessage,env:Env):Promise<void>{
  const existing=await latestJobState(env,body.correlationId);
  const existingState=existing?.metadata.state;
  if(existingState==='ready'||existingState==='failed'){
    message.ack();
    return;
  }

  await recordJobState(env,body.correlationId,'warning','processing',{
    attempt:body.attempt,
    maxAttempts:body.maxAttempts,
    platform:body.payload.platform,
    lookbackDays:body.payload.lookbackDays,
    revenueLearningApplied:body.revenueLearningApplied,
    appliedGuidanceKeywordCount:body.appliedGuidanceKeywordCount
  });

  let status=502;
  let responseBody:JsonRecord={ok:false,error:'Content OS service binding unavailable.'};
  try{
    const response=await env.CONTENT_OS.fetch(new Request('https://content-os.internal/api/topic-research/runs',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body.payload)
    }));
    status=response.status;
    responseBody=await response.json<JsonRecord>().catch(()=>({ok:false,error:'Respons Content OS tidak valid.'}));
  }catch(error){
    responseBody={ok:false,error:error instanceof Error?error.message:'Content OS service binding unavailable.'};
  }

  if(status>=200&&status<300&&responseBody.ok===true){
    const run=isRecord(responseBody.run)?responseBody.run:{};
    const contentOsRunId=text(run.id,80);
    try{
      await recordJobState(env,body.correlationId,'success','ready',{
        attempt:body.attempt,
        maxAttempts:body.maxAttempts,
        responseStatus:status,
        contentOsRunId,
        revenueLearningApplied:body.revenueLearningApplied,
        appliedGuidanceKeywordCount:body.appliedGuidanceKeywordCount
      });
    }catch(error){
      console.error(JSON.stringify({message:'research_retry_completion_log_failed',jobId:body.correlationId,error:error instanceof Error?error.message:'unknown'}));
    }
    message.ack();
    return;
  }

  const retryable=RETRYABLE_STATUSES.has(status);
  const errorMessage=text(responseBody.error,240)??`Research provider gagal dengan status ${status}.`;
  if(retryable&&body.attempt<body.maxAttempts&&env.MONETIZATION_QUEUE){
    const next:ResearchRetryMessage={...body,attempt:body.attempt+1};
    await recordJobState(env,body.correlationId,'warning','waiting_provider',{
      attempt:body.attempt,
      nextAttempt:next.attempt,
      maxAttempts:body.maxAttempts,
      responseStatus:status,
      revenueLearningApplied:body.revenueLearningApplied,
      appliedGuidanceKeywordCount:body.appliedGuidanceKeywordCount
    },`HTTP_${status}`,errorMessage);
    await env.MONETIZATION_QUEUE.send(next,{delaySeconds:Math.min(300,30*body.attempt)});
    message.ack();
    return;
  }

  await recordJobState(env,body.correlationId,'error','failed',{
    attempt:body.attempt,
    maxAttempts:body.maxAttempts,
    responseStatus:status,
    exhausted:body.attempt>=body.maxAttempts,
    revenueLearningApplied:body.revenueLearningApplied,
    appliedGuidanceKeywordCount:body.appliedGuidanceKeywordCount
  },`HTTP_${status}`,errorMessage);
  message.ack();
}

async function processLegacyQueue(message:Message<unknown>,body:LegacyQueueMessage,env:Env):Promise<void>{
  await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,correlation_id,metadata_json)
    VALUES ('system',?1,'success',?2,?3)`)
    .bind(body.kind==='operational_probe'?'queue_probe':'queue_integration_event',body.correlationId,JSON.stringify(body.metadata??{})).run();
  message.ack();
}

export default{
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    const jobMatch=url.pathname.match(/^\/api\/monetization\/openclaw\/research-jobs\/(research-job-[0-9a-f-]{36})$/i);
    if(request.method==='GET'&&jobMatch?.[1])return readResearchJob(request as never,env,jobMatch[1]);

    if(request.method==='POST'&&url.pathname==='/api/monetization/openclaw/research'){
      const retrySource=request.clone();
      const response=await monetizationWorkerV10.fetch(request as never,env as never,ctx as never);
      if(response.status===504)return enqueueTimeoutRetry(retrySource as never,response,env);
      return response;
    }

    return monetizationWorkerV10.fetch(request as never,env as never,ctx as never);
  },

  scheduled:monetizationWorkerV10.scheduled,

  async queue(batch:MessageBatch<unknown>,env:Env):Promise<void>{
    for(const message of batch.messages){
      try{
        if(isResearchRetryMessage(message.body)){
          await processResearchRetry(message,message.body,env);
          continue;
        }
        if(isLegacyQueueMessage(message.body)){
          await processLegacyQueue(message,message.body,env);
          continue;
        }
        message.ack();
      }catch(error){
        console.error(JSON.stringify({message:'monetization_queue_processing_failed',error:error instanceof Error?error.message:'unknown'}));
        message.retry();
      }
    }
  }
} satisfies ExportedHandler<Env>;
