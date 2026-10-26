import { verifiedQualityFilter } from './monetization-quality';

export type HardeningEnv = {
  DB: D1Database;
  MONETIZATION_INGEST_TOKEN?: string;
  APP_RECEIPT_SECRET?: string;
  MONETIZATION_QUALITY_TOKEN?: string;
  LYNK_WEBHOOK_SECRET?: string;
  MONETIZATION_V15_MAINTENANCE_ENABLED?: string;
};

type JsonRecord = Record<string, unknown>;

const BRAND_ID = 'brand-umkm-naik-kelas';
const TOUCH_TYPES = new Set(['impression','click','landing_view','lead','checkout','affiliate_click']);
const APP_RECEIPT_TTL_SECONDS=24*60*60;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const REVENUE_CAS_COLUMNS=['id','transaction_id','event_type','source','brand_id','content_item_id','campaign_id','offer_id',
  'gross_amount','fee_amount','cost_amount','net_amount','margin_amount','currency','status','external_reference',
  'idempotency_key','metadata_json','occurred_at','created_at'] as const;

type AttributionCasEvidence={
  revenueEventId:string;
  attributionId:string|null;
  firstEventId:string|null;
  lastEventId:string|null;
  eventQuality:JsonRecord[];
};

function revenueCasGuard(
  records:JsonRecord[],source:string|null,transactionId:string|null,attributionEvidence:AttributionCasEvidence[],startIndex=11
):{sql:string;values:unknown[]}{
  let parameterIndex=startIndex;
  const values:unknown[]=[];
  const parameter=(value:unknown)=>{values.push(value??null);return `?${parameterIndex++}`;};
  const predicates=records.map((record)=>{
    const fields=REVENUE_CAS_COLUMNS.map((column)=>`${column} IS ${parameter(record[column])}`);
    return `EXISTS (SELECT 1 FROM monetization_revenue_events WHERE ${fields.join(' AND ')})`;
  });
  if(source&&transactionId){
    predicates.push(`(SELECT COUNT(*) FROM monetization_revenue_events
      WHERE brand_id=${parameter(BRAND_ID)} AND source=${parameter(source)} AND transaction_id=${parameter(transactionId)})=${parameter(records.length)}`);
  }
  for(const evidence of attributionEvidence){
    if(evidence.attributionId){
      predicates.push(`EXISTS (SELECT 1 FROM monetization_attributions
        WHERE id=${parameter(evidence.attributionId)} AND brand_id=${parameter(BRAND_ID)}
          AND revenue_event_id=${parameter(evidence.revenueEventId)}
          AND first_event_id IS ${parameter(evidence.firstEventId)} AND last_event_id IS ${parameter(evidence.lastEventId)})`);
    }else{
      predicates.push(`NOT EXISTS (SELECT 1 FROM monetization_attributions
        WHERE brand_id=${parameter(BRAND_ID)} AND revenue_event_id=${parameter(evidence.revenueEventId)})`);
    }
    for(const quality of evidence.eventQuality){
      predicates.push(`EXISTS (SELECT 1 FROM monetization_events e
        JOIN monetization_record_quality q ON q.record_type='event' AND q.record_id=e.id
        WHERE e.id=${parameter(quality.record_id)} AND e.brand_id=${parameter(BRAND_ID)}
          AND q.data_class='production' AND q.verification_status='verified'
          AND q.evidence_ref IS ${parameter(quality.evidence_ref)} AND q.reason IS ${parameter(quality.reason)}
          AND q.metadata_json IS ${parameter(quality.metadata_json)} AND q.updated_at IS ${parameter(quality.updated_at)})`);
    }
  }
  return {sql:predicates.length?predicates.join(' AND '):'0=1',values};
}

export function cleanString(value: unknown, max = 180): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function secureEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function secretDomainStatus(env:HardeningEnv):{
  ingestTokenConfigured:boolean;
  qualityTokenIsolated:boolean;
  appReceiptSecretIsolated:boolean;
  lynkWebhookSecretIsolated:boolean;
  allSecretsPresentAndDistinct:boolean;
}{
  const entries=[env.MONETIZATION_INGEST_TOKEN,env.MONETIZATION_QUALITY_TOKEN,env.APP_RECEIPT_SECRET,env.LYNK_WEBHOOK_SECRET];
  const allPresent=entries.every((value):value is string=>Boolean(value));
  const allDistinct=allPresent&&entries.every((value,index)=>entries.slice(index+1).every((other)=>!secureEqual(value!,other!)));
  return {ingestTokenConfigured:Boolean(env.MONETIZATION_INGEST_TOKEN),qualityTokenIsolated:allDistinct,
    appReceiptSecretIsolated:allDistinct,lynkWebhookSecretIsolated:allDistinct,allSecretsPresentAndDistinct:allDistinct};
}

export function hardeningAuthorized(request: Request, env: HardeningEnv): boolean {
  const expected = env.MONETIZATION_INGEST_TOKEN;
  const supplied = request.headers.get('Authorization');
  return Boolean(expected && supplied && secureEqual(supplied, `Bearer ${expected}`));
}

