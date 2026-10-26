import monetizationWorkerV14 from './monetization-worker-v14';
import { createAppHandoff } from './monetization-app';
import { aggregatedDataset } from './monetization-learning';
import {
  bodyWithinLimit,
  cleanString,
  dailyAnalytics,
  hardeningAuthorized,
  issueAppInstallReceipt,
  materializeDailyAnalytics,
  qualityReviewQueue,
  qualityAuthorized,
  rateAllowed,
  recordLatestRedirectTouchpoint,
  recordMaintenance,
  recordTouchpoint,
  retentionPreview,
  secretDomainStatus,
  upsertRecordQuality,
  verifyAppInstallReceipt
} from './monetization-hardening-v15';

type QueueMessage={
  kind:'operational_probe'|'integration_event'|'openclaw_research_retry';
  correlationId:string;
  [key:string]:unknown;
};

type VersionMetadata={id?:string;tag?:string;timestamp?:string};

type Env={
  DB:D1Database;
  CONTENT_OS:Fetcher;
  MONETIZATION_QUEUE?:Queue<QueueMessage>;
  MONETIZATION_INGEST_TOKEN?:string;
  MONETIZATION_QUALITY_TOKEN?:string;
  APP_RECEIPT_SECRET?:string;
  LYNK_WEBHOOK_SECRET?:string;
  DEEPSEEK_API_KEY?:string;
  DEEPSEEK_MODEL?:string;
  MONETIZATION_AI_ENABLED?:string;
  MONETIZATION_V15_MAINTENANCE_ENABLED?:string;
  CF_VERSION_METADATA?:VersionMetadata;
};

type JsonRecord=Record<string,unknown>;
type LinkRow={id:string;slug:string;platform:string|null;content_item_id:string|null;campaign_id:string|null;offer_id:string|null};
type Origin='website'|'instagram'|'threads'|'tiktok'|'direct_or_unknown';
type RequestHeaders={headers:Headers};

const VERSION='1.1.0-hardening-v15-candidate';
const DASHBOARD_URL='https://umkm-content-os.ruang-belajar-mandiri01.workers.dev/monetization';
const APP_INSTANCE_PATTERN=/^[a-f0-9]{64}$/;
const APP_VERSION_PATTERN=/^[0-9A-Za-z._+\-]{1,40}$/;
const APP_CLIENT_HEADER='panglima-umkm-android';

function isRecord(value:unknown):value is JsonRecord{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}

function json(data:unknown,status=200,source?:Response,extra?:HeadersInit):Response{
  const headers=new Headers(source?.headers);
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('X-Frame-Options','DENY');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  headers.delete('Content-Length');
  new Headers(extra).forEach((value,key)=>headers.set(key,value));
  return new Response(JSON.stringify(data),{status,headers});
}

function hostname(value:string|null):string|null{
  if(!value)return null;
  try{return new URL(value).hostname.toLowerCase().replace(/^www\./,'');}catch{return null;}
}

function recognizedHint(url:URL):Origin|null{
  const raw=(url.searchParams.get('src')??url.searchParams.get('utm_source')??'').trim().toLowerCase();
  if(raw==='website'||raw==='instagram'||raw==='threads'||raw==='tiktok')return raw;
  return null;
}

function classifyOrigin(request:RequestHeaders,url:URL):{
  origin:Origin;referrerRecognized:boolean;userAgentRecognized:boolean;sourceHint:Origin|null;
}{
  const ref=hostname(request.headers.get('Referer'));
  const ua=(request.headers.get('User-Agent')??'').toLowerCase();
  const hint=recognizedHint(url);
  let refOrigin:Origin|null=null;
  if(ref==='umkmnaikkelas.id')refOrigin='website';
  else if(ref==='instagram.com'||ref==='l.instagram.com')refOrigin='instagram';
  else if(ref==='threads.net'||ref==='threads.com')refOrigin='threads';
  else if(ref==='tiktok.com'||ref==='vm.tiktok.com'||ref==='vt.tiktok.com')refOrigin='tiktok';
  let uaOrigin:Origin|null=null;
  if(/\binstagram\b/.test(ua))uaOrigin='instagram';
  else if(/\bthreads\b/.test(ua))uaOrigin='threads';
  else if(/\btiktok\b|musical_ly|bytedance/.test(ua))uaOrigin='tiktok';
  return {origin:refOrigin??uaOrigin??hint??'direct_or_unknown',referrerRecognized:Boolean(refOrigin),userAgentRecognized:Boolean(uaOrigin),sourceHint:hint};
}

