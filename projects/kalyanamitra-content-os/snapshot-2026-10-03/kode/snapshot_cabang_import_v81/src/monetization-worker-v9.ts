import monetizationWorkerV8 from './monetization-worker-v8';

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

type EvidenceRow={
  operation:string;
  status:string;
  correlation_id:string|null;
  metadata_json:string;
  created_at:string;
};

type UpstreamResult={
  status:number;
  body:Record<string,unknown>;
};

const OBSERVED_ROUTES=new Map<string,string>([
  ['/api/monetization/openclaw/command','command'],
  ['/api/monetization/openclaw/context','learning_context'],
  ['/api/monetization/openclaw/telegram-manifest','telegram_manifest']
]);
const ALLOWED_COMMANDS=new Set(['revenue','profit','offer','offers','content','health','learning','learning-context']);
const ALLOWED_INTERFACES=new Set(['telegram','agent','web']);

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

function safeHeader(request:Request,name:string,max=160):string|null{
  const value=request.headers.get(name)?.trim();
  if(!value)return null;
  return value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max)||null;
}

async function opaqueCorrelation(...candidates:Array<string|null>):Promise<string>{
  const source=candidates.find((value):value is string=>Boolean(value))??crypto.randomUUID();
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  const hex=Array.from(new Uint8Array(digest)).map((byte)=>byte.toString(16).padStart(2,'0')).join('');
  return `oc-${hex.slice(0,32)}`;
}

async function safeCommand(request:Request):Promise<string|null>{
  try{
    const body=await request.json<Record<string,unknown>>();
    const raw=typeof body.query==='string'?body.query.trim().toLowerCase():'';
    return ALLOWED_COMMANDS.has(raw)?raw:null;
  }catch{
    return null;
  }
}

function parseMetadata(value:string):Record<string,unknown>{
  try{
    const parsed=JSON.parse(value);
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};
  }catch{
    return {};
  }
}

async function parseUpstream(response:Response):Promise<UpstreamResult>{
  const body=await response.json<Record<string,unknown>>().catch(()=>({}));
  return {status:response.status,body};
}

async function contentOsAutomationStatus(env:Env):Promise<UpstreamResult>{
  try{
    const response=await env.CONTENT_OS.fetch(new Request('https://content-os.internal/api/automation/status'));
    return parseUpstream(response);
  }catch{
    return {status:502,body:{ok:false,error:'Content OS automation status unavailable.'}};
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

async function recordOpenClawEvidence(
  request:Request,
  env:Env,
  operation:string,
  responseStatus:number
):Promise<void>{
  const externalRunId=safeHeader(request,'X-OpenClaw-Run-Id');
  const suppliedCorrelation=safeHeader(request,'X-Correlation-Id');
  const rawInterface=safeHeader(request,'X-OpenClaw-Interface',40)?.toLowerCase()??null;
  const interfaceName=rawInterface&&ALLOWED_INTERFACES.has(rawInterface)?rawInterface:null;
  const telegramUpdatePresent=Boolean(safeHeader(request,'X-Telegram-Update-Id',80));
  const correlationId=await opaqueCorrelation(externalRunId,suppliedCorrelation);
  const command=operation==='command'?await safeCommand(request):null;
  const metadata={
    evidenceVersion:'1.0',
    route:new URL(request.url).pathname,
    responseStatus,
    command,
    interface:interfaceName,
    externalRunIdPresent:Boolean(externalRunId),
    suppliedCorrelationPresent:Boolean(suppliedCorrelation),
    telegramUpdateIdPresent:telegramUpdatePresent,
    identifiersStoredAs:'sha256-prefix',
    piiStored:false,
    recordedAt:new Date().toISOString()
  };

  await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,error_code,error_message,correlation_id,metadata_json)
    VALUES ('openclaw',?1,'success',NULL,NULL,?2,?3)`)
    .bind(operation,correlationId,JSON.stringify(metadata)).run();
}

async function readOpenClawEvidence(request:Request,env:Env):Promise<Response>{
  if(!env.MONETIZATION_INGEST_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.MONETIZATION_INGEST_TOKEN}`){
    return json({ok:false,error:'Unauthorized'},401);
  }

  const [result,automation]=await Promise.all([
    env.DB.prepare(`SELECT operation,status,correlation_id,metadata_json,created_at
      FROM monetization_integration_logs
      WHERE provider='openclaw'
      ORDER BY id DESC
      LIMIT 50`).all<EvidenceRow>(),
    contentOsAutomationStatus(env)
  ]);

  const evidence=(result.results??[]).map((row)=>({
    operation:row.operation,
    status:row.status,
    correlationId:row.correlation_id,
    createdAt:row.created_at,
    metadata:parseMetadata(row.metadata_json)
  }));
  const realExternal=evidence.filter((item)=>
    item.metadata.externalRunIdPresent===true||
    item.metadata.interface==='telegram'||
    item.metadata.telegramUpdateIdPresent===true
  );

  return json({
    ok:true,
    policy:{
      provider:'openclaw',
      readOnly:true,
      piiStored:false,
      identifiersStoredAs:'sha256-prefix',
      externalEvidenceRequires:'X-OpenClaw-Run-Id or Telegram interface evidence'
    },
    counts:{total:evidence.length,externalRuntime:realExternal.length},
    contentOsAutomation:{httpStatus:automation.status,...automation.body},
    latest:evidence.slice(0,20),
    latestExternal:realExternal.slice(0,20)
  });
}

