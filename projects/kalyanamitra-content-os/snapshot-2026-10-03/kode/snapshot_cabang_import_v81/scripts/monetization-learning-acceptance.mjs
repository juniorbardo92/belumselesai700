import { writeFile } from 'node:fs/promises';

const baseUrl=process.env.BASE_URL;
const token=process.env.MONETIZATION_INGEST_TOKEN;
const contentId=process.env.ACCEPTANCE_CONTENT_ID;
const runTag=process.env.RUN_TAG;
for(const [k,v] of Object.entries({baseUrl,token,contentId,runTag})) if(!v) throw new Error(`Missing ${k}`);

const offerId=`${runTag}-offer`;
const campaignId=`${runTag}-campaign`;
const beforeContext=await api('/api/monetization/learning/context');
if(beforeContext.response.status!==200||beforeContext.data?.ok!==true) throw new Error('Cannot read learning context before acceptance');
const beforeIds=new Set((beforeContext.data.insights??[]).map(x=>x.id));

const status=await api('/api/monetization/learning/status');
assert('learning enabled',status.response.status===200&&status.data?.configured===true&&status.data?.enabled===true,status.data);

const offer=await api('/api/monetization/offers',{method:'POST',body:{id:offerId,name:`[AI ACCEPTANCE] ${runTag}`,type:'own_product',destinationUrl:'https://example.com/ai-acceptance',status:'active',metadata:{acceptanceTag:runTag}}});
assert('offer',offer.response.status===201,offer.data);
const campaign=await api('/api/monetization/campaigns',{method:'POST',body:{id:campaignId,name:`[AI ACCEPTANCE] ${runTag}`,objective:'revenue-learning',offerId,status:'active',metadata:{acceptanceTag:runTag}}});
assert('campaign',campaign.response.status===201,campaign.data);
const meta=await api(`/api/monetization/content/${encodeURIComponent(contentId)}`,{method:'PUT',body:{monetizationGoal:'own_product',offerId,campaignId,ctaId:`${runTag}-cta`,ctaText:'Coba produk acceptance',commercialScore:88,destinationUrl:'https://example.com/ai-acceptance',metadata:{acceptanceTag:runTag}}});
assert('content metadata',meta.response.status===200,meta.data);

for(let i=1;i<=4;i++){
  const evt=await api('/api/monetization/events',{method:'POST',body:{eventType:'click',contentItemId:contentId,campaignId,offerId,source:'ai-acceptance',platform:'instagram',visitorId:`${runTag}-visitor-${i}`,idempotencyKey:`${runTag}:click:${i}`,occurredAt:new Date(Date.now()-i*1000).toISOString(),metadata:{acceptanceTag:runTag}}});
  assert(`click ${i}`,evt.response.status===201,evt.data);
}

const amounts=[75000,125000,200000];
for(let i=0;i<amounts.length;i++){
  const gross=amounts[i];
  const rev=await api('/api/monetization/revenue',{method:'POST',body:{transactionId:`${runTag}-trx-${i+1}`,eventType:'sale',source:`${runTag}-learning`,contentItemId:contentId,campaignId,offerId,grossAmount:gross,feeAmount:Math.round(gross*0.05),costAmount:Math.round(gross*0.20),currency:'IDR',status:'confirmed',idempotencyKey:`${runTag}:revenue:${i+1}`,occurredAt:new Date(Date.now()-i*2000).toISOString(),metadata:{acceptanceTag:runTag}}});
  assert(`revenue ${i+1}`,rev.response.status===201,rev.data);
}

const learning=await api('/api/monetization/learning/run?days=30',{method:'POST'});
assert('learning run HTTP 201',learning.response.status===201,learning.data);
assert('learning generated stored insights',Number(learning.data?.storedInsights)>0,learning.data);
assert('learning analysis JSON',Array.isArray(learning.data?.analysis?.insights),learning.data);

const afterContext=await api('/api/monetization/learning/context');
assert('learning context',afterContext.response.status===200&&afterContext.data?.ok===true,afterContext.data);
const newInsightIds=(afterContext.data.insights??[]).map(x=>x.id).filter(id=>!beforeIds.has(id));
assert('new learning insights visible to Hermes/OpenClaw context',newInsightIds.length>0,{newInsightIds,context:afterContext.data});
assert('learning guidance present',afterContext.data?.guidance&&typeof afterContext.data.guidance==='object',afterContext.data?.guidance);

const report={ok:true,runTag,contentId,offerId,campaignId,storedInsights:learning.data.storedInsights,newInsightIds,summary:learning.data.analysis?.summary??null,researchGuidance:learning.data.analysis?.researchGuidance??{},contentGuidance:learning.data.analysis?.contentGuidance??{},model:status.data.model,finishedAt:new Date().toISOString()};
await writeFile('monetization-learning-acceptance-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

async function api(path,{method='GET',body}={}){
 const r=await fetch(`${baseUrl}${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await r.text(); let data=null; try{data=text?JSON.parse(text):null}catch{data=text}
 return {response:r,data};
}
function assert(name,ok,details){if(!ok) throw new Error(`${name} failed: ${JSON.stringify(details)}`); console.log(`PASS: ${name}`);}