export function qualityAuthorized(request:Request,env:HardeningEnv):boolean{
  const expected=env.MONETIZATION_QUALITY_TOKEN;
  if(!expected||!secretDomainStatus(env).qualityTokenIsolated)return false;
  const supplied=request.headers.get('Authorization');
  return Boolean(supplied&&secureEqual(supplied,`Bearer ${expected}`));
}

function appReceiptSecret(env:HardeningEnv):string|null{
  const secret=env.APP_RECEIPT_SECRET;
  return secret&&secretDomainStatus(env).appReceiptSecretIsolated?secret:null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(bytes:Uint8Array):string{
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

function decodeBase64Url(value:string):Uint8Array{
  const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);
  const binary=atob(padded);return Uint8Array.from(binary,(character)=>character.charCodeAt(0));
}

async function hmac(value:string,secret:string):Promise<string>{
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))));
}

export async function issueAppInstallReceipt(appInstanceId:string,appVersion:string,eventId:string,env:HardeningEnv):Promise<string|null>{
  const secret=appReceiptSecret(env);if(!secret)return null;
  const payload=base64Url(new TextEncoder().encode(JSON.stringify({v:1,brandId:BRAND_ID,appInstanceId,appVersion,eventId,
    exp:Math.floor(Date.now()/1000)+APP_RECEIPT_TTL_SECONDS})));
  return `v1.${payload}.${await hmac(`v1.${payload}`,secret)}`;
}

export async function verifyAppInstallReceipt(receipt:string,env:HardeningEnv):Promise<JsonRecord|null>{
  const secret=appReceiptSecret(env);if(!secret)return null;
  const parts=receipt.split('.');if(parts.length!==3||parts[0]!=='v1'||!parts[1]||!parts[2])return null;
  const expected=await hmac(`v1.${parts[1]}`,secret);
  if(!secureEqual(parts[2],expected))return null;
  try{
    const parsed:unknown=JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if(!isRecord(parsed)||parsed.v!==1||parsed.brandId!==BRAND_ID||typeof parsed.appInstanceId!=='string'||typeof parsed.appVersion!=='string'||typeof parsed.eventId!=='string')return null;
    if(typeof parsed.exp!=='number'||parsed.exp<Math.floor(Date.now()/1000))return null;
    return parsed;
  }catch{return null;}
}

export async function bodyWithinLimit(request: Request, maxBytes: number): Promise<boolean> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) return false;
  return (await request.clone().arrayBuffer()).byteLength <= maxBytes;
}

export async function rateAllowed(request: Request, env: HardeningEnv, limit: number): Promise<boolean> {
  try {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const salt = env.MONETIZATION_INGEST_TOKEN ?? 'monetization-v15-rate-scope';
    const path = new URL(request.url).pathname;
    const fingerprint = (await sha256(`${salt}|${ip}`)).slice(0, 32);
    const scope = `${path}:${fingerprint}`;
    const windowStart = new Date().toISOString().slice(0, 16) + ':00Z';
    const result = await env.DB.prepare(`INSERT INTO monetization_api_rate_limits(scope,window_start,count,expires_at)
      VALUES (?1,?2,1,datetime('now','+2 days'))
      ON CONFLICT(scope,window_start) DO UPDATE SET count=count+1,expires_at=datetime('now','+2 days')
      WHERE monetization_api_rate_limits.count < ?3`).bind(scope,windowStart,limit).run();
    return Number(result.meta.changes ?? 0) > 0;
  } catch (error) {
    console.error(JSON.stringify({message:'v15_rate_guard_unavailable',error:error instanceof Error?error.message:'unknown'}));
    return false;
  }
}

export async function recordTouchpoint(eventId: string, eventType: string, body: JsonRecord, env: HardeningEnv): Promise<void> {
  if (!TOUCH_TYPES.has(eventType)) return;
  const visitorId = cleanString(body.visitorId, 180);
  if (!visitorId) return;
  const touchType = eventType === 'affiliate_click' ? 'click' : eventType;
  await env.DB.prepare(`INSERT INTO monetization_touchpoints
    (id,brand_id,visitor_id,session_id,content_item_id,campaign_id,offer_id,platform,touch_type,event_id,occurred_at,metadata_json)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,COALESCE(?11,CURRENT_TIMESTAMP),?12
    WHERE NOT EXISTS (SELECT 1 FROM monetization_touchpoints WHERE event_id=?10)`).bind(
      `tch-${eventId}`,BRAND_ID,visitorId,cleanString(body.sessionId,180),cleanString(body.contentItemId,100),
      cleanString(body.campaignId,100),cleanString(body.offerId,100),cleanString(body.platform,40),touchType,eventId,
      cleanString(body.occurredAt,40),JSON.stringify({source:'event_hook_v15',rawIdentifiersStored:false,piiExpected:false})
    ).run();
}

