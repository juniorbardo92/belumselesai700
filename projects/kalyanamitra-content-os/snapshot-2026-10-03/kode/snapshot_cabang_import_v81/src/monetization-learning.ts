import { monetizationQualityEnabled, unknownQualityStatement, verifiedQualityFilter } from './monetization-quality';

type Env = {
  DB: D1Database;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  MONETIZATION_AI_ENABLED?: string;
};

type ApiResult = { status: number; body: unknown };
type JsonRecord = Record<string, unknown>;
const BRAND_ID = 'brand-umkm-naik-kelas';
const DEFAULT_MODEL = 'deepseek-v4-flash';

function uid(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }
function num(value: unknown): number { const n=Number(value); return Number.isFinite(n)?n:0; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value)&&typeof value==='object'&&!Array.isArray(value); }

export async function aggregatedDataset(env: Env, days: number): Promise<JsonRecord> {
  const since=`-${days} days`;
  const qualityTable=await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='monetization_record_quality'`).first();
  const verifiedRevenue=verifiedQualityFilter(Boolean(qualityTable),'revenue_event','mr');
  const verifiedEvent=qualityTable?`AND EXISTS (SELECT 1 FROM monetization_record_quality q
    WHERE q.record_type='event' AND q.record_id=me.id AND q.data_class='production' AND q.verification_status='verified')`:'';
  const feeCompleteSql=qualityTable?`CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q
      WHERE q.record_type='revenue_event' AND q.record_id=mr.id AND q.fee_status IN ('actual','not_applicable'))
      OR json_extract(mr.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END`
    :`CASE WHEN json_extract(mr.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END`;
  const costCompleteSql=qualityTable?`CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q
      WHERE q.record_type='revenue_event' AND q.record_id=mr.id AND q.cost_status IN ('actual','not_applicable'))
      OR json_extract(mr.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END`
    :`CASE WHEN json_extract(mr.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END`;
  const revenueContent=qualityTable?'mr.content_item_id':'COALESCE(a.last_content_item_id,a.first_content_item_id,mr.content_item_id)';
  const revenueOffer=qualityTable?'mr.offer_id':'COALESCE(a.last_offer_id,a.first_offer_id,mr.offer_id)';
  const revenuePlatform=qualityTable?"COALESCE(c.platform,'unknown')":"COALESCE(a.last_platform,a.first_platform,c.platform,'unknown')";
  const [overview, topics, contents, offers, platforms] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(DISTINCT ${revenueContent}) contents,COUNT(*) revenue_events,
      COALESCE(SUM(mr.gross_amount),0) gross,COALESCE(SUM(mr.net_amount),0) net,COALESCE(SUM(mr.margin_amount),0) contribution_margin,
      SUM(${feeCompleteSql}) fee_complete_events,SUM(${costCompleteSql}) cost_complete_events
      FROM monetization_revenue_events mr LEFT JOIN monetization_attributions a ON a.revenue_event_id=mr.id
      WHERE mr.brand_id=?1 AND mr.occurred_at>=datetime('now',?2)
      AND mr.status IN ('confirmed','refunded') ${verifiedRevenue}`).bind(BRAND_ID,since).first(),
    env.DB.prepare(`WITH revenue_by_content AS (
      SELECT ${revenueContent} content_item_id,
        COUNT(*) revenue_events,COALESCE(SUM(mr.net_amount),0) net_revenue,
        COALESCE(SUM(mr.margin_amount),0) contribution_margin
      FROM monetization_revenue_events mr LEFT JOIN monetization_attributions a ON a.revenue_event_id=mr.id
      WHERE mr.brand_id=?1 AND mr.occurred_at>=datetime('now',?2) AND mr.status IN ('confirmed','refunded') ${verifiedRevenue}
      GROUP BY 1
    )
      SELECT t.id topic_id,t.title,COUNT(DISTINCT c.id) contents,
      COALESCE(SUM(r.revenue_events),0) revenue_events,
      COALESCE(SUM(r.net_revenue),0) net_revenue,COALESCE(SUM(r.contribution_margin),0) contribution_margin
      FROM topics t LEFT JOIN content_items c ON c.topic_id=t.id
      LEFT JOIN revenue_by_content r ON r.content_item_id=c.id
      WHERE t.brand_id=?1 GROUP BY t.id,t.title HAVING revenue_events>0 ORDER BY contribution_margin DESC LIMIT 40`).bind(BRAND_ID,since).all(),
    env.DB.prepare(`WITH event_by_content AS (
      SELECT me.content_item_id,
        SUM(CASE WHEN me.event_type IN ('click','affiliate_click') THEN 1 ELSE 0 END) clicks,
        SUM(CASE WHEN me.event_type='lead' THEN 1 ELSE 0 END) leads
      FROM monetization_events me
      WHERE me.brand_id=?1 AND me.occurred_at>=datetime('now',?2) ${verifiedEvent}
      GROUP BY me.content_item_id
    ), revenue_by_content AS (
      SELECT ${revenueContent} content_item_id,
        COUNT(*) revenue_events,COALESCE(SUM(mr.net_amount),0) net_revenue,
        COALESCE(SUM(mr.margin_amount),0) contribution_margin
      FROM monetization_revenue_events mr LEFT JOIN monetization_attributions a ON a.revenue_event_id=mr.id
      WHERE mr.brand_id=?1 AND mr.occurred_at>=datetime('now',?2) AND mr.status IN ('confirmed','refunded') ${verifiedRevenue}
      GROUP BY 1
    )
      SELECT c.id content_id,c.title,c.platform,cm.monetization_goal,cm.cta_text,cm.commercial_score,
      COALESCE(e.clicks,0) clicks,COALESCE(e.leads,0) leads,
      COALESCE(r.revenue_events,0) revenue_events,COALESCE(r.net_revenue,0) net_revenue,
      COALESCE(r.contribution_margin,0) contribution_margin
      FROM content_items c LEFT JOIN content_monetization cm ON cm.content_item_id=c.id
      LEFT JOIN event_by_content e ON e.content_item_id=c.id
      LEFT JOIN revenue_by_content r ON r.content_item_id=c.id
      WHERE c.brand_id=?1 AND (COALESCE(e.clicks,0)>0 OR COALESCE(r.revenue_events,0)>0)
      ORDER BY contribution_margin DESC LIMIT 60`).bind(BRAND_ID,since).all(),
    env.DB.prepare(`WITH revenue_by_offer AS (
      SELECT ${revenueOffer} offer_id,COUNT(*) revenue_events,
        COALESCE(SUM(mr.net_amount),0) net_revenue,COALESCE(SUM(mr.margin_amount),0) contribution_margin
      FROM monetization_revenue_events mr LEFT JOIN monetization_attributions a ON a.revenue_event_id=mr.id
      WHERE mr.brand_id=?1 AND mr.occurred_at>=datetime('now',?2) AND mr.status IN ('confirmed','refunded') ${verifiedRevenue}
      GROUP BY 1
    )
      SELECT o.id offer_id,o.name,o.type,COALESCE(r.revenue_events,0) revenue_events,
        COALESCE(r.net_revenue,0) net_revenue,COALESCE(r.contribution_margin,0) contribution_margin
      FROM monetization_offers o LEFT JOIN revenue_by_offer r ON r.offer_id=o.id
      WHERE o.brand_id=?1 AND COALESCE(r.revenue_events,0)>0 ORDER BY contribution_margin DESC LIMIT 40`).bind(BRAND_ID,since).all(),
    env.DB.prepare(`WITH event_by_platform AS (
      SELECT COALESCE(me.platform,'unknown') platform,
        SUM(CASE WHEN me.event_type IN ('click','affiliate_click') THEN 1 ELSE 0 END) clicks
      FROM monetization_events me
      WHERE me.brand_id=?1 AND me.occurred_at>=datetime('now',?2) ${verifiedEvent}
      GROUP BY COALESCE(me.platform,'unknown')
    ), revenue_by_platform AS (
      SELECT ${revenuePlatform} platform,COUNT(*) revenue_events,
        COALESCE(SUM(mr.net_amount),0) net_revenue,COALESCE(SUM(mr.margin_amount),0) contribution_margin
      FROM monetization_revenue_events mr LEFT JOIN monetization_attributions a ON a.revenue_event_id=mr.id
      LEFT JOIN content_items c ON c.id=${revenueContent}
      WHERE mr.brand_id=?1 AND mr.occurred_at>=datetime('now',?2) AND mr.status IN ('confirmed','refunded') ${verifiedRevenue}
      GROUP BY 1
    ), platform_keys AS (
      SELECT platform FROM event_by_platform UNION SELECT platform FROM revenue_by_platform
    )
      SELECT k.platform,COALESCE(e.clicks,0) clicks,COALESCE(r.revenue_events,0) revenue_events,
        COALESCE(r.net_revenue,0) net_revenue,COALESCE(r.contribution_margin,0) contribution_margin
      FROM platform_keys k LEFT JOIN event_by_platform e ON e.platform=k.platform
      LEFT JOIN revenue_by_platform r ON r.platform=k.platform
      ORDER BY contribution_margin DESC`).bind(BRAND_ID,since).all()
  ]);
  const overviewRow=isRecord(overview)?overview:{};
  const revenueEvents=num(overviewRow.revenue_events);
  const feeComplete=num(overviewRow.fee_complete_events);
  const costComplete=num(overviewRow.cost_complete_events);
  const distinctContents=num(overviewRow.contents);
  const financialCompleteness=revenueEvents>0?Math.min(feeComplete,costComplete)/revenueEvents:0;
  const decisionGrade=Boolean(qualityTable)&&revenueEvents>=5&&distinctContents>=2&&financialCompleteness>=0.8;
  const confidenceCap=decisionGrade?1:0.25;
  return {
    periodDays:days,
    datasetVersion:'2.0-no-fanout',
    dataScope:qualityTable?'verified-production':'legacy-unclassified',
    dataQuality:{decisionMode:decisionGrade?'decision-grade':'advisory',actionable:decisionGrade,revenueEvents,distinctContents,feeCompleteEvents:feeComplete,costCompleteEvents:costComplete,financialCompleteness,confidenceCap},
    overview:overviewRow,
    topics:topics.results??[],
    contents:contents.results??[],
    offers:offers.results??[],
    platforms:platforms.results??[]
  };
}

