import { monetizationQualityEnabled, verifiedQualityFilter } from './monetization-quality';

type Env={DB:D1Database};
type ApiResult={status:number;body:unknown};
const BRAND_ID='brand-umkm-naik-kelas';
function uid(p:string){return `${p}-${crypto.randomUUID()}`;}
function s(v:unknown,max=500):string|null{if(typeof v!=='string')return null;const x=v.trim();return x?x.slice(0,max):null;}
function n(v:unknown,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function obj(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))return{};return v as Record<string,unknown>;}

export async function listExperiments(env:Env):Promise<ApiResult>{
 const r=await env.DB.prepare(`SELECT * FROM monetization_experiments WHERE brand_id=?1 ORDER BY created_at DESC LIMIT 100`).bind(BRAND_ID).all();
 return {status:200,body:{ok:true,experiments:r.results??[]}};
}
export async function createExperiment(request:Request,env:Env):Promise<ApiResult>{
 const b=obj(await request.json<unknown>());const hypothesis=s(b.hypothesis,1000),variable=s(b.variable,80),metric=s(b.primaryMetric,100);
 if(!hypothesis||!variable||!metric)return{status:400,body:{ok:false,error:'hypothesis, variable, primaryMetric wajib.'}};
 const id=s(b.id,100)??uid('exp');
 await env.DB.prepare(`INSERT INTO monetization_experiments(id,brand_id,hypothesis,variable,variant_a_json,variant_b_json,primary_metric,status,starts_at,ends_at)
 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`)
 .bind(id,BRAND_ID,hypothesis,variable,JSON.stringify(b.variantA??{}),JSON.stringify(b.variantB??{}),metric,s(b.status,20)??'draft',s(b.startsAt,50),s(b.endsAt,50)).run();
 return {status:201,body:{ok:true,experiment:await env.DB.prepare('SELECT * FROM monetization_experiments WHERE id=?1').bind(id).first()}};
}
export async function completeExperiment(id:string,request:Request,env:Env):Promise<ApiResult>{
 const b=obj(await request.json<unknown>());const winner=s(b.winner,10);if(winner&&!['a','b','none'].includes(winner))return{status:400,body:{ok:false,error:'winner harus a, b, atau none.'}};
 const current=await env.DB.prepare('SELECT id FROM monetization_experiments WHERE id=?1 AND brand_id=?2').bind(id,BRAND_ID).first();
 if(!current)return{status:404,body:{ok:false,error:'Experiment tidak ditemukan.'}};
 await env.DB.prepare(`UPDATE monetization_experiments SET status='completed',winner=?2,result_json=?3,ends_at=COALESCE(?4,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?1`)
 .bind(id,winner??'none',JSON.stringify(b.result??{}),s(b.endsAt,50)).run();
 return {status:200,body:{ok:true,experiment:await env.DB.prepare('SELECT * FROM monetization_experiments WHERE id=?1').bind(id).first()}};
}