export async function recordLatestRedirectTouchpoint(slug: string, request: Request, env: HardeningEnv): Promise<void> {
  const visitorId = cleanString(request.headers.get('X-Visitor-Id'),180);
  if (!visitorId) return;
  const event = await env.DB.prepare(`SELECT e.id,e.event_type,e.session_id,e.content_item_id,e.campaign_id,e.offer_id,e.platform,e.occurred_at
    FROM monetization_events e JOIN monetization_tracked_links l ON l.id=e.tracked_link_id
    WHERE l.brand_id=?1 AND l.slug=?2 AND e.visitor_id=?3
    ORDER BY datetime(e.received_at) DESC,e.id DESC LIMIT 1`).bind(BRAND_ID,slug,visitorId).first<JsonRecord>();
  if (!event) return;
  await recordTouchpoint(String(event.id),String(event.event_type),{
    visitorId,sessionId:event.session_id,contentItemId:event.content_item_id,campaignId:event.campaign_id,
    offerId:event.offer_id,platform:event.platform,occurredAt:event.occurred_at
  },env);
}

async function qualityReady(env: HardeningEnv): Promise<boolean> {
  return Boolean(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='monetization_record_quality'`).first());
}

export async function materializeDailyAnalytics(env: HardeningEnv, requestedDays = 35): Promise<JsonRecord> {
  const days = Math.max(1,Math.min(400,Math.round(Number(requestedDays)||35)));
  const since = `-${days} days`;
  const scoped = await qualityReady(env);
  const dataScope=scoped?'verified-production':'legacy-unclassified';
  const snapshotId=`ana-${crypto.randomUUID()}`;
  const eventScope = scoped ? `AND EXISTS (SELECT 1 FROM monetization_record_quality q WHERE q.record_type='event'
    AND q.record_id=e.id AND q.data_class='production' AND q.verification_status='verified')` : '';
  const revenueScope=verifiedQualityFilter(scoped,'revenue_event','r');
  const revenueContent=scoped?'r.content_item_id':'COALESCE(a.last_content_item_id,a.first_content_item_id,r.content_item_id)';
  const revenueCampaign=scoped?'r.campaign_id':'COALESCE(a.last_campaign_id,a.first_campaign_id,r.campaign_id)';
  const revenueOffer=scoped?'r.offer_id':'COALESCE(a.last_offer_id,a.first_offer_id,r.offer_id)';
  const revenuePlatform=scoped?"COALESCE(c.platform,'')":"COALESCE(a.last_platform,a.first_platform,c.platform,'')";

  await env.DB.prepare(`INSERT INTO monetization_analytics_snapshots(id,brand_id,data_scope,period_days,status)
    VALUES (?1,?2,?3,?4,'preparing')`).bind(snapshotId,BRAND_ID,dataScope,days).run();
  try{
    const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO monetization_daily_analytics_v15
      (snapshot_id,day,brand_id,content_item_id,campaign_id,offer_id,platform,impressions,views,clicks,leads,checkouts,
       conversion_events,confirmed_transactions,reversals,gross_revenue,net_revenue,contribution_margin)
      SELECT ?1,substr(e.occurred_at,1,10),e.brand_id,COALESCE(e.content_item_id,''),COALESCE(e.campaign_id,''),
        COALESCE(e.offer_id,''),COALESCE(e.platform,''),
        SUM(CASE WHEN e.event_type='impression' THEN 1 ELSE 0 END),
        SUM(CASE WHEN e.event_type IN ('landing_view','app_open','tool_used') THEN 1 ELSE 0 END),
        SUM(CASE WHEN e.event_type IN ('click','affiliate_click') THEN 1 ELSE 0 END),
        SUM(CASE WHEN e.event_type IN ('lead','signup') THEN 1 ELSE 0 END),
        SUM(CASE WHEN e.event_type='checkout' THEN 1 ELSE 0 END),
        SUM(CASE WHEN e.event_type IN ('purchase','affiliate_conversion') THEN 1 ELSE 0 END),0,0,0,0,0
      FROM monetization_events e
      WHERE e.brand_id=?2 AND e.occurred_at>=datetime('now',?3) ${eventScope}
      GROUP BY 2,3,4,5,6,7
      ON CONFLICT(snapshot_id,day,brand_id,content_item_id,campaign_id,offer_id,platform) DO UPDATE SET
        impressions=excluded.impressions,views=excluded.views,clicks=excluded.clicks,leads=excluded.leads,
        checkouts=excluded.checkouts,conversion_events=excluded.conversion_events`).bind(snapshotId,BRAND_ID,since),
    env.DB.prepare(`INSERT INTO monetization_daily_analytics_v15
      (snapshot_id,day,brand_id,content_item_id,campaign_id,offer_id,platform,impressions,views,clicks,leads,checkouts,
       conversion_events,confirmed_transactions,reversals,gross_revenue,net_revenue,contribution_margin)
      SELECT ?1,substr(r.occurred_at,1,10),r.brand_id,
        COALESCE(${revenueContent},''),
        COALESCE(${revenueCampaign},''),
        COALESCE(${revenueOffer},''),
        ${revenuePlatform},
        0,0,0,0,0,0,
        SUM(CASE WHEN r.event_type IN ('sale','affiliate_commission','subscription','service_conversion') AND r.status='confirmed' THEN 1 ELSE 0 END),
        SUM(CASE WHEN r.event_type IN ('refund','chargeback') OR r.status='refunded' THEN 1 ELSE 0 END),
        COALESCE(SUM(r.gross_amount),0),COALESCE(SUM(r.net_amount),0),COALESCE(SUM(r.margin_amount),0)
      FROM monetization_revenue_events r
      LEFT JOIN monetization_attributions a ON a.revenue_event_id=r.id
      LEFT JOIN content_items c ON c.id=${revenueContent}
      WHERE r.brand_id=?2 AND r.occurred_at>=datetime('now',?3) AND r.status IN ('confirmed','refunded') ${revenueScope}
      GROUP BY 2,3,4,5,6,7
      ON CONFLICT(snapshot_id,day,brand_id,content_item_id,campaign_id,offer_id,platform) DO UPDATE SET
        gross_revenue=excluded.gross_revenue,net_revenue=excluded.net_revenue,contribution_margin=excluded.contribution_margin,
        confirmed_transactions=excluded.confirmed_transactions,reversals=excluded.reversals`).bind(snapshotId,BRAND_ID,since)
    ]);
    const totals = await env.DB.prepare(`SELECT COUNT(*) rows,COALESCE(SUM(clicks),0) clicks,
    COALESCE(SUM(conversion_events),0) conversion_events,COALESCE(SUM(confirmed_transactions),0) confirmed_transactions,
    COALESCE(SUM(reversals),0) reversals,COALESCE(SUM(net_revenue),0) net_revenue,
    COALESCE(SUM(contribution_margin),0) contribution_margin
    FROM monetization_daily_analytics_v15 WHERE snapshot_id=?1`).bind(snapshotId).first();
    await env.DB.prepare(`UPDATE monetization_analytics_snapshots SET status='complete',completed_at=CURRENT_TIMESTAMP
      WHERE id=?1 AND status='preparing'`).bind(snapshotId).run();
    return {snapshotId,days,dataScope,statements:results.length,totals:totals??{}};
  }catch(error){
    await env.DB.prepare(`UPDATE monetization_analytics_snapshots SET status='error',error_message=?2,completed_at=CURRENT_TIMESTAMP
      WHERE id=?1 AND status='preparing'`).bind(snapshotId,error instanceof Error?error.message.slice(0,500):'unknown').run().catch(()=>{});
    throw error;
  }
}

