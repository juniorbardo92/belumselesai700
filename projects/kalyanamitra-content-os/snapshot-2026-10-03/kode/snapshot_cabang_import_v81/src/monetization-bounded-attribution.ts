import { monetizationQualityEnabled, verifiedQualityFilter } from './monetization-quality';

type Env={DB:D1Database};
type JsonRecord=Record<string,unknown>;
type RevenueRow={
  id:string;
  source:string;
  transaction_id:string|null;
  content_item_id:string|null;
  campaign_id:string|null;
  offer_id:string|null;
  occurred_at:string;
  created_at:string;
};
type TouchRow={
  id:string;
  event_type:string;
  content_item_id:string|null;
  campaign_id:string|null;
  offer_id:string|null;
  tracked_link_id:string|null;
  platform:string|null;
  visitor_id:string|null;
  occurred_at:string;
};

const BRAND_ID='brand-umkm-naik-kelas';
const WINDOW_MINUTES=60;

function jsonString(value:unknown):string{return JSON.stringify(value??{});}

async function existingAttribution(env:Env,revenueEventId:string):Promise<JsonRecord|null>{
  return env.DB.prepare('SELECT * FROM monetization_attributions WHERE revenue_event_id=?1 AND brand_id=?2')
    .bind(revenueEventId,BRAND_ID).first<JsonRecord>();
}

async function matchingTouches(env:Env,revenue:RevenueRow):Promise<TouchRow[]>{
  // D1 created_at is generated at webhook receipt in UTC. Lynk's provider-created timestamp
  // currently arrives without an explicit offset, so using it directly can shift the bounded
  // window by the provider timezone. Receipt time is therefore the conservative clock anchor.
  const quality=await monetizationQualityEnabled(env);
  const qualityScope=verifiedQualityFilter(quality,'event','e');
  const result=await env.DB.prepare(`SELECT
      e.id,e.event_type,e.content_item_id,e.campaign_id,e.offer_id,e.tracked_link_id,e.platform,e.visitor_id,e.occurred_at
    FROM monetization_events e
    JOIN monetization_tracked_links l ON l.id=e.tracked_link_id
    WHERE e.brand_id=?1
      AND l.brand_id=?1
      AND e.event_type IN ('click','affiliate_click')
      AND e.tracked_link_id IS NOT NULL
      AND e.content_item_id=?2 AND l.content_item_id=?2
      AND e.campaign_id=?3 AND l.campaign_id=?3
      AND e.offer_id=?4 AND l.offer_id=?4
      AND datetime(e.occurred_at)<=datetime(?5)
      AND datetime(e.occurred_at)>=datetime(?5,?6)
      ${qualityScope}
      AND NOT EXISTS (
        SELECT 1 FROM monetization_attributions a
        WHERE a.brand_id=?1
          AND a.revenue_event_id<>?7
          AND a.attribution_status='attributed'
          AND (a.first_event_id=e.id OR a.last_event_id=e.id)
      )
    ORDER BY datetime(e.occurred_at) DESC
    LIMIT 3`)
    .bind(
      BRAND_ID,
      revenue.content_item_id,
      revenue.campaign_id,
      revenue.offer_id,
      revenue.created_at,
      `-${WINDOW_MINUTES} minutes`,
      revenue.id
    ).all<TouchRow>();
  return result.results??[];
}

async function recordEvidence(env:Env,revenue:RevenueRow,touch:TouchRow|null,candidateCount:number,status:'success'|'warning'):Promise<void>{
  await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,error_code,error_message,correlation_id,metadata_json)
    VALUES ('lynk','bounded_attribution',?1,NULL,NULL,?2,?3)`)
    .bind(
      status,
      revenue.transaction_id,
      jsonString({
        evidenceVersion:'1.1',
        revenueEventId:revenue.id,
        touchEventId:touch?.id??null,
        trackedLinkId:touch?.tracked_link_id??null,
        candidateCount,
        windowMinutes:WINDOW_MINUTES,
        clockAnchor:'revenue_created_at_utc',
        providerOccurredAt:revenue.occurred_at,
        receiptCreatedAt:revenue.created_at,
        directMappingComplete:Boolean(revenue.content_item_id&&revenue.campaign_id&&revenue.offer_id),
        exactVisitorMatch:false,
        inference:'bounded_unique_direct_match',
        touchReusePrevented:true,
        piiStored:false,
        recordedAt:new Date().toISOString()
      })
    ).run();
}

export async function upgradeBoundedLynkAttribution(revenueEventId:string,env:Env):Promise<JsonRecord|null>{
  const revenue=await env.DB.prepare(`SELECT id,source,transaction_id,content_item_id,campaign_id,offer_id,occurred_at,created_at
    FROM monetization_revenue_events
    WHERE id=?1 AND brand_id=?2`)
    .bind(revenueEventId,BRAND_ID).first<RevenueRow>();
  if(!revenue||revenue.source!=='lynk')return null;

  const directComplete=Boolean(revenue.content_item_id&&revenue.campaign_id&&revenue.offer_id);
  if(!directComplete)return existingAttribution(env,revenueEventId);

  const touches=await matchingTouches(env,revenue);
  if(touches.length!==1){
    await recordEvidence(env,revenue,null,touches.length,'warning');
    return existingAttribution(env,revenueEventId);
  }

  const touch=touches[0]!;
  const metadata={
    evidenceMode:'bounded_unique_direct_match',
    evidenceVersion:'1.1',
    inference:true,
    exactVisitorMatch:false,
    providerWebhookVisitorMissing:true,
    windowMinutes:WINDOW_MINUTES,
    clockAnchor:'revenue_created_at_utc',
    providerOccurredAt:revenue.occurred_at,
    receiptCreatedAt:revenue.created_at,
    candidateCount:1,
    touchReusePrevented:true,
    touchEventId:touch.id,
    trackedLinkId:touch.tracked_link_id,
    directMapping:{
      contentItemId:revenue.content_item_id,
      campaignId:revenue.campaign_id,
      offerId:revenue.offer_id
    }
  };

  await env.DB.prepare(`UPDATE monetization_attributions SET
      visitor_id=COALESCE(visitor_id,?2),
      model='last_touch',
      first_event_id=?3,
      first_content_item_id=?4,
      first_campaign_id=?5,
      first_offer_id=?6,
      first_platform=?7,
      last_event_id=?3,
      last_content_item_id=?4,
      last_campaign_id=?5,
      last_offer_id=?6,
      last_platform=?7,
      attribution_status='attributed',
      reason=?8,
      metadata_json=?9,
      updated_at=CURRENT_TIMESTAMP
    WHERE revenue_event_id=?1 AND brand_id=?10`)
    .bind(
      revenueEventId,
      touch.visitor_id,
      touch.id,
      touch.content_item_id??revenue.content_item_id,
      touch.campaign_id??revenue.campaign_id,
      touch.offer_id??revenue.offer_id,
      touch.platform,
      'Satu tracked click unik dengan direct provider mapping yang sama ditemukan dalam jendela 60 menit sebelum webhook pembayaran diterima. Attribution bersifat bounded unique-click inference karena webhook Lynk tidak membawa visitor/UTM identifier dan timestamp provider tidak menyertakan offset timezone.',
      jsonString(metadata),
      BRAND_ID
    ).run();

  await recordEvidence(env,revenue,touch,1,'success');
  return existingAttribution(env,revenueEventId);
}
