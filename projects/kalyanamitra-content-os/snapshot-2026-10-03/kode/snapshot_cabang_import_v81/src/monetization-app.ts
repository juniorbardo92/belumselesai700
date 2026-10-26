import { monetizationQualityEnabled, unknownQualityStatement } from './monetization-quality';

type Env={DB:D1Database};
type Result={status:number;body:unknown};
const BRAND_ID='brand-umkm-naik-kelas';
const APP_EVENTS=new Set(['app_install','app_open','signup','tool_used']);
function uid(prefix:string){return `${prefix}-${crypto.randomUUID()}`;}
function s(v:unknown,max=500){if(typeof v!=='string')return null;const x=v.trim();return x?x.slice(0,max):null;}
function safeJson(v:unknown){return JSON.stringify(v??{});}
function isHttpsUrl(v:string){try{return new URL(v).protocol==='https:';}catch{return false;}}
async function bodyObject(request:Request):Promise<Record<string,unknown>>{const x=await request.json<unknown>();if(!x||typeof x!=='object'||Array.isArray(x))throw new Error('Body JSON harus object.');return x as Record<string,unknown>;}

export async function ingestAppEvent(request:Request,env:Env):Promise<Result>{
 try{
  const b=await bodyObject(request);const eventType=s(b.eventType,40);const appInstanceId=s(b.appInstanceId,180);
  if(!eventType||!APP_EVENTS.has(eventType))return{status:400,body:{ok:false,error:'eventType APK tidak valid.'}};
  if(!appInstanceId)return{status:400,body:{ok:false,error:'appInstanceId pseudonymous wajib.'}};
  const idem=s(b.idempotencyKey,180)??`apk:${eventType}:${appInstanceId}:${s(b.occurredAt,50)??new Date().toISOString().slice(0,16)}`;
  const id=uid('evt');
  const insert=env.DB.prepare(`INSERT OR IGNORE INTO monetization_events
   (id,event_type,brand_id,content_item_id,campaign_id,offer_id,source,platform,visitor_id,session_id,idempotency_key,metadata_json,occurred_at)
   VALUES (?1,?2,?3,?4,?5,?6,'apk','app',?7,?8,?9,?10,COALESCE(?11,CURRENT_TIMESTAMP))`)
   .bind(id,eventType,BRAND_ID,s(b.contentItemId,100),s(b.campaignId,100),s(b.offerId,100),appInstanceId,s(b.sessionId,180),idem,safeJson({appVersion:s(b.appVersion,40),devicePlatform:s(b.devicePlatform,40)??'android',properties:b.properties??{}}),s(b.occurredAt,50));
  const quality=await monetizationQualityEnabled(env);
  const results=quality?await env.DB.batch([insert,unknownQualityStatement(env,'event',id,'APK event awaits provenance verification.')]):[await insert.run()];
  if(Number(results[0]?.meta.changes??0)===0){
   const existing=await env.DB.prepare('SELECT id FROM monetization_events WHERE brand_id=?1 AND idempotency_key=?2').bind(BRAND_ID,idem).first<{id:string}>();
   if(existing)return{status:200,body:{ok:true,duplicate:true,eventId:existing.id,eventType}};
   return{status:409,body:{ok:false,error:'APK event tidak dapat disimpan.'}};
  }
  return{status:201,body:{ok:true,duplicate:false,eventId:id,eventType}};
 }catch{return{status:400,body:{ok:false,error:'APK event tidak valid.'}};}
}

export async function createAppHandoff(request:Request,env:Env):Promise<Result>{
 try{
  const b=await bodyObject(request);const appInstanceId=s(b.appInstanceId,180);const offerId=s(b.offerId,100);
  if(!appInstanceId||!offerId)return{status:400,body:{ok:false,error:'appInstanceId dan offerId wajib.'}};
  const offer=await env.DB.prepare(`SELECT id,type,destination_url,status FROM monetization_offers WHERE id=?1 AND brand_id=?2`).bind(offerId,BRAND_ID).first<Record<string,unknown>>();
  if(!offer||offer.status!=='active')return{status:404,body:{ok:false,error:'Offer aktif tidak ditemukan.'}};
  const override=s(b.destinationUrl,2000);const destination=override??s(offer.destination_url,2000);
  if(!destination||!isHttpsUrl(destination))return{status:400,body:{ok:false,error:'Destination offer wajib HTTPS.'}};
  const eventId=uid('evt');const idem=s(b.idempotencyKey,180)??`apk-handoff:${appInstanceId}:${offerId}:${crypto.randomUUID()}`;
  const eventType=offer.type==='affiliate'?'affiliate_click':'click';
  const insert=env.DB.prepare(`INSERT OR IGNORE INTO monetization_events
   (id,event_type,brand_id,content_item_id,campaign_id,offer_id,source,platform,visitor_id,session_id,idempotency_key,metadata_json,occurred_at)
   VALUES (?1,?2,?3,?4,?5,?6,'apk','app',?7,?8,?9,?10,CURRENT_TIMESTAMP)`)
   .bind(eventId,eventType,BRAND_ID,s(b.contentItemId,100),s(b.campaignId,100),offerId,appInstanceId,s(b.sessionId,180),idem,safeJson({handoff:true,destinationHost:new URL(destination).hostname,appVersion:s(b.appVersion,40),offerType:offer.type}));
  const quality=await monetizationQualityEnabled(env);
  const results=quality?await env.DB.batch([insert,unknownQualityStatement(env,'event',eventId,'APK handoff awaits provenance verification.')]):[await insert.run()];
  if(Number(results[0]?.meta.changes??0)===0){
   const existing=await env.DB.prepare(`SELECT id,event_type FROM monetization_events WHERE brand_id=?1 AND idempotency_key=?2`).bind(BRAND_ID,idem).first<Record<string,unknown>>();
   if(existing)return{status:200,body:{ok:true,duplicate:true,eventId:existing.id,eventType:existing.event_type,offerId,destinationUrl:destination,attributionVisitorId:appInstanceId}};
   return{status:409,body:{ok:false,error:'APK handoff tidak dapat disimpan.'}};
  }
  return{status:201,body:{ok:true,duplicate:false,eventId,eventType,offerId,destinationUrl:destination,attributionVisitorId:appInstanceId}};
 }catch{return{status:400,body:{ok:false,error:'APK handoff tidak valid.'}};}
}