function learningPrompt(dataset: JsonRecord): string {
  return `Anda adalah Revenue Intelligence Analyst untuk UMKM Naik Kelas. Analisis hanya data yang diberikan. Jangan mengarang sebab yang tidak didukung data.\n
Kembalikan JSON valid persis berbentuk:\n{"summary":"string","insights":[{"scope":"topic|content|offer|platform|cta|portfolio","statement":"string","confidence":0.0,"evidence":{"metric":"value"},"actionRecommendation":"string"}],"researchGuidance":{"prioritize":["string"],"deprioritize":["string"],"commercialPatterns":["string"]},"contentGuidance":{"hooks":["string"],"ctaPatterns":["string"],"angles":["string"],"avoid":["string"]}}\n
Gunakan confidence 0–1 dan jangan melebihi dataQuality.confidenceCap. Bila data belum cukup, katakan data belum cukup dan gunakan confidence rendah. contribution_margin adalah margin kontribusi tercatat yang masih sementara bila fee/HPP belum lengkap; jangan menyebutnya laba bersih. Jangan mengorbankan audience trust.\nDATA:\n${JSON.stringify(dataset)}`;
}

async function callDeepSeek(env: Env, dataset: JsonRecord): Promise<JsonRecord> {
  if (env.MONETIZATION_AI_ENABLED !== 'true') throw new Error('MONETIZATION_AI_ENABLED belum true.');
  if (!env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY belum tersedia.');
  const response=await fetch('https://api.deepseek.com/chat/completions',{
    method:'POST',headers:{Authorization:`Bearer ${env.DEEPSEEK_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:env.DEEPSEEK_MODEL??DEFAULT_MODEL,messages:[{role:'system',content:'Return valid JSON only.'},{role:'user',content:learningPrompt(dataset)}],thinking:{type:'disabled'},response_format:{type:'json_object'},temperature:0.2,max_tokens:3500,stream:false})
  });
  if(!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
  const raw=await response.json<unknown>();
  if(!isRecord(raw)||!Array.isArray(raw.choices)||!isRecord(raw.choices[0])||!isRecord(raw.choices[0].message)||typeof raw.choices[0].message.content!=='string') throw new Error('Respons DeepSeek tidak lengkap.');
  const parsed=JSON.parse(raw.choices[0].message.content) as unknown;
  if(!isRecord(parsed)||!Array.isArray(parsed.insights)) throw new Error('Learning JSON tidak valid.');
  return parsed;
}

export async function runLearning(env: Env, url: URL): Promise<ApiResult> {
  const days=Math.max(7,Math.min(365,Math.round(num(url.searchParams.get('days')??30))||30));
  const runId=`learn-${crypto.randomUUID()}`;
  const dataset=await aggregatedDataset(env,days);
  const overview=isRecord(dataset.overview)?dataset.overview:{};
  if(num(overview.revenue_events)===0){
    await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,correlation_id,metadata_json)
      VALUES ('deepseek','revenue_learning','warning',?1,?2)`).bind(runId,JSON.stringify({
        skipped:true,reason:'no_verified_revenue',days,datasetVersion:dataset.datasetVersion,
        dataQuality:dataset.dataQuality,guidanceActionable:false,researchGuidance:{},contentGuidance:{}
      })).run();
    return {status:200,body:{ok:true,skipped:true,reason:'Belum ada revenue event production+verified.',dataset}};
  }
  try {
    const analysis=await callDeepSeek(env,dataset);
    const insights=Array.isArray(analysis.insights)?analysis.insights:[];
    const quality=isRecord(dataset.dataQuality)?dataset.dataQuality:{};
    const confidenceCap=Math.max(0,Math.min(1,num(quality.confidenceCap)||0.25));
    const now=new Date(); const start=new Date(now.getTime()-days*86400000).toISOString(); const end=now.toISOString();
    let stored=0;
    for(const item of insights.slice(0,20)){
      if(!isRecord(item)||typeof item.statement!=='string') continue;
      const confidence=Math.max(0,Math.min(confidenceCap,num(item.confidence)));
      const id=uid('ins');
      const insert=env.DB.prepare(`INSERT INTO monetization_learning_insights
        (id,brand_id,scope,period_start,period_end,statement,evidence_json,confidence,action_recommendation,status)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'active')`)
        .bind(id,BRAND_ID,String(item.scope??'portfolio').slice(0,80),start,end,item.statement,
          JSON.stringify({...isRecord(item.evidence)?item.evidence:{},learningRunId:runId}),confidence,
          typeof item.actionRecommendation==='string'?item.actionRecommendation:null);
      if(await monetizationQualityEnabled(env))await env.DB.batch([insert,unknownQualityStatement(env,'learning_insight',id,'AI learning insight requires operator provenance review.')]);
      else await insert.run();
      stored+=1;
    }
    await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,correlation_id,metadata_json)
      VALUES ('deepseek','revenue_learning','success',?1,?2)`)
      .bind(runId,JSON.stringify({runId,days,stored,datasetVersion:dataset.datasetVersion,dataQuality:quality,summary:analysis.summary??null,researchGuidance:analysis.researchGuidance??{},contentGuidance:analysis.contentGuidance??{}})).run();
    return {status:201,body:{ok:true,periodDays:days,storedInsights:stored,analysis,datasetOverview:overview,dataQuality:quality}};
  } catch(error){
    const message=error instanceof Error?error.message:'Learning failed';
    await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,error_message,correlation_id,metadata_json)
      VALUES ('deepseek','revenue_learning','error',?1,?2,?3)`).bind(message,runId,JSON.stringify({runId,days})).run();
    return {status:503,body:{ok:false,error:message,datasetOverview:overview}};
  }
}

