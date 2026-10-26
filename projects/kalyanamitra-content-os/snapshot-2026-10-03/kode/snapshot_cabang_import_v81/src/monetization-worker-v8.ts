import monetizationWorkerV7 from './monetization-worker-v7';

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

const TELEGRAM_COMMANDS=[
  {command:'/revenue',intent:'revenue',description:'Revenue 30 hari'},
  {command:'/profit',intent:'profit',description:'Margin kontribusi tercatat 30 hari'},
  {command:'/offers',intent:'offer',description:'Top offer berdasarkan margin tercatat'},
  {command:'/content',intent:'content',description:'Top content berdasarkan margin tercatat'},
  {command:'/health',intent:'health',description:'Integration health'},
  {command:'/learning',intent:'learning-context',description:'Revenue learning untuk riset berikutnya'}
] as const;

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}

async function verifyOpenClaw(request:Request,env:Env):Promise<boolean>{
  const authorization=request.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer '))return false;
  const response=await env.CONTENT_OS.fetch(new Request('https://content-os.internal/api/internal/openclaw/verify',{
    method:'POST',headers:{Authorization:authorization}
  }));
  return response.status===200;
}

export default{
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);

    // Telegram transport belongs to OpenClaw. Direct provider webhooks are deliberately disabled.
    if(request.method==='POST'&&url.pathname==='/api/monetization/telegram/webhook'){
      return json({ok:false,error:'Direct Telegram webhook dinonaktifkan. Gunakan Telegram → OpenClaw → Monetization.'},410);
    }

    if(request.method==='GET'&&url.pathname==='/api/monetization/telegram/runtime'){
      if(!env.MONETIZATION_INGEST_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.MONETIZATION_INGEST_TOKEN}`){
        return json({ok:false,error:'Unauthorized'},401);
      }
      return json({
        ok:true,
        transport:'openclaw',
        singleBot:true,
        directWebhook:false,
        publishing:false,
        commands:TELEGRAM_COMMANDS.map(item=>item.command),
        externalBotRuntime:'pending-real-openclaw-telegram-runtime'
      });
    }

    if(request.method==='GET'&&url.pathname==='/api/monetization/openclaw/telegram-manifest'){
      if(!(await verifyOpenClaw(request,env)))return json({ok:false,error:'Unauthorized'},401);
      return json({
        ok:true,
        interface:'telegram',
        orchestrator:'openclaw',
        singleBot:true,
        publishing:false,
        commands:TELEGRAM_COMMANDS,
        routes:{
          report:'/api/monetization/openclaw/command',
          learning:'/api/monetization/openclaw/context'
        }
      });
    }

    return monetizationWorkerV7.fetch(request,env);
  },
  scheduled:monetizationWorkerV7.scheduled,
  queue:monetizationWorkerV7.queue
} satisfies ExportedHandler<Env>;
