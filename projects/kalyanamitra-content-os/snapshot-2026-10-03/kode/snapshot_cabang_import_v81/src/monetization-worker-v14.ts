import monetizationWorkerV13 from './monetization-worker-v13';
import { ingestAppEvent } from './monetization-app';

type QueueMessage={
  kind:'operational_probe'|'integration_event'|'openclaw_research_retry';
  correlationId:string;
  [key:string]:unknown;
};

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

const MAX_PUBLIC_INSTALL_BODY_BYTES=2048;
const APP_INSTANCE_PATTERN=/^[a-f0-9]{64}$/;
const APP_VERSION_PATTERN=/^[0-9A-Za-z._+\-]{1,40}$/;
const REQUIRED_CLIENT_HEADER='panglima-umkm-android';
const ALLOWED_KEYS=new Set(['appInstanceId','appVersion']);

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

async function publicPanglimaInstall(request:Request,env:Env):Promise<Response>{
  const contentType=(request.headers.get('Content-Type')??'').toLowerCase();
  if(!contentType.startsWith('application/json'))return json({ok:false,error:'Content-Type harus application/json.'},415);
  if(request.headers.get('X-Panglima-Client')!==REQUIRED_CLIENT_HEADER){
    return json({ok:false,error:'Client telemetry tidak dikenali.'},403);
  }

  const declared=Number(request.headers.get('Content-Length')??0);
  if(Number.isFinite(declared)&&declared>MAX_PUBLIC_INSTALL_BODY_BYTES){
    return json({ok:false,error:'Payload terlalu besar.'},413);
  }

  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_PUBLIC_INSTALL_BODY_BYTES){
    return json({ok:false,error:'Payload terlalu besar.'},413);
  }

  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{return json({ok:false,error:'Body JSON tidak valid.'},400);}
  if(!isRecord(parsed))return json({ok:false,error:'Body JSON harus object.'},400);
  if(Object.keys(parsed).some((key)=>!ALLOWED_KEYS.has(key))){
    return json({ok:false,error:'Field telemetry tidak diizinkan.'},400);
  }

  const appInstanceId=typeof parsed.appInstanceId==='string'?parsed.appInstanceId.trim().toLowerCase():'';
  const appVersion=typeof parsed.appVersion==='string'?parsed.appVersion.trim():'';
  if(!APP_INSTANCE_PATTERN.test(appInstanceId)){
    return json({ok:false,error:'appInstanceId pseudonymous tidak valid.'},400);
  }
  if(!APP_VERSION_PATTERN.test(appVersion)){
    return json({ok:false,error:'appVersion tidak valid.'},400);
  }

  const safeRequest=new Request('https://monetization.internal/api/monetization/app/events',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      eventType:'app_install',
      appInstanceId,
      appVersion,
      devicePlatform:'android',
      idempotencyKey:`panglima-install:${appInstanceId}:${appVersion}`,
      properties:{
        client:'panglima-umkm',
        telemetryVersion:'1.0',
        publicConstrained:true,
        financialFieldsAccepted:false,
        piiExpected:false
      }
    })
  });
  const result=await ingestAppEvent(safeRequest,env);
  const body=isRecord(result.body)?result.body:{};
  return json({
    ok:body.ok===true,
    accepted:true,
    duplicate:body.duplicate===true,
    eventId:typeof body.eventId==='string'?body.eventId:null,
    eventType:'app_install',
    privacy:{pseudonymous:true,piiStored:false},
    security:{financialFieldsAccepted:false,clientHeaderIsNotAuthentication:true}
  },result.status);
}

export default{
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname==='/api/monetization/app/install'){
      return publicPanglimaInstall(request,env);
    }
    return monetizationWorkerV13.fetch(request as never,env as never,ctx as never);
  },
  scheduled:monetizationWorkerV13.scheduled,
  queue:monetizationWorkerV13.queue
} satisfies ExportedHandler<Env>;
