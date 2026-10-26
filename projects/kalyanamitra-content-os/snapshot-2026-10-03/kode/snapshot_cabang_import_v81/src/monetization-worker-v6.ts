import monetizationWorkerV5 from './monetization-worker-v5';
import { commandReport } from './monetization-operations';
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

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}

async function verifyOpenClaw(request:Request,env:Env):Promise<boolean>{
  const authorization=request.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer ')) return false;
  const verifyRequest=new Request('https://content-os.internal/api/internal/openclaw/verify',{
    method:'POST',
    headers:{Authorization:authorization}
  });
  const response=await env.CONTENT_OS.fetch(verifyRequest);
  if(response.status!==200)return false;
  const body:Record<string,unknown>=await response.json<Record<string,unknown>>().catch(()=>({} as Record<string,unknown>));
  return body.ok===true&&body.principal==='openclaw';
}

export default{
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);

    if(request.method==='POST'&&url.pathname==='/api/monetization/openclaw/command'){
      if(!(await verifyOpenClaw(request,env)))return json({ok:false,error:'Unauthorized'},401);
      const result=await commandReport(request,env);
      return json(result.body,result.status);
    }

    if(request.method==='GET'&&url.pathname==='/api/monetization/openclaw/context'){
      if(!(await verifyOpenClaw(request,env)))return json({ok:false,error:'Unauthorized'},401);
      const result=await learningContext(env);
      const body=result.body as Record<string,unknown>;
      return json({
        ok:result.status>=200&&result.status<300,
        role:'revenue-learning-feedback',
        consumer:'openclaw-hermes-research-loop',
        insights:body.insights??[],
        guidance:body.guidance??{},
        policy:{researchAssistant:'Hermes',contentAssistant:'DeepSeek',publisher:'Repliz draft-only'}
      },result.status);
    }

    if(request.method==='GET'&&url.pathname==='/api/monetization/openclaw/runtime'){
      if(!env.MONETIZATION_INGEST_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.MONETIZATION_INGEST_TOKEN}`){
        return json({ok:false,error:'Unauthorized'},401);
      }
      const response=await env.CONTENT_OS.fetch(new Request('https://content-os.internal/api/status'));
      return json({
        ok:response.status===200,
        serviceBinding:response.status===200,
        openClawVerifier:'configured-on-content-os',
        revenueCommand:'ready',
        revenueLearningContext:'ready',
        externalCallerAcceptance:'pending-real-openclaw-request'
      },response.status===200?200:503);
    }

    return monetizationWorkerV5.fetch(request,env);
  },
  scheduled: monetizationWorkerV5.scheduled,
  queue: monetizationWorkerV5.queue
} satisfies ExportedHandler<Env>;