async function openClawAutomationStatus(request:Request,env:Env):Promise<Response>{
  if(!(await verifyOpenClaw(request,env)))return json({ok:false,error:'Unauthorized'},401);
  const upstream=await contentOsAutomationStatus(env);
  return json({
    ok:upstream.status>=200&&upstream.status<300,
    source:'content-os-service-binding',
    automation:upstream.body
  },upstream.status>=200&&upstream.status<300?200:502);
}

async function enrichManifest(response:Response):Promise<Response>{
  if(!response.ok)return response;
  const body=await response.clone().json<Record<string,unknown>>().catch(()=>null);
  if(!body)return response;
  const routes=body.routes&&typeof body.routes==='object'&&!Array.isArray(body.routes)?body.routes as Record<string,unknown>:{};
  return json({
    ...body,
    routes:{
      ...routes,
      automationStatus:'/api/monetization/openclaw/automation-status'
    },
    evidence:{
      optionalHeaders:{
        'X-OpenClaw-Run-Id':'opaque external runtime execution id; stored only as a hash prefix',
        'X-Correlation-Id':'opaque cross-service correlation id; stored only as a hash prefix',
        'X-OpenClaw-Interface':'telegram for Telegram-originated commands',
        'X-Telegram-Update-Id':'presence only; value and chat id are not stored'
      },
      piiStored:false,
      identifiersStoredAs:'sha256-prefix'
    }
  },response.status);
}

export default{
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);

    if(request.method==='GET'&&url.pathname==='/api/monetization/openclaw/evidence'){
      return readOpenClawEvidence(request,env);
    }

    if(request.method==='GET'&&url.pathname==='/api/monetization/openclaw/automation-status'){
      const observed=request.clone();
      const response=await openClawAutomationStatus(request as never,env);
      if(response.ok){
        ctx.waitUntil(recordOpenClawEvidence(observed as never,env,'automation_status',response.status).catch(()=>undefined));
      }
      return response;
    }

    const operation=OBSERVED_ROUTES.get(url.pathname);
    const observedRequest=operation?request.clone():null;
    const response=await monetizationWorkerV8.fetch(request as never,env);

    if(operation&&observedRequest&&response.status>=200&&response.status<300){
      ctx.waitUntil(recordOpenClawEvidence(observedRequest as never,env,operation,response.status).catch(()=>undefined));
    }

    if(url.pathname==='/api/monetization/openclaw/telegram-manifest'){
      return enrichManifest(response);
    }

    return response;
  },
  scheduled:monetizationWorkerV8.scheduled,
  queue:monetizationWorkerV8.queue
} satisfies ExportedHandler<Env>;
