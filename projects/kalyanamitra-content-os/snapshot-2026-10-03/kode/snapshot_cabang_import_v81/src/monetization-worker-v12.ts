import monetizationWorkerV11 from './monetization-worker-v11';
import { handleExternalAcceptanceRoute } from './monetization-external-acceptance';

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

export default{
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const acceptance=await handleExternalAcceptanceRoute(request as never,env);
    if(acceptance)return acceptance;
    return monetizationWorkerV11.fetch(request as never,env as never,ctx as never);
  },
  scheduled:monetizationWorkerV11.scheduled,
  queue:monetizationWorkerV11.queue
} satisfies ExportedHandler<Env>;