export async function operationsSnapshot(env:Env,url:URL):Promise<ApiResult>{
 const days=Math.max(1,Math.min(365,Math.round(n(url.searchParams.get('days'),30))));const since=`-${days} days`;
 const quality=await monetizationQualityEnabled(env);
 const revenueScope=verifiedQualityFilter(quality,'revenue_event','r'),eventScope=verifiedQualityFilter(quality,'event','e');
 const feeCompleteSql=quality?`CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q WHERE q.record_type='revenue_event'
   AND q.record_id=r.id AND q.fee_status IN ('actual','not_applicable')) OR json_extract(r.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END`
   :`CASE WHEN json_extract(r.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END`;
 const costCompleteSql=quality?`CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q WHERE q.record_type='revenue_event'
   AND q.record_id=r.id AND q.cost_status IN ('actual','not_applicable')) OR json_extract(r.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END`
   :`CASE WHEN json_extract(r.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END`;
 const revenueContent=quality?'r.content_item_id':'COALESCE(a.last_content_item_id,a.first_content_item_id,r.content_item_id)';
 const revenueOffer=quality?'r.offer_id':'COALESCE(a.last_offer_id,a.first_offer_id,r.offer_id)';
 // One batch keeps the snapshot within Workers' D1 connection ceiling and one read transaction.
 const [revenueResult,eventsResult,attribution,offersResult,experimentsResult,errors,topContent,topOffers]=await env.DB.batch<Record<string,unknown>>([
  env.DB.prepare(`SELECT COUNT(*) transactions,COALESCE(SUM(gross_amount),0) gross,COALESCE(SUM(net_amount),0) net,COALESCE(SUM(margin_amount),0) profit,
    SUM(${feeCompleteSql}) fee_complete,SUM(${costCompleteSql}) cost_complete
    FROM monetization_revenue_events r WHERE brand_id=?1 AND occurred_at>=datetime('now',?2) AND status IN('confirmed','refunded') ${revenueScope}`).bind(BRAND_ID,since),
  env.DB.prepare(`SELECT SUM(CASE WHEN event_type IN('click','affiliate_click') THEN 1 ELSE 0 END) clicks,SUM(CASE WHEN event_type='lead' THEN 1 ELSE 0 END) leads,SUM(CASE WHEN event_type='checkout' THEN 1 ELSE 0 END) checkouts FROM monetization_events e WHERE brand_id=?1 AND occurred_at>=datetime('now',?2) ${eventScope}`).bind(BRAND_ID,since),
  env.DB.prepare(`SELECT a.attribution_status,COUNT(*) total FROM monetization_attributions a JOIN monetization_revenue_events r ON r.id=a.revenue_event_id
    WHERE a.brand_id=?1 AND a.created_at>=datetime('now',?2) AND r.status IN('confirmed','refunded') ${revenueScope} GROUP BY a.attribution_status`).bind(BRAND_ID,since),
  env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active FROM monetization_offers WHERE brand_id=?1`).bind(BRAND_ID),
  env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) running FROM monetization_experiments WHERE brand_id=?1`).bind(BRAND_ID),
  env.DB.prepare(`SELECT provider,operation,error_message,created_at FROM monetization_integration_logs WHERE status='error' AND created_at>=datetime('now',?1) ORDER BY created_at DESC LIMIT 20`).bind(since),
  env.DB.prepare(`SELECT c.id,c.title,c.platform,COUNT(r.id) transactions,COALESCE(SUM(r.net_amount),0) net_revenue,COALESCE(SUM(r.margin_amount),0) profit
    FROM monetization_revenue_events r LEFT JOIN monetization_attributions a ON a.revenue_event_id=r.id
    JOIN content_items c ON c.id=${revenueContent}
    WHERE r.brand_id=?1 AND r.occurred_at>=datetime('now',?2) AND r.status IN('confirmed','refunded') ${revenueScope}
    GROUP BY c.id,c.title,c.platform ORDER BY profit DESC LIMIT 10`).bind(BRAND_ID,since),
  env.DB.prepare(`SELECT o.id,o.name,o.type,COUNT(r.id) transactions,COALESCE(SUM(r.net_amount),0) net_revenue,COALESCE(SUM(r.margin_amount),0) profit
    FROM monetization_revenue_events r LEFT JOIN monetization_attributions a ON a.revenue_event_id=r.id
    JOIN monetization_offers o ON o.id=${revenueOffer}
    WHERE r.brand_id=?1 AND r.occurred_at>=datetime('now',?2) AND r.status IN('confirmed','refunded') ${revenueScope}
    GROUP BY o.id,o.name,o.type ORDER BY profit DESC LIMIT 10`).bind(BRAND_ID,since)
 ]);
 const revenue=revenueResult?.results?.[0]??{},events=eventsResult?.results?.[0]??{};
 const offers=offersResult?.results?.[0]??{},experiments=experimentsResult?.results?.[0]??{};
 const transactionCount=n(revenue?.transactions),feeComplete=n(revenue?.fee_complete),costComplete=n(revenue?.cost_complete);
 return{status:200,body:{ok:true,periodDays:days,dataScope:quality?'verified-production':'legacy-unclassified',revenue:{
  transactions:transactionCount,gross:n(revenue?.gross),net:n(revenue?.net),profit:n(revenue?.profit),
  contributionMarginRecorded:n(revenue?.profit),accountingProfit:null,
  metricQuality:{feeCompleteEvents:feeComplete,costCompleteEvents:costComplete,completeness:transactionCount>0&&feeComplete===transactionCount&&costComplete===transactionCount?'complete':'incomplete'}
 },traffic:{clicks:n(events?.clicks),leads:n(events?.leads),checkouts:n(events?.checkouts)},offers:{total:n(offers?.total),active:n(offers?.active)},experiments:{total:n(experiments?.total),running:n(experiments?.running)},attribution:attribution?.results??[],topContent:topContent?.results??[],topOffers:topOffers?.results??[],recentErrors:errors?.results??[]}};
}

export async function commandReport(request:Request,env:Env):Promise<ApiResult>{
 const b=obj(await request.json<unknown>());const q=(s(b.query,500)??'').toLowerCase();
 const url=new URL('https://internal/report');url.searchParams.set('days',String(Math.max(1,Math.min(365,n(b.days,30)))));
 const snap=(await operationsSnapshot(env,url)).body as Record<string,unknown>;
 if(q.includes('revenue')||q.includes('omzet')||q.includes('pendapatan')||q.includes('profit'))return{status:200,body:{ok:true,type:'revenue',data:snap.revenue,periodDays:snap.periodDays,dataScope:snap.dataScope}};
 if(q.includes('offer')||q.includes('produk'))return{status:200,body:{ok:true,type:'offers',data:snap.topOffers,periodDays:snap.periodDays,dataScope:snap.dataScope}};
 if(q.includes('konten')||q.includes('content')||q.includes('perform'))return{status:200,body:{ok:true,type:'content',data:snap.topContent,periodDays:snap.periodDays,dataScope:snap.dataScope}};
 if(q.includes('error')||q.includes('gagal')||q.includes('health'))return{status:200,body:{ok:true,type:'health',data:snap.recentErrors}};
 return{status:200,body:{ok:true,type:'overview',data:snap}};
}
