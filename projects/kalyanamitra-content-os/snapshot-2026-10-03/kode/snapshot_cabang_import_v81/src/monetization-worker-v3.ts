import monetizationWorkerV2 from './monetization-worker-v2';
import { learningContext, learningStatus, runLearning } from './monetization-learning';

type Env = {
  DB: D1Database;
  MONETIZATION_INGEST_TOKEN?: string;
  LYNK_WEBHOOK_SECRET?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  MONETIZATION_AI_ENABLED?: string;
};

function json(data: unknown, status=200): Response {
  return new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
function authorized(request:Request,env:Env):boolean{
  if(!env.MONETIZATION_INGEST_TOKEN) return true;
  return request.headers.get('Authorization')===`Bearer ${env.MONETIZATION_INGEST_TOKEN}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/monetization/learning/status'){
      const result=await learningStatus(env); return json(result.body,result.status);
    }
    if(request.method==='GET'&&url.pathname==='/api/monetization/learning/context'){
      const result=await learningContext(env); return json(result.body,result.status);
    }
    if(request.method==='POST'&&url.pathname==='/api/monetization/learning/run'){
      if(!authorized(request,env)) return json({ok:false,error:'Unauthorized'},401);
      const result=await runLearning(env,url); return json(result.body,result.status);
    }
    return monetizationWorkerV2.fetch(request,env);
  }
} satisfies ExportedHandler<Env>;
