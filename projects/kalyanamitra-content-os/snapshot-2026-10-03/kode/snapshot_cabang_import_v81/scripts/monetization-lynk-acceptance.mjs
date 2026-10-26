import { createHmac } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const baseUrl=process.env.BASE_URL;
const token=process.env.MONETIZATION_INGEST_TOKEN;
const lynkSecret=process.env.LYNK_WEBHOOK_SECRET;
const runTag=process.env.RUN_TAG;
const contentId=process.env.ACCEPTANCE_CONTENT_ID;
for(const [k,v] of Object.entries({baseUrl,token,lynkSecret,runTag,contentId})) if(!v) throw new Error(`Missing ${k}`);

const offerId=`${runTag}-offer`;
const campaignId=`${runTag}-campaign`;
const mappingId=`${runTag}-mapping`;
const externalProductId=`${runTag}-product`;
const visitorId=`${runTag}-visitor`;
const transactionId=`${runTag}-trx`;
const amount=45678;
const occurredAt=new Date(Date.now()+5*60*1000).toISOString();
const report={runTag,checks:[]};
function pass(name,details){report.checks.push({name,status:'pass',details}); console.log(`PASS: ${name}`);}
function assert(name,condition,details){if(!condition) throw new Error(`${name} failed: ${JSON.stringify(details)}`); pass(name,details);}
async function api(path,{method='GET',body,auth=true,headers={}}={}){
 const r=await fetch(`${baseUrl}${path}`,{method,headers:{...(auth?{Authorization:`Bearer ${token}`}:{}) ,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await r.text(); let data=null; try{data=text?JSON.parse(text):null}catch{data=text} return {r,data,text};
}

const offer=await api('/api/monetization/offers',{method:'POST',body:{id:offerId,name:`[LYNK ACCEPTANCE] ${runTag}`,type:'own_product',destinationUrl:'https://example.com/lynk-acceptance',status:'active',metadata:{acceptanceTag:runTag}}});
assert('offer create',offer.r.status===201,offer.data);
const campaign=await api('/api/monetization/campaigns',{method:'POST',body:{id:campaignId,name:`[LYNK ACCEPTANCE] ${runTag}`,objective:'lynk-sale',offerId,status:'active',metadata:{acceptanceTag:runTag}}});
assert('campaign create',campaign.r.status===201,campaign.data);
const meta=await api(`/api/monetization/content/${encodeURIComponent(contentId)}`,{method:'PUT',body:{monetizationGoal:'own_product',offerId,campaignId,ctaId:`${runTag}-cta`,ctaText:'Beli via Lynk acceptance',commercialScore:95,destinationUrl:'https://example.com/lynk-acceptance',metadata:{acceptanceTag:runTag}}});
assert('content mapping',meta.r.status===200,meta.data);
const mapping=await api('/api/monetization/provider-mappings',{method:'POST',body:{id:mappingId,provider:'lynk',externalType:'product',externalId:externalProductId,offerId,campaignId,contentItemId:contentId,metadata:{acceptanceTag:runTag}}});
assert('lynk product mapping',mapping.r.status===200&&mapping.data?.mapping?.offer_id===offerId,mapping.data);
const touch=await api('/api/monetization/events',{method:'POST',body:{eventType:'click',contentItemId:contentId,campaignId,offerId,source:'lynk-acceptance',platform:'instagram',visitorId,idempotencyKey:`${runTag}:touch`,occurredAt:new Date(Date.now()-1000).toISOString(),metadata:{acceptanceTag:runTag}}});
assert('attribution touchpoint',touch.r.status===201,touch.data);

const payload={event:'payment.success',data:{transaction_id:transactionId,product_id:externalProductId,amount,currency:'IDR',visitor_id:visitorId,paid_at:occurredAt,reference:`${runTag}-ref`}};
const raw=JSON.stringify(payload);
const unsigned=await fetch(`${baseUrl}/api/monetization/webhooks/lynk`,{method:'POST',headers:{'Content-Type':'application/json'},body:raw});
assert('unsigned webhook rejected',unsigned.status===401,{status:unsigned.status,body:await unsigned.text()});
const bad=await fetch(`${baseUrl}/api/monetization/webhooks/lynk`,{method:'POST',headers:{'Content-Type':'application/json','X-Webhook-Signature':'sha256=deadbeef'},body:raw});
assert('bad signature rejected',bad.status===401,{status:bad.status,body:await bad.text()});
const signature=createHmac('sha256',lynkSecret).update(raw).digest('hex');
const signed=await fetch(`${baseUrl}/api/monetization/webhooks/lynk`,{method:'POST',headers:{'Content-Type':'application/json','X-Webhook-Signature':`sha256=${signature}`},body:raw});
const signedText=await signed.text(); const signedData=JSON.parse(signedText);
assert('signed webhook accepted',signed.status===201&&signedData?.ok===true,{status:signed.status,data:signedData});
assert('lynk attribution resolved',signedData?.attribution?.attribution_status==='attributed',{attribution:signedData?.attribution});
const duplicate=await fetch(`${baseUrl}/api/monetization/webhooks/lynk`,{method:'POST',headers:{'Content-Type':'application/json','X-Webhook-Signature':`sha256=${signature}`},body:raw});
const dupData=JSON.parse(await duplicate.text());
assert('lynk webhook idempotency',duplicate.status===200&&dupData?.duplicate===true,{status:duplicate.status,data:dupData});

const attribution=await api('/api/monetization/attribution?days=30');
assert('attribution report contains mapped content',attribution.r.status===200&&Array.isArray(attribution.data?.byContent)&&attribution.data.byContent.some(x=>x.content_item_id===contentId&&Number(x.net_revenue)>=amount),attribution.data);

const start=new Date(Date.parse(occurredAt)-60_000).toISOString(); const end=new Date(Date.parse(occurredAt)+60_000).toISOString();
const rec=await api('/api/monetization/reconciliation',{method:'POST',body:{source:'lynk',periodStart:start,periodEnd:end,externalTransactionCount:1,externalGrossAmount:amount,metadata:{acceptanceTag:runTag}}});
assert('lynk reconciliation matched',rec.r.status===201&&rec.data?.reconciliation?.status==='matched',rec.data);

report.revenueEventId=signedData.revenueEventId; report.finishedAt=new Date().toISOString(); report.summary={passed:report.checks.length,failed:0};
await writeFile('monetization-lynk-acceptance-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