async function recordTrackedOrigin(request:RequestHeaders,url:URL,env:Env,slug:string):Promise<void>{
  const link=await env.DB.prepare(`SELECT l.id,l.slug,l.platform,l.content_item_id,l.campaign_id,COALESCE(l.offer_id,c.offer_id) offer_id
    FROM monetization_tracked_links l LEFT JOIN monetization_campaigns c ON c.id=l.campaign_id AND c.brand_id=l.brand_id
    WHERE l.brand_id='brand-umkm-naik-kelas' AND l.slug=?1 AND l.status='active'`)
    .bind(slug).first<LinkRow>();
  if(!link)return;
  const evidence=classifyOrigin(request,url);
  await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,error_code,error_message,correlation_id,metadata_json)
    VALUES ('tracking','tracked_origin',?1,NULL,NULL,?2,?3)`).bind(
      evidence.origin==='direct_or_unknown'?'warning':'success',link.id,
      JSON.stringify({evidenceVersion:'1.1',trackedLinkId:link.id,slug:link.slug,configuredPlatform:link.platform,
        contentItemId:link.content_item_id,campaignId:link.campaign_id,offerId:link.offer_id,detectedOrigin:evidence.origin,
        referrerRecognized:evidence.referrerRecognized,userAgentRecognized:evidence.userAgentRecognized,sourceHint:evidence.sourceHint,
        rawReferrerStored:false,rawUserAgentStored:false,piiStored:false,recordedAt:new Date().toISOString()})
    ).run();
}

async function parsedJsonClone(request:Request):Promise<JsonRecord|null>{
  try{const parsed:unknown=await request.clone().json();return isRecord(parsed)?parsed:null;}catch{return null;}
}

async function publicAppHandoff(request:Request,env:Env):Promise<Response>{
  const contentType=(request.headers.get('Content-Type')??'').toLowerCase();
  if(!contentType.startsWith('application/json'))return json({ok:false,error:'Content-Type harus application/json.'},415);
  if(request.headers.get('X-Panglima-Client')!==APP_CLIENT_HEADER)return json({ok:false,error:'Client handoff tidak dikenali.'},403);
  if(!await bodyWithinLimit(request,2048))return json({ok:false,error:'Payload terlalu besar.'},413);
  if(!await rateAllowed(request,env,60))return json({ok:false,error:'Rate limit terlampaui.'},429,undefined,{'Retry-After':'60'});
  const body=await parsedJsonClone(request);
  if(!body)return json({ok:false,error:'Body JSON harus object.'},400);
  const allowed=new Set(['appInstanceId','appVersion','offerId','installReceipt']);
  if(Object.keys(body).some((key)=>!allowed.has(key)))return json({ok:false,error:'Field handoff tidak diizinkan.'},400);
  const appInstanceId=cleanString(body.appInstanceId,180)?.toLowerCase()??'';
  const appVersion=cleanString(body.appVersion,40)??'';
  const offerId=cleanString(body.offerId,100)??'';
  const receipt=cleanString(body.installReceipt,2000)??'';
  if(!APP_INSTANCE_PATTERN.test(appInstanceId)||!APP_VERSION_PATTERN.test(appVersion)||!offerId||!receipt){
    return json({ok:false,error:'Kontrak handoff tidak valid.'},400);
  }
  const proof=await verifyAppInstallReceipt(receipt,env);
  if(!proof||proof.appInstanceId!==appInstanceId||proof.appVersion!==appVersion)return json({ok:false,error:'Install receipt tidak valid atau kedaluwarsa.'},401);
  const install=await env.DB.prepare(`SELECT id FROM monetization_events WHERE id=?1 AND brand_id='brand-umkm-naik-kelas'
    AND event_type='app_install' AND source='apk' AND platform='app' AND visitor_id=?2
    AND json_extract(metadata_json,'$.appVersion')=?3`).bind(String(proof.eventId),appInstanceId,appVersion).first();
  if(!install)return json({ok:false,error:'Install evidence tidak cocok.'},401);
  const safeRequest=new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    appInstanceId,appVersion,offerId,idempotencyKey:`apk-handoff:${proof.eventId}:${offerId}`
  })});
  const result=await createAppHandoff(safeRequest,env);
  const resultBody=isRecord(result.body)?result.body:{};
  if(result.status<300&&typeof resultBody.eventId==='string'&&typeof resultBody.eventType==='string'){
    await recordTouchpoint(resultBody.eventId,resultBody.eventType,{visitorId:appInstanceId,offerId,platform:'app'},env).catch((error)=>{
      console.error(JSON.stringify({message:'v15_app_handoff_touchpoint_failed',eventId:resultBody.eventId,error:error instanceof Error?error.message:'unknown'}));
    });
  }
  return json(result.body,result.status);
}

async function maintenanceAggregate(request:Request,env:Env):Promise<Response>{
  if(!hardeningAuthorized(request,env))return json({ok:false,error:'Unauthorized'},401);
  if(!await bodyWithinLimit(request,4096))return json({ok:false,error:'Payload terlalu besar.'},413);
  const body=await parsedJsonClone(request)??{};
  const correlationId=cleanString(body.correlationId,160)??`aggregate-${crypto.randomUUID()}`;
  try{
    const result=await materializeDailyAnalytics(env,Number(body.days));
    await recordMaintenance(env,'daily_analytics_materialize','success',correlationId,result).catch((error)=>{
      console.error(JSON.stringify({message:'v15_maintenance_log_failed',correlationId,error:error instanceof Error?error.message:'unknown'}));
    });
    return json({ok:true,correlationId,...result});
  }catch(error){
    const message=error instanceof Error?error.message:'unknown';
    await recordMaintenance(env,'daily_analytics_materialize','error',correlationId,{},message).catch(()=>{});
    return json({ok:false,error:'Materialisasi analytics gagal.',correlationId},500);
  }
}

export default{
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);

    if(request.method==='GET'&&(url.pathname==='/dashboard'||url.pathname==='/monetization')){
      return new Response(null,{status:302,headers:{Location:DASHBOARD_URL,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    }
    if(request.method==='GET'&&url.pathname==='/api/monetization/version'){
      return json({ok:true,version:VERSION,mode:'additive-only',runtimeVersion:env.CF_VERSION_METADATA??null,
        retentionMode:'preview-only',dashboardMode:'access-protected-server-rendered',securityConfiguration:secretDomainStatus(env)});
    }
    if(request.method==='GET'&&url.pathname==='/api/monetization/daily-analytics'){
      if(!hardeningAuthorized(request,env))return json({ok:false,error:'Unauthorized'},401);
      try{const data=await dailyAnalytics(env,url);return json({ok:true,periodDays:data.days,snapshot:data.snapshot,
        dataScope:data.dataScope,materializationRequired:data.materializationRequired,freshness:data.freshness,
        rows:data.rows,totals:data.totals,accountingProfit:null});}
      catch{return json({ok:false,error:'Analytics hardening belum siap; migration 0006 wajib diterapkan.'},503);}
    }
    if(request.method==='GET'&&url.pathname==='/api/monetization/learning/dataset'){
      if(!hardeningAuthorized(request,env))return json({ok:false,error:'Unauthorized'},401);
      const days=Math.max(7,Math.min(365,Math.round(Number(url.searchParams.get('days'))||30)));
      try{return json({ok:true,dataset:await aggregatedDataset(env,days)});}
      catch{return json({ok:false,error:'Dataset learning belum dapat dihitung.'},503);}
    }
    if(request.method==='GET'&&url.pathname==='/api/monetization/quality/review'){
      if(!qualityAuthorized(request,env))return json({ok:false,error:'Unauthorized'},401);
      try{return json({ok:true,...await qualityReviewQueue(env,url)});}catch{return json({ok:false,error:'Quality review queue belum siap; migration 0007 dan 0008 wajib diterapkan.'},503);}
    }
    if(request.method==='POST'&&url.pathname==='/api/monetization/app/handoff')return publicAppHandoff(request,env);
    if(request.method==='POST'&&url.pathname==='/api/monetization/maintenance/aggregate')return maintenanceAggregate(request,env);
    if(request.method==='POST'&&url.pathname==='/api/monetization/maintenance/retention/preview'){
      if(!hardeningAuthorized(request,env))return json({ok:false,error:'Unauthorized'},401);
      try{return json({ok:true,...await retentionPreview(env)});}catch{return json({ok:false,error:'Retention preview belum siap.'},503);}
    }
    const qualityMatch=url.pathname.match(/^\/api\/monetization\/quality\/(event|revenue_event|learning_insight)\/([^/]+)$/);
    if(request.method==='PUT'&&qualityMatch?.[1]&&qualityMatch[2]){
      if(!qualityAuthorized(request,env))return json({ok:false,error:'Unauthorized'},401);
      if(!await bodyWithinLimit(request,8192))return json({ok:false,error:'Payload terlalu besar.'},413);
      try{return json({ok:true,quality:await upsertRecordQuality(request,env,qualityMatch[1],decodeURIComponent(qualityMatch[2]))});}
      catch(error){return json({ok:false,error:error instanceof Error?error.message:'Quality update gagal.'},400);}
    }

    const guardedPosts=request.method==='POST'&&[
      '/api/monetization/events','/api/monetization/revenue','/api/monetization/webhooks/lynk',
      '/api/monetization/affiliate/conversions','/api/monetization/app/install'
    ].includes(url.pathname);
    if(request.method==='POST'&&url.pathname==='/api/monetization/webhooks/lynk'&&
      !secretDomainStatus(env).lynkWebhookSecretIsolated){
      return json({ok:false,error:'Konfigurasi secret webhook belum terisolasi.'},503);
    }
    if(guardedPosts){
      const maxBytes=url.pathname==='/api/monetization/app/install'?2048:32768;
      if(!await bodyWithinLimit(request,maxBytes))return json({ok:false,error:'Payload terlalu besar.'},413);
      if((url.pathname==='/api/monetization/app/install'||url.pathname==='/api/monetization/webhooks/lynk')&&
        !await rateAllowed(request,env,url.pathname==='/api/monetization/app/install'?60:300)){
        return json({ok:false,error:'Rate limit terlampaui.'},429,undefined,{'Retry-After':'60'});
      }
    }

    const eventBody=request.method==='POST'&&url.pathname==='/api/monetization/events'?await parsedJsonClone(request):null;
    const installBody=request.method==='POST'&&url.pathname==='/api/monetization/app/install'?await parsedJsonClone(request):null;
    const goMatch=url.pathname.match(/^\/go\/([a-z0-9_-]{4,80})$/i);
    const response=await monetizationWorkerV14.fetch(request as never,env as never,ctx as never);

    if(eventBody&&response.ok){
      const parsed:unknown=await response.clone().json().catch(()=>null);
      if(isRecord(parsed)&&parsed.ok===true&&parsed.duplicate===false&&typeof parsed.eventId==='string'&&typeof eventBody.eventType==='string'){
        ctx.waitUntil(recordTouchpoint(parsed.eventId,eventBody.eventType,eventBody,env).catch((error)=>{
          console.error(JSON.stringify({message:'v15_touchpoint_write_failed',eventId:parsed.eventId,error:error instanceof Error?error.message:'unknown'}));
        }));
      }
    }
    if(request.method==='GET'&&goMatch?.[1]&&response.status===302){
      const slug=goMatch[1].toLowerCase();
      ctx.waitUntil(Promise.all([
        recordTrackedOrigin(request,url,env,slug),
        recordLatestRedirectTouchpoint(slug,request,env)
      ]).then(()=>undefined).catch((error)=>{
        console.error(JSON.stringify({message:'v15_tracked_evidence_failed',slug,error:error instanceof Error?error.message:'unknown'}));
      }));
    }
    if(installBody&&response.ok&&typeof installBody.appInstanceId==='string'&&typeof installBody.appVersion==='string'){
      const parsed:unknown=await response.clone().json().catch(()=>null);
      if(isRecord(parsed)&&parsed.ok===true&&typeof parsed.eventId==='string'){
        const normalizedInstance=cleanString(installBody.appInstanceId,180)?.toLowerCase()??'';
        const normalizedVersion=cleanString(installBody.appVersion,40)??'';
        const receipt=APP_INSTANCE_PATTERN.test(normalizedInstance)&&APP_VERSION_PATTERN.test(normalizedVersion)
          ?await issueAppInstallReceipt(normalizedInstance,normalizedVersion,parsed.eventId,env):null;
        return json({...parsed,handoffAvailable:Boolean(receipt),installReceipt:receipt,installReceiptTtlSeconds:receipt?86400:0},response.status,response);
      }
    }
    return response;
  },
  async scheduled(controller:ScheduledController,env:Env,ctx:ExecutionContext):Promise<void>{
    await monetizationWorkerV14.scheduled(controller as never,env as never,ctx as never);
    if(env.MONETIZATION_V15_MAINTENANCE_ENABLED!=='true')return;
    ctx.waitUntil((async()=>{
      const correlationId=`cron-v15-${new Date().toISOString()}`;
      try{
        const analytics=await materializeDailyAnalytics(env,35);
        const retention=await retentionPreview(env);
        await recordMaintenance(env,'daily_hardening','success',correlationId,{analytics,retention,cron:controller.cron});
      }catch(error){
        await recordMaintenance(env,'daily_hardening','error',correlationId,{cron:controller.cron},error instanceof Error?error.message:'unknown').catch(()=>{});
      }
    })());
  },
  queue:monetizationWorkerV14.queue
} satisfies ExportedHandler<Env>;
