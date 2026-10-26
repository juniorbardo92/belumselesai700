import monetizationWorkerV9 from './monetization-worker-v9';
import { learningContext } from './monetization-learning';

type QueueMessage={kind:'operational_probe'|'integration_event';correlationId:string;metadata?:Record<string,unknown>};
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
const MAX_BODY_BYTES=16*1024;
const MAX_KEYWORDS=12;
const MAX_KEYWORD_LENGTH=80;
const ALLOWED_RESEARCH_PLATFORMS=new Set(['threads','instagram']);

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

function safeStringArray(value:unknown):string[]{
  if(!Array.isArray(value))return [];
  return value.map((item)=>text(item,MAX_KEYWORD_LENGTH)).filter((item):item is string=>Boolean(item));
}

function dedupeKeywords(values:string[]):string[]{
  const seen=new Set<string>();
  const result:string[]=[];
  for(const value of values){
    const normalized=value.toLocaleLowerCase('id-ID');
    if(seen.has(normalized))continue;
    seen.add(normalized);
    result.push(value);
    if(result.length>=MAX_KEYWORDS)break;
  }
  return result;
}

async function readJson(request:Request):Promise<JsonRecord>{
  const contentLength=Number(request.headers.get('Content-Length')??0);
  if(Number.isFinite(contentLength)&&contentLength>MAX_BODY_BYTES)throw new Error('Payload riset terlalu besar.');
  const body=await request.text();
  if(new TextEncoder().encode(body).byteLength>MAX_BODY_BYTES)throw new Error('Payload riset terlalu besar.');
  const parsed=JSON.parse(body) as unknown;
  if(!isRecord(parsed))throw new Error('Payload riset tidak valid.');
  return parsed;
}

async function verifyOpenClaw(request:Request,env:Env):Promise<boolean>{
  const authorization=request.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer '))return false;
  try{
    const response=await env.CONTENT_OS.fetch(new Request('https://content-os.internal/api/internal/openclaw/verify',{
      method:'POST',headers:{Authorization:authorization}
    }));
    return response.status===200;
  }catch{
    return false;
  }
}

async function contentOsJson(env:Env,path:string,init?:RequestInit):Promise<{status:number;body:JsonRecord}>{
  try{
    const response=await env.CONTENT_OS.fetch(new Request(`https://content-os.internal${path}`,init));
    const body=await response.json<JsonRecord>().catch(()=>({}));
    return {status:response.status,body};
  }catch{
    return {status:502,body:{ok:false,error:'Content OS service binding unavailable.'}};
  }
}

function guidanceKeywords(contextBody:unknown):string[]{
  if(!isRecord(contextBody))return [];
  const guidance=isRecord(contextBody.guidance)?contextBody.guidance:{};
  const researchGuidance=isRecord(guidance.researchGuidance)?guidance.researchGuidance:{};
  return dedupeKeywords([
    ...safeStringArray(researchGuidance.prioritize),
    ...safeStringArray(researchGuidance.commercialPatterns)
  ]);
}

async function hashedCorrelation(request:Request):Promise<string>{
  const raw=text(request.headers.get('X-OpenClaw-Run-Id'),160)
    ??text(request.headers.get('X-Correlation-Id'),160)
    ??crypto.randomUUID();
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  const hex=Array.from(new Uint8Array(digest)).map((byte)=>byte.toString(16).padStart(2,'0')).join('');
  return `oc-${hex.slice(0,32)}`;
}

async function recordResearchEvidence(request:Request,env:Env,status:number,appliedGuidance:number):Promise<void>{
  const metadata={
    evidenceVersion:'1.0',
    route:'/api/monetization/openclaw/research',
    responseStatus:status,
    interface:text(request.headers.get('X-OpenClaw-Interface'),40)?.toLowerCase()??null,
    externalRunIdPresent:Boolean(request.headers.get('X-OpenClaw-Run-Id')),
    telegramUpdateIdPresent:Boolean(request.headers.get('X-Telegram-Update-Id')),
    revenueLearningApplied:appliedGuidance>0,
    appliedGuidanceKeywordCount:appliedGuidance,
    identifiersStoredAs:'sha256-prefix',
    piiStored:false,
    publishing:false,
    recordedAt:new Date().toISOString()
  };
  await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,error_code,error_message,correlation_id,metadata_json)
    VALUES ('openclaw','research_trigger','success',NULL,NULL,?1,?2)`)
    .bind(await hashedCorrelation(request),JSON.stringify(metadata)).run();
}

async function researchManifest(request:Request,env:Env):Promise<Response>{
  if(!(await verifyOpenClaw(request,env)))return json({ok:false,error:'Unauthorized'},401);
  return json({
    ok:true,
    interface:'openclaw',
    workflow:'topic_research',
    mode:'read-only',
    publishing:false,
    revenueLearningEnrichment:true,
    allowedPlatforms:['threads','instagram'],
    request:{
      topic:'string 8-300 characters',
      keywords:'optional string[]; maximum 12 after enrichment',
      platform:'threads|instagram; default threads',
      lookbackDays:'integer 1-30; default 7',
      providerId:'optional Content OS connector id',
      useRevenueLearning:'boolean; default true'
    },
    endpoint:'/api/monetization/openclaw/research'
  });
}

async function researchReadiness(request:Request,env:Env):Promise<Response>{
  if(!env.MONETIZATION_INGEST_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.MONETIZATION_INGEST_TOKEN}`){
    return json({ok:false,error:'Unauthorized'},401);
  }
  const [topicStatus,learning]=await Promise.all([
    contentOsJson(env,'/api/topic-research/status'),
    learningContext(env)
  ]);
  const learningBody=isRecord(learning.body)?learning.body:{};
  const keywords=guidanceKeywords(learningBody);
  return json({
    ok:topicStatus.status===200&&topicStatus.body.ok===true,
    bridge:'openclaw-to-content-os-service-binding',
    mode:'read-only',
    publishing:false,
    allowedPlatforms:['threads','instagram'],
    revenueLearning:{
      available:learning.status===200,
      activeInsights:Array.isArray(learningBody.insights)?learningBody.insights.length:0,
      enrichmentKeywordCount:keywords.length
    },
    topicResearch:{httpStatus:topicStatus.status,...topicStatus.body}
  },topicStatus.status===200?200:502);
}