export async function learningContext(env: Env): Promise<ApiResult> {
  const qualityTable=await monetizationQualityEnabled(env);
  const insightScope=verifiedQualityFilter(qualityTable,'learning_insight','i');
  const latest=await env.DB.prepare(`SELECT status,correlation_id,metadata_json,created_at FROM monetization_integration_logs
    WHERE provider='deepseek' AND operation='revenue_learning' ORDER BY created_at DESC,id DESC LIMIT 1`).first<Record<string,unknown>>();
  const latestRunId=typeof latest?.correlation_id==='string'?latest.correlation_id:'';
  const insights=latestRunId?await env.DB.prepare(`SELECT id,scope,statement,evidence_json,confidence,action_recommendation,created_at
    FROM monetization_learning_insights i WHERE brand_id=?1 AND status='active'
      AND json_extract(evidence_json,'$.learningRunId')=?2 ${insightScope}
    ORDER BY confidence DESC,created_at DESC LIMIT 30`).bind(BRAND_ID,latestRunId).all():{results:[]};
  let stored:unknown={}; try{ stored=latest?.metadata_json?JSON.parse(String(latest.metadata_json)):{}; }catch{}
  const storedRecord=isRecord(stored)?stored:{};
  const quality=isRecord(storedRecord.dataQuality)?storedRecord.dataQuality:{};
  const verifiedInsights=(insights.results??[]).length;
  const latestStored=Math.max(0,Math.round(num(storedRecord.stored)));
  const advisory=latest?.status!=='success'||quality.decisionMode!=='decision-grade'||quality.actionable!==true||
    verifiedInsights===0||verifiedInsights!==latestStored;
  return {status:200,body:{
    ok:true,
    insights:insights.results??[],
    guidance:advisory?{}:storedRecord,
    advisoryGuidance:advisory?storedRecord:{},
    quality:{...quality,decisionMode:advisory?'advisory':'decision-grade',actionable:!advisory,
      insightScope:qualityTable?'verified-production':'legacy-unclassified',verifiedInsights,latestRunInsights:latestStored,
      latestRunId:latestRunId||null,latestRunStatus:latest?.status??null}
  }};
}

export async function learningStatus(env: Env): Promise<ApiResult> {
  const qualityTable=await monetizationQualityEnabled(env);
  const scope=verifiedQualityFilter(qualityTable,'learning_insight','i');
  const count=await env.DB.prepare(`SELECT COUNT(*) total,MAX(created_at) latest FROM monetization_learning_insights i
    WHERE brand_id=?1 AND status='active' ${scope}`).bind(BRAND_ID).first<Record<string,unknown>>();
  return {status:200,body:{ok:true,configured:Boolean(env.DEEPSEEK_API_KEY),enabled:env.MONETIZATION_AI_ENABLED==='true',model:env.DEEPSEEK_MODEL??DEFAULT_MODEL,
    activeInsights:num(count?.total),latestInsightAt:count?.latest??null,dataScope:qualityTable?'verified-production':'legacy-unclassified'}};
}
