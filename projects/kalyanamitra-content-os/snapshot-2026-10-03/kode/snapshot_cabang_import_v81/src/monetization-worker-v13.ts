import monetizationWorkerV12 from './monetization-worker-v12';
import { upgradeBoundedLynkAttribution } from './monetization-bounded-attribution';

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

function isRecord(value:unknown):value is JsonRecord{
  return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
}

function json(data:unknown,status:number,source?:Response):Response{
  const headers=new Headers(source?.headers);
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  return new Response(JSON.stringify(data),{status,headers});
}

function authorized(request:Request,env:Env):boolean{
  return Boolean(env.MONETIZATION_INGEST_TOKEN)&&request.headers.get('Authorization')===`Bearer ${env.MONETIZATION_INGEST_TOKEN}`;
}

export default{
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    const reprocess=url.pathname.match(/^\/api\/monetization\/attribution\/reprocess\/([^/]+)$/);
    if(request.method==='POST'&&reprocess?.[1]){
      if(!authorized(request,env))return json({ok:false,error:'Unauthorized'},401);
      const revenueEventId=decodeURIComponent(reprocess[1]);
      try{
        const attribution=await upgradeBoundedLynkAttribution(revenueEventId,env);
        if(!attribution)return json({ok:false,error:'Revenue Lynk tidak ditemukan atau tidak eligible.'},404);
        return json({ok:true,revenueEventId,attribution},200);
      }catch(error){
        console.error(JSON.stringify({
          message:'bounded_lynk_attribution_reprocess_failed',
          revenueEventId,
          error:error instanceof Error?error.message:'unknown'
        }));
        return json({ok:false,error:'Attribution reprocess gagal.'},500);
      }
    }

    const isLynkWebhook=request.method==='POST'&&url.pathname==='/api/monetization/webhooks/lynk';
    const response=await monetizationWorkerV12.fetch(request as never,env as never,ctx as never);
    if(!isLynkWebhook||!response.ok)return response;

    const parsed:unknown=await response.clone().json().catch(()=>null);
    if(!isRecord(parsed)||parsed.ok!==true||parsed.duplicate!==false)return response;
    const revenueEventId=typeof parsed.revenueEventId==='string'?parsed.revenueEventId.trim():'';
    if(!revenueEventId)return response;

    try{
      const attribution=await upgradeBoundedLynkAttribution(revenueEventId,env);
      if(!attribution)return response;
      return json({...parsed,attribution},response.status,response);
    }catch(error){
      console.error(JSON.stringify({
        message:'bounded_lynk_attribution_failed',
        revenueEventId,
        error:error instanceof Error?error.message:'unknown'
      }));
      return response;
    }
  },
  scheduled:monetizationWorkerV12.scheduled,
  queue:monetizationWorkerV12.queue
} satisfies ExportedHandler<Env>;