async function triggerResearch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  if(!(await verifyOpenClaw(request,env)))return json({ok:false,error:'Unauthorized'},401);
  try{
    const input=await readJson(request.clone() as never);
    const topic=text(input.topic,300);
    if(!topic||topic.length<8)return json({ok:false,error:'Topik harus berisi 8-300 karakter.'},400);
    const platform=(text(input.platform,20)??'threads').toLowerCase();
    if(!ALLOWED_RESEARCH_PLATFORMS.has(platform)){
      return json({ok:false,error:'Platform riset OpenClaw hanya threads atau instagram.'},400);
    }
    const lookbackDays=Number(input.lookbackDays??7);
    if(!Number.isInteger(lookbackDays)||lookbackDays<1||lookbackDays>30){
      return json({ok:false,error:'Periode riset harus 1-30 hari.'},400);
    }
    const supplied=safeStringArray(input.keywords);
    if(Array.isArray(input.keywords)&&supplied.length!==input.keywords.length){
      return json({ok:false,error:'Keyword riset harus berupa teks.'},400);
    }
    const useRevenueLearning=input.useRevenueLearning!==false;
    const learning=useRevenueLearning?await learningContext(env):{status:200,body:{ok:true,insights:[],guidance:{}}};
    const enriched=useRevenueLearning?guidanceKeywords(learning.body):[];
    const keywords=dedupeKeywords([...supplied,...enriched]);
    const providerId=text(input.providerId,100);
    const payload:JsonRecord={topic,platform,lookbackDays,keywords};
    if(providerId)payload.providerId=providerId;

    const upstream=await contentOsJson(env,'/api/topic-research/runs',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    if(upstream.status>=200&&upstream.status<300){
      ctx.waitUntil(recordResearchEvidence(request.clone() as never,env,upstream.status,enriched.length).catch(()=>undefined));
    }
    return json({
      ok:upstream.status>=200&&upstream.status<300,
      orchestrator:'openclaw',
      mode:'read-only',
      publishing:false,
      revenueLearningApplied:useRevenueLearning&&enriched.length>0,
      appliedGuidanceKeywordCount:useRevenueLearning?enriched.length:0,
      research:upstream.body
    },upstream.status);
  }catch(error){
    const message=error instanceof SyntaxError?'Body harus berupa JSON valid.':error instanceof Error?error.message:'Riset gagal diproses.';
    return json({ok:false,error:message},400);
  }
}

async function enrichTelegramManifest(response:Response):Promise<Response>{
  if(!response.ok)return response;
  const body=await response.clone().json<JsonRecord>().catch(()=>null);
  if(!body)return response;
  const routes=isRecord(body.routes)?body.routes:{};
  return json({
    ...body,
    routes:{
      ...routes,
      research:'/api/monetization/openclaw/research',
      researchManifest:'/api/monetization/openclaw/research-manifest'
    }
  },response.status);
}

export default{
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/monetization/openclaw/research-readiness'){
      return researchReadiness(request,env);
    }
    if(request.method==='GET'&&url.pathname==='/api/monetization/openclaw/research-manifest'){
      return researchManifest(request as never,env);
    }
    if(request.method==='POST'&&url.pathname==='/api/monetization/openclaw/research'){
      return triggerResearch(request as never,env,ctx);
    }
    const response=await monetizationWorkerV9.fetch(request as never,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/monetization/openclaw/telegram-manifest'){
      return enrichTelegramManifest(response);
    }
    return response;
  },
  scheduled:monetizationWorkerV9.scheduled,
  queue:monetizationWorkerV9.queue
} satisfies ExportedHandler<Env>;
