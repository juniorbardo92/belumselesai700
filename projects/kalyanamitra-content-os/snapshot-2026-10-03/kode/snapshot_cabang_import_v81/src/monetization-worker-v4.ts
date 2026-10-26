import monetizationWorkerV3 from './monetization-worker-v3';
import { commandReport, completeExperiment, createExperiment, listExperiments, operationsSnapshot } from './monetization-operations';
import { createAppHandoff, ingestAppEvent } from './monetization-app';
import { verifyGenericWebhook } from './monetization-attribution';

type Env={DB:D1Database;MONETIZATION_INGEST_TOKEN?:string;LYNK_WEBHOOK_SECRET?:string;DEEPSEEK_API_KEY?:string;DEEPSEEK_MODEL?:string;MONETIZATION_AI_ENABLED?:string};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
function auth(r:Request,e:Env){return Boolean(e.MONETIZATION_INGEST_TOKEN)&&r.headers.get('Authorization')===`Bearer ${e.MONETIZATION_INGEST_TOKEN}`;}
function secureEqual(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function isPublicMonetizationRoute(request:Request,url:URL){
  if(request.method==='GET'&&url.pathname==='/api/monetization/status') return true;
  if(request.method==='POST'&&url.pathname==='/api/monetization/webhooks/lynk') return true;
  return false;
}
function asObject(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function objectKeys(value:unknown):string[]{return Object.keys(asObject(value)).slice(0,40);}
function text(value:unknown,max=200):string|null{return typeof value==='string'&&value.trim()?value.trim().slice(0,max):null;}
function monetary(value:unknown,fallback=0):number|null{
  if(value===undefined||value===null||value==='')return fallback;
  const parsed=typeof value==='number'?value:typeof value==='string'&&/^-?(0|[1-9]\d*)$/.test(value.trim())?Number(value):Number.NaN;
  return Number.isSafeInteger(parsed)?parsed:null;
}
function hasOwn(value:Record<string,unknown>,key:string){return Object.prototype.hasOwnProperty.call(value,key);}
function providerOk(response:Response):Response{
  if(response.status>=200&&response.status<300&&response.status!==200){
    return new Response(response.body,{status:200,headers:response.headers});
  }
  return response;
}
type RealLynkPayloadResult=
  |{kind:'normalized';payload:Record<string,unknown>}
  |{kind:'unknown'}
  |{kind:'invalid_known_event';error:string};
function buildRealLynkPayload(payload:unknown):RealLynkPayloadResult{
  const root=asObject(payload);
  const data=asObject(root.data);
  const messageData=asObject(data.message_data??data.messageData);
  const event=(text(root.event,80)??'').toLowerCase();
  const action=(text(data.message_action??data.messageAction,40)??'').toUpperCase();
  const refId=text(messageData.refId??messageData.ref_id,180);
  const saleEvent=event==='payment.received';
  const reversalEvent=['payment.refunded','payment.cancelled','payment.canceled','payment.chargeback','payment.reversed'].includes(event);
  if(!saleEvent&&!reversalEvent)return {kind:'unknown'};
  if(action!=='SUCCESS')return {kind:'unknown'};
  if(!refId)return {kind:'invalid_known_event',error:'Lynk SUCCESS event wajib memiliki refId.'};
  const totals=asObject(messageData.totals);
  if(!hasOwn(messageData,'totals')||Object.keys(totals).length===0){
    return {kind:'invalid_known_event',error:'Lynk SUCCESS event wajib memiliki totals.'};
  }
  if(hasOwn(messageData,'items')&&!Array.isArray(messageData.items)){
    return {kind:'invalid_known_event',error:'Lynk items harus berupa array.'};
  }
  const rawItems=Array.isArray(messageData.items)?messageData.items:[];
  if(rawItems.length>50)return {kind:'invalid_known_event',error:'Lynk items melebihi batas 50.'};
  if(saleEvent&&rawItems.length===0){
    return {kind:'invalid_known_event',error:'Lynk payment.received wajib memiliki item.'};
  }
  if(rawItems.some((item)=>!item||typeof item!=='object'||Array.isArray(item))){
    return {kind:'invalid_known_event',error:'Lynk item tidak valid.'};
  }
  const items=rawItems.map(asObject);
  const firstItem=items[0]??{};
  const productId=text(firstItem.uuid??firstItem.id,180);
  if(saleEvent&&!productId)return {kind:'invalid_known_event',error:'Lynk payment.received wajib memiliki product id.'};
  const itemAmounts=items.map((item)=>hasOwn(item,'price')?monetary(item.price,Number.NaN):null);
  const itemQuantities=items.map((item)=>hasOwn(item,'qty')?monetary(item.qty,Number.NaN):1);
  if(itemAmounts.some((value)=>value===null||!Number.isSafeInteger(value)||Number(value)<0)||
    itemQuantities.some((value)=>value===null||!Number.isSafeInteger(value)||Number(value)<=0)){
    return {kind:'invalid_known_event',error:'Lynk item amount/quantity tidak valid.'};
  }
  const calculatedItems=items.reduce((sum,item,index)=>sum+Number(itemAmounts[index])*Number(itemQuantities[index]),0);
  const grossKey=hasOwn(totals,'grandTotal')?'grandTotal':hasOwn(totals,'grand_total')?'grand_total':null;
  if(!grossKey)return {kind:'invalid_known_event',error:'Lynk totals.grandTotal wajib tersedia.'};
  const gross=monetary(totals[grossKey],Number.NaN);
  if(gross===null||!Number.isSafeInteger(gross)||gross<=0){
    return {kind:'invalid_known_event',error:'Lynk gross amount tidak valid.'};
  }
  const feeReported=['fee','feeAmount','fee_amount','serviceFee','service_fee'].some((key)=>Object.prototype.hasOwnProperty.call(totals,key));
  const fee=monetary(totals.fee??totals.feeAmount??totals.fee_amount??totals.serviceFee??totals.service_fee,0);
  if(fee===null||!Number.isSafeInteger(fee)||fee<0||fee>gross){
    return {kind:'invalid_known_event',error:'Lynk fee tidak valid.'};
  }
  const occurredAt=text(messageData.createdAt??messageData.created_at,50);
  const safeItems=items.slice(0,50).map((item,index)=>({uuid:text(item.uuid??item.id,180),qty:Number(itemQuantities[index]),price:Number(itemAmounts[index])}));
  return {kind:'normalized',payload:{
    event:reversalEvent?'payment.refunded':'payment.received',
    data:{
      transaction_id:refId,
      product_id:productId,
      amount:gross,
      fee,
      fee_data_status:feeReported?'reported':'unknown',
      cost_data_status:'unknown',
      net_amount:gross-fee,
      currency:'IDR',
      status:reversalEvent?'refunded':'confirmed',
      created_at:occurredAt,
      message_action:'SUCCESS',
      item_count:items.length,
      provider_item_subtotal:calculatedItems,
      provider_item_total_delta:gross-calculatedItems,
      items:safeItems
    }
  }};
}
async function logRejectedLynk(env:Env,error:string,payload:unknown){
  const root=asObject(payload);
  const data=asObject(root.data);
  const messageData=asObject(data.message_data??data.messageData);
  const metadata={receivedAt:new Date().toISOString(),kind:'invalid_known_event',topLevelKeys:objectKeys(root),dataKeys:objectKeys(data),messageDataKeys:objectKeys(messageData),rawPayloadStored:false};
  await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,error_message,metadata_json) VALUES ('lynk','webhook_normalization','error',?1,?2)`).bind(error,JSON.stringify(metadata)).run();
}
async function handleLynk(request:Request,env:Env,url:URL):Promise<Response>{
  if(!env.LYNK_WEBHOOK_SECRET)return json({ok:false,error:'Lynk webhook belum dikonfigurasi.'},503);
  const diagnosticRequest=request.clone();
  const callbackToken=url.searchParams.get('token');
  const tokenAuthenticated=Boolean(callbackToken&&secureEqual(callbackToken,env.LYNK_WEBHOOK_SECRET));
  const hmacRequest=diagnosticRequest.clone() as unknown as Parameters<typeof verifyGenericWebhook>[0];
  const hmacAuthenticated=tokenAuthenticated?false:(await verifyGenericWebhook(hmacRequest,env.LYNK_WEBHOOK_SECRET)).ok;
  if(tokenAuthenticated||hmacAuthenticated){
    let originalPayload:unknown={};
    try{originalPayload=await diagnosticRequest.clone().json();}
    catch{
      const error='Payload Lynk bukan JSON yang valid.';
      await logRejectedLynk(env,error,{});
      return json({ok:false,error},400);
    }
    const parsed=buildRealLynkPayload(originalPayload);
    if(parsed.kind==='invalid_known_event'){
      await logRejectedLynk(env,parsed.error,originalPayload);
      return json({ok:false,error:parsed.error},400);
    }
    if(parsed.kind==='normalized'){
      const safeRequest=new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(parsed.payload)});
      return providerOk(await monetizationWorkerV3.fetch(safeRequest,{...env,LYNK_WEBHOOK_SECRET:undefined}));
    }
  }
  const delegatedEnv:Env=tokenAuthenticated?{...env,LYNK_WEBHOOK_SECRET:undefined}:env;
  const response=await monetizationWorkerV3.fetch(request,delegatedEnv);
  if(response.status!==400)return providerOk(response);
  const responseClone=response.clone();
  let errorMessage='';
  try{const body=await responseClone.json() as Record<string,unknown>;errorMessage=typeof body.error==='string'?body.error:'';}catch{}
  if(errorMessage!=='Lynk transaction/order id tidak ditemukan.')return response;
  let payload:unknown={};
  try{payload=await diagnosticRequest.json();}catch{}
  const root=asObject(payload);
  const data=asObject(root.data);
  const messageData=asObject(data.message_data??data.messageData);
  const metadata={receivedAt:new Date().toISOString(),kind:'probe_or_unknown_schema',topLevelKeys:objectKeys(root),dataKeys:objectKeys(data),messageDataKeys:objectKeys(messageData)};
  await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,error_message,metadata_json) VALUES ('lynk','webhook_probe','warning',NULL,?1)`).bind(JSON.stringify(metadata)).run();
  return json({ok:true,accepted:true,ignored:true,reason:'Lynk probe/unknown schema accepted without revenue write.'},200);
}
export default{async fetch(request:Request,env:Env):Promise<Response>{const url=new URL(request.url);
 if(url.pathname.startsWith('/api/monetization/')&&!isPublicMonetizationRoute(request,url)&&!auth(request,env)){
   return json({ok:false,error:'Unauthorized'},401);
 }
 if(request.method==='POST'&&url.pathname==='/api/monetization/webhooks/lynk')return handleLynk(request,env,url);
 if(request.method==='POST'&&url.pathname==='/api/monetization/app/events'){const x=await ingestAppEvent(request,env);return json(x.body,x.status);}
 if(request.method==='POST'&&url.pathname==='/api/monetization/app/handoff'){const x=await createAppHandoff(request,env);return json(x.body,x.status);}
 if(request.method==='GET'&&url.pathname==='/api/monetization/operations'){const x=await operationsSnapshot(env,url);return json(x.body,x.status);}
 if(request.method==='POST'&&url.pathname==='/api/monetization/command'){const x=await commandReport(request,env);return json(x.body,x.status);}
 if(request.method==='GET'&&url.pathname==='/api/monetization/experiments'){const x=await listExperiments(env);return json(x.body,x.status);}
 if(request.method==='POST'&&url.pathname==='/api/monetization/experiments'){const x=await createExperiment(request,env);return json(x.body,x.status);}
 const m=url.pathname.match(/^\/api\/monetization\/experiments\/([^/]+)\/complete$/);if(request.method==='POST'&&m?.[1]){const x=await completeExperiment(decodeURIComponent(m[1]),request,env);return json(x.body,x.status);}
 return monetizationWorkerV3.fetch(request,env);}} satisfies ExportedHandler<Env>;