export async function dailyAnalytics(env: HardeningEnv, url: URL): Promise<JsonRecord> {
  const days=Math.max(1,Math.min(400,Math.round(Number(url.searchParams.get('days'))||30)));
  const since=`-${days} days`;
  const quality=await qualityReady(env);
  const eventScope=quality?`AND EXISTS (SELECT 1 FROM monetization_record_quality q WHERE q.record_type='event'
    AND q.record_id=e.id AND q.data_class='production' AND q.verification_status='verified')`:'';
  const revenueScope=verifiedQualityFilter(quality,'revenue_event','r');
  const snapshot=await env.DB.prepare(`SELECT id,data_scope,period_days,completed_at FROM monetization_analytics_snapshots
    WHERE brand_id=?1 AND status='complete' AND period_days>=?2 AND (?3=0 OR data_scope='verified-production')
    ORDER BY datetime(completed_at) DESC,rowid DESC LIMIT 1`)
    .bind(BRAND_ID,days,quality?1:0).first<JsonRecord>();
  if(!snapshot?.id)return {days,snapshot:null,dataScope:null,rows:[],totals:{},materializationRequired:true};
  const sourceWatermarkSql=quality?`SELECT MAX(changed_at) source_changed_at FROM (
      SELECT MAX(q.updated_at) changed_at FROM monetization_record_quality q
        JOIN monetization_events e ON q.record_type='event' AND q.record_id=e.id
        WHERE e.brand_id=?1 AND q.data_class='production' AND q.verification_status='verified'
      UNION ALL
      SELECT MAX(q.updated_at) changed_at FROM monetization_record_quality q
        JOIN monetization_revenue_events r ON q.record_type='revenue_event' AND q.record_id=r.id
        WHERE r.brand_id=?1 AND q.data_class='production' AND q.verification_status='verified'
      UNION ALL
      SELECT MAX(h.created_at) changed_at FROM monetization_record_quality_history h
        LEFT JOIN monetization_events e ON h.record_type='event' AND h.record_id=e.id
        LEFT JOIN monetization_revenue_events r ON h.record_type='revenue_event' AND h.record_id=r.id
        WHERE COALESCE(e.brand_id,r.brand_id)=?1
    )`:`SELECT MAX(changed_at) source_changed_at FROM (
      SELECT MAX(received_at) changed_at FROM monetization_events WHERE brand_id=?1
      UNION ALL SELECT MAX(created_at) changed_at FROM monetization_revenue_events WHERE brand_id=?1
    )`;
  const [rows,totals,watermarkResult,liveEventResult,liveRevenueResult]=await env.DB.batch<JsonRecord>([
    env.DB.prepare(`SELECT day,content_item_id,campaign_id,offer_id,platform,impressions,views,clicks,leads,checkouts,
      conversion_events,confirmed_transactions,reversals,gross_revenue,net_revenue,contribution_margin,created_at
      FROM monetization_daily_analytics_v15 WHERE snapshot_id=?1 AND day>=date('now',?2)
      ORDER BY day ASC,contribution_margin DESC LIMIT 5000`).bind(String(snapshot.id),since),
    env.DB.prepare(`SELECT COALESCE(SUM(impressions),0) impressions,COALESCE(SUM(views),0) views,
      COALESCE(SUM(clicks),0) clicks,COALESCE(SUM(leads),0) leads,COALESCE(SUM(checkouts),0) checkouts,
      COALESCE(SUM(conversion_events),0) conversion_events,COALESCE(SUM(confirmed_transactions),0) confirmed_transactions,
      COALESCE(SUM(reversals),0) reversals,COALESCE(SUM(gross_revenue),0) gross_revenue,
      COALESCE(SUM(net_revenue),0) net_revenue,COALESCE(SUM(contribution_margin),0) contribution_margin
      FROM monetization_daily_analytics_v15 WHERE snapshot_id=?1 AND day>=date('now',?2)`).bind(String(snapshot.id),since),
    env.DB.prepare(sourceWatermarkSql).bind(BRAND_ID),
    env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN event_type='impression' THEN 1 ELSE 0 END),0) impressions,
      COALESCE(SUM(CASE WHEN event_type IN ('landing_view','app_open','tool_used') THEN 1 ELSE 0 END),0) views,
      COALESCE(SUM(CASE WHEN event_type IN ('click','affiliate_click') THEN 1 ELSE 0 END),0) clicks,
      COALESCE(SUM(CASE WHEN event_type IN ('lead','signup') THEN 1 ELSE 0 END),0) leads,
      COALESCE(SUM(CASE WHEN event_type='checkout' THEN 1 ELSE 0 END),0) checkouts,
      COALESCE(SUM(CASE WHEN event_type IN ('purchase','affiliate_conversion') THEN 1 ELSE 0 END),0) conversion_events
      FROM monetization_events e WHERE brand_id=?1 AND occurred_at>=datetime('now',?2) ${eventScope}`).bind(BRAND_ID,since),
    env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN event_type IN ('sale','affiliate_commission','subscription','service_conversion') AND status='confirmed' THEN 1 ELSE 0 END),0) confirmed_transactions,
      COALESCE(SUM(CASE WHEN event_type IN ('refund','chargeback') OR status='refunded' THEN 1 ELSE 0 END),0) reversals,
      COALESCE(SUM(gross_amount),0) gross_revenue,COALESCE(SUM(net_amount),0) net_revenue,
      COALESCE(SUM(margin_amount),0) contribution_margin
      FROM monetization_revenue_events r WHERE brand_id=?1 AND occurred_at>=datetime('now',?2)
        AND status IN ('confirmed','refunded') ${revenueScope}`).bind(BRAND_ID,since)
  ]);
  const normalizeTimestamp=(value:unknown):number=>{
    if(typeof value!=='string'||!value.trim())return 0;
    const normalized=/Z$|[+-]\d\d:\d\d$/.test(value)?value:value.replace(' ','T')+'Z';
    const parsed=Date.parse(normalized);
    return Number.isFinite(parsed)?parsed:0;
  };
  const maxAgeSeconds=900;
  const snapshotCompletedAt=String(snapshot.completed_at??'');
  const sourceChangedAt=String(watermarkResult?.results?.[0]?.source_changed_at??'');
  const snapshotMs=normalizeTimestamp(snapshotCompletedAt),sourceMs=normalizeTimestamp(sourceChangedAt);
  const ageSeconds=snapshotMs?Math.max(0,Math.floor((Date.now()-snapshotMs)/1000)):null;
  const snapshotTotals=totals?.results?.[0]??{};
  const liveTotals={...(liveEventResult?.results?.[0]??{}),...(liveRevenueResult?.results?.[0]??{})};
  const metricKeys=['impressions','views','clicks','leads','checkouts','conversion_events','confirmed_transactions',
    'reversals','gross_revenue','net_revenue','contribution_margin'];
  const sourceFingerprintMatches=metricKeys.every((key)=>Number(snapshotTotals[key]??0)===Number(liveTotals[key]??0));
  const reasons:string[]=[];
  if(sourceMs>snapshotMs||!sourceFingerprintMatches)reasons.push('source_changed');
  if(ageSeconds===null||ageSeconds>maxAgeSeconds)reasons.push('max_age_exceeded');
  const stale=reasons.length>0;
  return {days,snapshot:{id:snapshot.id,periodDays:snapshot.period_days,completedAt:snapshot.completed_at},
    dataScope:snapshot.data_scope,rows:rows?.results??[],totals:snapshotTotals,materializationRequired:stale,
    freshness:{stale,reasons,maxAgeSeconds,ageSeconds,sourceChangedAt:sourceChangedAt||null,
      sourceFingerprintMatches,automaticMaterializationEnabled:env.MONETIZATION_V15_MAINTENANCE_ENABLED==='true'}};
}

