import monetizationWorkerV6 from './monetization-worker-v6';
import { commandReport } from './monetization-operations';
import { learningContext } from './monetization-learning';

type QueueMessage={kind:'operational_probe'|'integration_event';correlationId:string;metadata?:Record<string,unknown>};
type Env={
  DB:D1Database;
  CONTENT_OS:Fetcher;
  MONETIZATION_QUEUE?:Queue<QueueMessage>;
  MONETIZATION_INGEST_TOKEN?:string;
  LYNK_WEBHOOK_SECRET?:string;
  TELEGRAM_WEBHOOK_SECRET?:string;
  DEEPSEEK_API_KEY?:string;
  DEEPSEEK_MODEL?:string;
  MONETIZATION_AI_ENABLED?:string;
};

type TelegramMessage={message_id?:number;chat?:{id?:number|string};text?:string};
type TelegramUpdate={update_id?:number;message?:TelegramMessage};

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}

function telegramAuthorized(request:Request,env:Env):boolean{
  return Boolean(env.TELEGRAM_WEBHOOK_SECRET)&&request.headers.get('X-Telegram-Bot-Api-Secret-Token')===env.TELEGRAM_WEBHOOK_SECRET;
}

function commandName(text:string):string{
  return text.trim().split(/\s+/)[0]?.toLowerCase().replace(/@[^\s]+$/,'')??'';
}

function telegramReply(chatId:number|string,text:string):Response{
  return json({method:'sendMessage',chat_id:chatId,text,parse_mode:'HTML',disable_web_page_preview:true});
}

function esc(value:unknown):string{
  return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function compactRows(rows:unknown,limit=5):string{
  if(!Array.isArray(rows)||rows.length===0)return 'Belum ada data.';
  return rows.slice(0,limit).map((row,index)=>{
    const x=row&&typeof row==='object'&&!Array.isArray(row)?row as Record<string,unknown>:{};
    const name=x.name??x.title??x.id??`#${index+1}`;
    const margin=Number(x.contributionMarginRecorded??x.profit??0);
    return `${index+1}. ${esc(name)} — margin tercatat Rp${new Intl.NumberFormat('id-ID').format(margin)}`;
  }).join('\n');
}

async function handleTelegram(request:Request,env:Env):Promise<Response>{
  if(!env.TELEGRAM_WEBHOOK_SECRET)return json({ok:false,error:'Telegram command center belum diaktifkan.'},503);
  if(!telegramAuthorized(request,env))return json({ok:false,error:'Unauthorized'},401);

  const update=await request.json<TelegramUpdate>().catch(()=>({} as TelegramUpdate));
  const message=update.message;
  const chatId=message?.chat?.id;
  const text=typeof message?.text==='string'?message.text.trim():'';
  if(chatId===undefined||!text)return json({ok:true,ignored:true});

  const command=commandName(text);
  if(command==='/help'||command==='/start'){
    return telegramReply(chatId,'<b>UMKM Content OS</b>\n/revenue — ledger 30 hari\n/profit — margin kontribusi tercatat\n/offers — top offer\n/content — top content\n/health — integration health\n/learning — revenue learning untuk riset berikutnya');
  }

  if(command==='/learning'){
    const result=await learningContext(env);
    const body=result.body as Record<string,unknown>;
    const insights=Array.isArray(body.insights)?body.insights:[];
    const lines=insights.slice(0,5).map((item,index)=>{
      const row=item&&typeof item==='object'&&!Array.isArray(item)?item as Record<string,unknown>:{};
      return `${index+1}. ${esc(row.statement??'Insight')}`;
    });
    return telegramReply(chatId,`<b>Revenue Learning</b>\n${lines.join('\n')||'Belum ada insight aktif.'}`);
  }

  const queryMap:Record<string,string>={
    '/revenue':'revenue',
    '/profit':'profit',
    '/offers':'offer',
    '/content':'content',
    '/health':'health'
  };
  const query=queryMap[command];
  if(!query)return telegramReply(chatId,'Perintah tidak dikenal. Gunakan /help.');

  const internalRequest=new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,days:30})});
  const result=await commandReport(internalRequest,env);
  const body=result.body as Record<string,unknown>;
  if(result.status>=400)return telegramReply(chatId,'Command gagal diproses.');

  if(body.type==='revenue'){
    const data=(body.data??{}) as Record<string,unknown>;
    const f=(v:unknown)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v??0));
    return telegramReply(chatId,`<b>Revenue · 30 hari</b>\nOmzet tercatat: ${f(data.gross)}\nPenerimaan bersih tercatat: ${f(data.net)}\nMargin kontribusi tercatat: ${f(data.contributionMarginRecorded??data.profit)}\nEntri ledger: ${Number(data.transactions??0)}\nBukan laba bersih akuntansi.`);
  }
  if(body.type==='offers')return telegramReply(chatId,`<b>Top Offers</b>\n${compactRows(body.data)}`);
  if(body.type==='content')return telegramReply(chatId,`<b>Top Content</b>\n${compactRows(body.data)}`);
  if(body.type==='health'){
    const errors=Array.isArray(body.data)?body.data:[];
    return telegramReply(chatId,errors.length?`<b>Health</b>\n${errors.slice(0,5).map((e)=>esc(JSON.stringify(e))).join('\n')}`:'<b>Health</b>\nTidak ada error terbaru.');
  }
  return telegramReply(chatId,'Command selesai.');
}

export default{
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname==='/api/monetization/telegram/webhook')return handleTelegram(request,env);
    if(request.method==='GET'&&url.pathname==='/api/monetization/telegram/runtime'){
      if(!env.MONETIZATION_INGEST_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.MONETIZATION_INGEST_TOKEN}`)return json({ok:false,error:'Unauthorized'},401);
      return json({ok:true,configured:Boolean(env.TELEGRAM_WEBHOOK_SECRET),mode:'single-bot-read-only-command-center',commands:['/revenue','/profit','/offers','/content','/health','/learning'],publishing:false});
    }
    return monetizationWorkerV6.fetch(request,env);
  },
  scheduled:monetizationWorkerV6.scheduled,
  queue:monetizationWorkerV6.queue
} satisfies ExportedHandler<Env>;
