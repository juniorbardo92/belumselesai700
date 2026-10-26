import monetizationWorkerV4 from './monetization-worker-v4';
import { monetizationDashboardHtml } from './monetization-dashboard';
import { runLearning } from './monetization-learning';

type QueueMessage={kind:'operational_probe'|'integration_event';correlationId:string;metadata?:Record<string,unknown>};
type Env={DB:D1Database;MONETIZATION_QUEUE?:Queue<QueueMessage>;MONETIZATION_INGEST_TOKEN?:string;LYNK_WEBHOOK_SECRET?:string;DEEPSEEK_API_KEY?:string;DEEPSEEK_MODEL?:string;MONETIZATION_AI_ENABLED?:string};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
function authorized(request:Request,env:Env){return Boolean(env.MONETIZATION_INGEST_TOKEN)&&request.headers.get('Authorization')===`Bearer ${env.MONETIZATION_INGEST_TOKEN}`;}
function isQueueMessage(value:unknown):value is QueueMessage{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const row=value as Record<string,unknown>;
 return (row.kind==='operational_probe'||row.kind==='integration_event')&&typeof row.correlationId==='string'&&row.correlationId.length>0;
}
async function recordCron(env:Env,status:string,metadata:unknown,error?:string){
  await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,error_message,metadata_json) VALUES ('system','daily_revenue_learning',?1,?2,?3)`)
    .bind(status,error??null,JSON.stringify(metadata??{})).run();
}
async function recordQueue(env:Env,message:QueueMessage){
  await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,correlation_id,metadata_json) VALUES ('system',?1,'success',?2,?3)`)
    .bind(message.kind==='operational_probe'?'queue_probe':'queue_integration_event',message.correlationId,JSON.stringify(message.metadata??{})).run();
}
export default{
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  if(request.method==='GET'&&(url.pathname==='/dashboard'||url.pathname==='/monetization'))return new Response(monetizationDashboardHtml,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'}});
  if(request.method==='POST'&&url.pathname==='/api/monetization/queue/probe'){
   if(!authorized(request,env))return json({ok:false,error:'Unauthorized'},401);
   if(!env.MONETIZATION_QUEUE)return json({ok:false,error:'Queue binding belum tersedia.'},503);
   const body:Record<string,unknown>=await request.json<Record<string,unknown>>().catch(()=>({} as Record<string,unknown>));
   const rawCorrelation=body.correlationId;
   const correlationId=typeof rawCorrelation==='string'&&rawCorrelation.trim()?rawCorrelation.trim().slice(0,180):`queue-probe-${crypto.randomUUID()}`;
   await env.MONETIZATION_QUEUE.send({kind:'operational_probe',correlationId,metadata:{receivedAt:new Date().toISOString()}});
   return json({ok:true,queued:true,correlationId},202);
  }
  return monetizationWorkerV4.fetch(request,env);
 },
 async scheduled(controller:ScheduledController,env:Env,ctx:ExecutionContext):Promise<void>{
  ctx.waitUntil((async()=>{
   try{
    const result=await runLearning(env,new URL('https://internal.local/api/monetization/learning/run?days=30'));
    const body=result.body as Record<string,unknown>;
    await recordCron(env,result.status>=200&&result.status<300?'success':'error',{cron:controller.cron,status:result.status,skipped:body?.skipped??false,storedInsights:body?.storedInsights??0},result.status>=400?String(body?.error??'learning_failed'):undefined);
   }catch(error){
    await recordCron(env,'error',{cron:controller.cron},error instanceof Error?error.message:'unknown cron error');
   }
  })());
 },
 async queue(batch:MessageBatch<unknown>,env:Env):Promise<void>{
  for(const message of batch.messages){
   if(!isQueueMessage(message.body)){message.ack();continue;}
   try{await recordQueue(env,message.body);message.ack();}
   catch{message.retry();}
  }
 }
} satisfies ExportedHandler<Env>;