export async function retentionPreview(env: HardeningEnv): Promise<JsonRecord> {
  const [events,touchpoints,revenue,logs,rateRows]=await env.DB.batch<JsonRecord>([
    env.DB.prepare(`SELECT COUNT(*) rows FROM monetization_events WHERE brand_id=?1 AND occurred_at<datetime('now','-90 days')
      AND (visitor_id IS NOT NULL OR session_id IS NOT NULL OR external_event_id IS NOT NULL OR metadata_json<>'{}')`).bind(BRAND_ID),
    env.DB.prepare(`SELECT COUNT(*) rows FROM monetization_touchpoints WHERE brand_id=?1 AND occurred_at<datetime('now','-90 days')`).bind(BRAND_ID),
    env.DB.prepare(`SELECT COUNT(*) rows FROM monetization_revenue_events WHERE brand_id=?1 AND occurred_at<datetime('now','-90 days')
      AND metadata_json<>'{}'`).bind(BRAND_ID),
    env.DB.prepare(`SELECT COUNT(*) rows FROM monetization_integration_logs WHERE created_at<datetime('now','-90 days') AND metadata_json<>'{}'`),
    env.DB.prepare(`SELECT COUNT(*) rows FROM monetization_api_rate_limits WHERE expires_at<datetime('now')`)
  ]);
  return {
    mode:'preview-only',retentionDays:90,mutatedRows:0,
    candidates:{events:events?.results[0]?.rows??0,touchpoints:touchpoints?.results[0]?.rows??0,
      revenueMetadata:revenue?.results[0]?.rows??0,integrationMetadata:logs?.results[0]?.rows??0,expiredRateWindows:rateRows?.results[0]?.rows??0}
  };
}

export async function recordMaintenance(env: HardeningEnv, operation: string, status: 'success'|'warning'|'error', correlationId: string, metadata: unknown, errorMessage?: string): Promise<void> {
  await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,error_message,correlation_id,metadata_json)
    VALUES ('system',?1,?2,?3,?4,?5)`).bind(operation,status,errorMessage??null,correlationId,JSON.stringify(metadata??{})).run();
}

export async function qualityReviewQueue(env:HardeningEnv,url:URL):Promise<JsonRecord>{
  const limit=Math.max(1,Math.min(100,Math.round(Number(url.searchParams.get('limit'))||50)));
  const cursorAt=cleanString(url.searchParams.get('cursorAt'),50);
  const cursorId=cleanString(url.searchParams.get('cursorId'),100)??'';
  const [events,revenue,insights]=await env.DB.batch<JsonRecord>([
    env.DB.prepare(`SELECT e.id,e.event_type,e.source,e.platform,e.occurred_at,
      COALESCE(q.data_class,'unknown') data_class,COALESCE(q.verification_status,'unverified') verification_status,
      q.reason,COALESCE(q.updated_at,e.received_at) review_at
      FROM monetization_events e LEFT JOIN monetization_record_quality q ON q.record_type='event' AND q.record_id=e.id
      WHERE e.brand_id=?4 AND (q.record_id IS NULL OR q.data_class='unknown' OR q.verification_status='unverified')
      AND (?2 IS NULL OR datetime(COALESCE(q.updated_at,e.received_at))>datetime(?2)
        OR (datetime(COALESCE(q.updated_at,e.received_at))=datetime(?2) AND e.id>?3))
      ORDER BY datetime(COALESCE(q.updated_at,e.received_at)),e.id LIMIT ?1`).bind(limit,cursorAt,cursorId,BRAND_ID),
    env.DB.prepare(`SELECT r.id,r.transaction_id,r.event_type,r.source,r.gross_amount,r.fee_amount,r.cost_amount,r.net_amount,
      r.margin_amount,r.currency,r.status,r.occurred_at,COALESCE(q.data_class,'unknown') data_class,
      COALESCE(q.verification_status,'unverified') verification_status,q.reason,COALESCE(q.updated_at,r.created_at) review_at
      FROM monetization_revenue_events r LEFT JOIN monetization_record_quality q ON q.record_type='revenue_event' AND q.record_id=r.id
      WHERE r.brand_id=?4 AND (q.record_id IS NULL OR q.data_class='unknown' OR q.verification_status='unverified')
      AND (?2 IS NULL OR datetime(COALESCE(q.updated_at,r.created_at))>datetime(?2)
        OR (datetime(COALESCE(q.updated_at,r.created_at))=datetime(?2) AND r.id>?3))
      ORDER BY datetime(COALESCE(q.updated_at,r.created_at)),r.id LIMIT ?1`).bind(limit,cursorAt,cursorId,BRAND_ID),
    env.DB.prepare(`SELECT i.id,i.scope,i.statement,i.evidence_json,i.confidence,i.action_recommendation,i.created_at,COALESCE(q.data_class,'unknown') data_class,
      COALESCE(q.verification_status,'unverified') verification_status,q.reason,COALESCE(q.updated_at,i.created_at) review_at
      FROM monetization_learning_insights i LEFT JOIN monetization_record_quality q ON q.record_type='learning_insight' AND q.record_id=i.id
      WHERE i.brand_id=?4 AND (q.record_id IS NULL OR q.data_class='unknown' OR q.verification_status='unverified')
      AND (?2 IS NULL OR datetime(COALESCE(q.updated_at,i.created_at))>datetime(?2)
        OR (datetime(COALESCE(q.updated_at,i.created_at))=datetime(?2) AND i.id>?3))
      ORDER BY datetime(COALESCE(q.updated_at,i.created_at)),i.id LIMIT ?1`).bind(limit,cursorAt,cursorId,BRAND_ID)
  ]);
  const eventRows=events?.results??[],revenueRows=revenue?.results??[],insightRows=insights?.results??[];
  const next=(rows:JsonRecord[])=>rows.length===limit?{cursorAt:rows.at(-1)?.review_at??null,cursorId:rows.at(-1)?.id??null}:null;
  return {dataScope:'unclassified-review-queue',limit,
    events:eventRows,revenueEvents:revenueRows,learningInsights:insightRows,
    next:{events:next(eventRows),revenueEvents:next(revenueRows),learningInsights:next(insightRows)},rawMetadataIncluded:false};
}

export async function upsertRecordQuality(request: Request, env: HardeningEnv, recordType: string, recordId: string): Promise<JsonRecord> {
  if (!['event','revenue_event','learning_insight'].includes(recordType)) throw new Error('recordType tidak valid.');
  const body = await request.json<unknown>();
  if (!isRecord(body)) throw new Error('Body JSON harus object.');
  const dataClass=cleanString(body.dataClass,30)??'unknown';
  const verification=cleanString(body.verificationStatus,30)??'unverified';
  if (!['production','acceptance','synthetic','internal_test','unknown'].includes(dataClass)) throw new Error('dataClass tidak valid.');
  if (!['verified','unverified'].includes(verification)) throw new Error('verificationStatus tidak valid.');
  const amountBasis=cleanString(body.amountBasis,30),evidenceRef=cleanString(body.evidenceRef,300),reason=cleanString(body.reason,1000);
  if(amountBasis&&!['provider_reported','system_derived','manual','unknown'].includes(amountBasis))throw new Error('amountBasis tidak valid.');
  if(verification==='verified'&&(!evidenceRef||!reason))throw new Error('evidenceRef dan reason wajib untuk record terverifikasi.');
  const table=recordType==='event'?'monetization_events':recordType==='revenue_event'?'monetization_revenue_events':'monetization_learning_insights';
  const record=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=?1 AND brand_id=?2`).bind(recordId,BRAND_ID).first<JsonRecord>();
  if (!record) throw new Error('Record tidak ditemukan.');
  const allowedFinancial=['actual','estimated','not_applicable','unknown'];
  const feeStatus=cleanString(body.feeStatus,30);
  const costStatus=cleanString(body.costStatus,30);
  if (feeStatus&&!allowedFinancial.includes(feeStatus)) throw new Error('feeStatus tidak valid.');
  if (costStatus&&!allowedFinancial.includes(costStatus)) throw new Error('costStatus tidak valid.');
  let projectionIds=[recordId];
  let writeGuardSql=`EXISTS (SELECT 1 FROM ${table} WHERE id=?11 AND brand_id=?12)`;
  let writeGuardValues:unknown[]=[recordId,BRAND_ID];
  if(recordType==='revenue_event'&&dataClass==='production'&&verification==='verified'){
    let revenueRecords=[record];
    const attributionEvidence:AttributionCasEvidence[]=[];
    const transactionId=cleanString(record.transaction_id,180),source=cleanString(record.source,80);
    if(transactionId&&source){
      const group=await env.DB.prepare(`SELECT * FROM monetization_revenue_events
        WHERE brand_id=?1 AND source=?2 AND transaction_id=?3 ORDER BY datetime(created_at),id`)
        .bind(BRAND_ID,source,transactionId).all<JsonRecord>();
      revenueRecords=(group.results??[]) as JsonRecord[];
      if(!revenueRecords.some((item)=>String(item.id)===recordId))throw new Error('Quality update conflict; lifecycle berubah. Muat ulang review queue lalu ulangi.');
      projectionIds=revenueRecords.map((item)=>String(item.id));
    }
    let originals=0;const sums={gross:0,fee:0,cost:0,net:0};
    let groupDimensions:string|null=null;
    for(const revenue of revenueRecords){
      const gross=Number(revenue.gross_amount),fee=Number(revenue.fee_amount),cost=Number(revenue.cost_amount);
      const net=Number(revenue.net_amount),margin=Number(revenue.margin_amount);
      const amounts=[gross,fee,cost,net,margin];
      if(amounts.some((value)=>!Number.isSafeInteger(value)))throw new Error('Revenue lama gagal validasi safe integer.');
      if(net!==gross-fee||margin!==net-cost)throw new Error('Revenue lama gagal validasi gross/net/margin.');
      const eventType=String(revenue.event_type??''),status=String(revenue.status??'');
      if(String(revenue.currency??'').toUpperCase()!=='IDR')throw new Error('Revenue non-IDR tidak dapat dipromosikan pada Monetization v1.');
      const reversal=eventType==='refund'||eventType==='chargeback';
      if(reversal&&(status!=='refunded'||[gross,fee,cost,net].some((value)=>value>0)))throw new Error('Revenue reversal lama memiliki status atau tanda amount yang tidak valid.');
      if(!reversal){
        originals+=1;
        if(status==='refunded'||gross<0||fee<0||cost<0||net<0)throw new Error('Revenue non-reversal lama memiliki status atau tanda amount yang tidak valid.');
      }
      sums.gross+=gross;sums.fee+=fee;sums.cost+=cost;sums.net+=net;
      const dimensions=JSON.stringify([revenue.currency??null,revenue.content_item_id??null,revenue.campaign_id??null,revenue.offer_id??null]);
      groupDimensions??=dimensions;
      if(dimensions!==groupDimensions)throw new Error('Lifecycle revenue memiliki currency atau dimensi atribusi langsung yang tidak konsisten.');
      const attribution=await env.DB.prepare(`SELECT id,first_event_id,last_event_id FROM monetization_attributions
        WHERE revenue_event_id=?1 AND brand_id=?2`).bind(String(revenue.id),BRAND_ID).first<JsonRecord>();
      const eventIds=[attribution?.first_event_id,attribution?.last_event_id]
        .filter((value,index,all)=>typeof value==='string'&&all.indexOf(value)===index) as string[];
      const eventQuality:JsonRecord[]=[];
      for(const eventId of eventIds){
        const trusted=await env.DB.prepare(`SELECT q.* FROM monetization_events e
          JOIN monetization_record_quality q ON q.record_type='event' AND q.record_id=e.id
          WHERE e.id=?1 AND e.brand_id=?2 AND q.data_class='production' AND q.verification_status='verified'`)
          .bind(eventId,BRAND_ID).first<JsonRecord>();
        if(!trusted)throw new Error('Attribution touchpoint wajib production+verified sebelum revenue dipromosikan.');
        if(!cleanString(trusted.evidence_ref,300)||!cleanString(trusted.reason,1000)){
          throw new Error('Attribution touchpoint terverifikasi wajib memiliki evidenceRef dan reason.');
        }
        eventQuality.push(trusted);
      }
      attributionEvidence.push({revenueEventId:String(revenue.id),attributionId:cleanString(attribution?.id,180),
        firstEventId:cleanString(attribution?.first_event_id,180),lastEventId:cleanString(attribution?.last_event_id,180),eventQuality});
    }
    if(originals!==1)throw new Error('Lifecycle revenue harus memiliki tepat satu transaksi asal.');
    if([sums.gross,sums.fee,sums.cost,sums.net].some((value)=>value<0))throw new Error('Lifecycle revenue melebihi nilai transaksi asal.');
    const guard=revenueCasGuard(revenueRecords,source,transactionId,attributionEvidence);
    writeGuardSql=guard.sql;
    writeGuardValues=guard.values;
  }
  const correlationId=cleanString(request.headers.get('X-Correlation-Id'),160)??`quality-${crypto.randomUUID()}`;
  const actorPrincipal=env.MONETIZATION_QUALITY_TOKEN?(await sha256(env.MONETIZATION_QUALITY_TOKEN)).slice(0,24):'unavailable';
  const statements:D1PreparedStatement[]=[];
  for(const projectionId of projectionIds){
    const newMetadata=JSON.stringify(isRecord(body.metadata)?body.metadata:{});
    statements.push(env.DB.prepare(`INSERT INTO monetization_record_quality_history
      (id,record_type,record_id,previous_data_class,previous_verification_status,previous_evidence_ref,previous_reason,previous_metadata_json,
       new_data_class,new_verification_status,evidence_ref,reason,new_metadata_json,actor_type,correlation_id,metadata_json)
      SELECT ?1,?2,?3,q.data_class,q.verification_status,q.evidence_ref,q.reason,q.metadata_json,
        ?4,?5,?6,?7,?8,'quality_token_operator',?9,?10
      FROM (SELECT 1) seed LEFT JOIN monetization_record_quality q ON q.record_type=?2 AND q.record_id=?3
      WHERE ${writeGuardSql}`).bind(
        `qhist-${crypto.randomUUID()}`,recordType,projectionId,dataClass,verification,evidenceRef,reason,newMetadata,correlationId,
        JSON.stringify({source:'quality_api',actorPrincipal,lifecycleProjectionSize:projectionIds.length}),...writeGuardValues
      ));
    statements.push(env.DB.prepare(`INSERT INTO monetization_record_quality
      (record_type,record_id,data_class,verification_status,amount_basis,fee_status,cost_status,evidence_ref,reason,metadata_json)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10 WHERE ${writeGuardSql}
      ON CONFLICT(record_type,record_id) DO UPDATE SET data_class=excluded.data_class,
        verification_status=excluded.verification_status,amount_basis=excluded.amount_basis,fee_status=excluded.fee_status,
        cost_status=excluded.cost_status,evidence_ref=excluded.evidence_ref,reason=excluded.reason,
        metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(
          recordType,projectionId,dataClass,verification,amountBasis,feeStatus,costStatus,
          evidenceRef,reason,newMetadata,...writeGuardValues
        ));
  }
  const results=await env.DB.batch(statements);
  if(results.filter((_result,index)=>index%2===1).some((result)=>Number(result?.meta.changes??0)!==1)){
    throw new Error('Quality update conflict; lifecycle berubah. Muat ulang review queue lalu ulangi.');
  }
  return (await env.DB.prepare(`SELECT * FROM monetization_record_quality WHERE record_type=?1 AND record_id=?2`).bind(recordType,recordId).first())??{};
}
