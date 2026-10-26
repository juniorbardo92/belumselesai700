import { guardedInvalidationHistoryStatement, guardedInvalidationStatement, monetizationQualityEnabled, mutationGuardedInvalidationHistoryStatement, mutationGuardedInvalidationStatement, unknownQualityStatement, verifiedQualityFilter } from './monetization-quality';

type MonetizationEnv = {
  DB: D1Database;
  MONETIZATION_INGEST_TOKEN?: string;
  LYNK_WEBHOOK_SECRET?: string;
};

type ApiResult = { status: number; body: unknown };
type ProviderMap = {
  offer_id?: string | null;
  campaign_id?: string | null;
  content_item_id?: string | null;
};

type NormalizedRevenue = {
  source: string;
  eventType: 'sale' | 'affiliate_commission' | 'subscription' | 'refund' | 'chargeback' | 'lead_value' | 'service_conversion';
  transactionId?: string | null;
  externalReference?: string | null;
  grossAmount: number;
  feeAmount: number;
  costAmount: number;
  netAmount: number;
  marginAmount: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'refunded' | 'rejected';
  offerId?: string | null;
  campaignId?: string | null;
  contentItemId?: string | null;
  visitorId?: string | null;
  occurredAt?: string | null;
  metadata: Record<string, unknown>;
};

const BRAND_ID = 'brand-umkm-naik-kelas';

function uid(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }
function s(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}
function i(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}
function money(value:unknown,fallback=0):number{
  if(value===undefined||value===null||value==='')return fallback;
  const parsed=typeof value==='number'?value:typeof value==='string'&&/^-?(0|[1-9]\d*)$/.test(value.trim())?Number(value):Number.NaN;
  if(!Number.isSafeInteger(parsed))throw new Error('Provider amount harus safe integer.');
  return parsed;
}
function jsonString(value: unknown): string { return JSON.stringify(value ?? {}); }

function validateNormalizedRevenue(value:NormalizedRevenue):void{
  if(value.currency.toUpperCase()!=='IDR')throw new Error('Monetization v1 hanya menerima currency IDR.');
  const amounts=[value.grossAmount,value.feeAmount,value.costAmount,value.netAmount,value.marginAmount];
  if(amounts.some((amount)=>!Number.isSafeInteger(amount)))throw new Error('Provider amount harus safe integer.');
  if(value.netAmount!==value.grossAmount-value.feeAmount)throw new Error('Provider net amount tidak sama dengan gross - fee.');
  if(value.marginAmount!==value.netAmount-value.costAmount)throw new Error('Provider margin amount tidak sama dengan net - cost.');
  const reversal=value.eventType==='refund'||value.eventType==='chargeback';
  if(reversal&&[value.grossAmount,value.feeAmount,value.costAmount,value.netAmount].some((amount)=>amount>0))throw new Error('Provider reversal harus memakai gross, fee, cost, dan net nol atau negatif.');
  if(!reversal&&value.status!=='rejected'&&(value.grossAmount<0||value.feeAmount<0||value.costAmount<0||value.netAmount<0)){
    throw new Error('Provider sale/commission memiliki amount negatif yang tidak valid.');
  }
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key) && value[key] !== null && value[key] !== undefined;
}

function lifecycleToken(value:unknown,max=80):string|null{
  const text=s(value,max)?.toLowerCase();
  return text?text.replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''):null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function safeProviderEvidence(raw: Record<string, unknown>, extra: Record<string, unknown>): Promise<Record<string, unknown>> {
  const data = nested(raw, 'data');
  return {
    ...extra,
    payloadHashSha256: await sha256Hex(JSON.stringify(raw)),
    topLevelKeys: Object.keys(raw).slice(0, 40),
    dataKeys: Object.keys(data).slice(0, 40),
    rawPayloadStored: false,
    piiStored: false
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let idx = 0; idx < a.length; idx += 1) diff |= a.charCodeAt(idx) ^ b.charCodeAt(idx);
  return diff === 0;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyGenericWebhook(request: Request, secret?: string): Promise<{ ok: boolean; rawBody: string; error?: string }> {
  const rawBody = await request.text();
  if (!secret) return { ok: true, rawBody };
  const supplied = request.headers.get('X-Monetization-Signature') ?? request.headers.get('X-Webhook-Signature');
  if (!supplied) return { ok: false, rawBody, error: 'Webhook signature wajib.' };
  const expected = await hmacHex(secret, rawBody);
  const normalized = supplied.replace(/^sha256=/i, '').toLowerCase();
  return timingSafeEqual(normalized, expected) ? { ok: true, rawBody } : { ok: false, rawBody, error: 'Webhook signature tidak valid.' };
}

async function providerMapping(env: MonetizationEnv, provider: string, externalType: string, externalId?: string | null): Promise<ProviderMap> {
  if (!externalId) return {};
  const row = await env.DB.prepare(`SELECT offer_id,campaign_id,content_item_id FROM monetization_provider_mappings
    WHERE brand_id=?1 AND provider=?2 AND external_type=?3 AND external_id=?4`)
    .bind(BRAND_ID, provider, externalType, externalId).first<ProviderMap>();
  return row ?? {};
}

export async function upsertProviderMapping(request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const body = await request.json<Record<string, unknown>>();
  const provider = s(body.provider, 80); const externalType = s(body.externalType, 80); const externalId = s(body.externalId, 180);
  if (!provider || !externalType || !externalId) return { status: 400, body: { ok: false, error: 'provider, externalType, externalId wajib.' } };
  const id = s(body.id, 100) ?? uid('map');
  await env.DB.prepare(`INSERT INTO monetization_provider_mappings
    (id,brand_id,provider,external_type,external_id,offer_id,campaign_id,content_item_id,metadata_json)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
    ON CONFLICT(brand_id,provider,external_type,external_id) DO UPDATE SET
      offer_id=excluded.offer_id,campaign_id=excluded.campaign_id,content_item_id=excluded.content_item_id,
      metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(id, BRAND_ID, provider, externalType, externalId, s(body.offerId,100), s(body.campaignId,100), s(body.contentItemId,100), jsonString(body.metadata)).run();
  const mapping = await env.DB.prepare(`SELECT * FROM monetization_provider_mappings WHERE brand_id=?1 AND provider=?2 AND external_type=?3 AND external_id=?4`)
    .bind(BRAND_ID, provider, externalType, externalId).first();
  return { status: 200, body: { ok: true, mapping } };
}

function pickObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Payload webhook harus object.');
  return raw as Record<string, unknown>;
}

function nested(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = obj[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

async function normalizeLynk(raw: Record<string, unknown>, env: MonetizationEnv): Promise<NormalizedRevenue> {
  const data = Object.keys(nested(raw, 'data')).length ? nested(raw, 'data') : raw;
  const product = nested(data, 'product');
  const externalProductId = s(data.product_id ?? data.productId ?? product.id, 180);
  const mapping = await providerMapping(env, 'lynk', 'product', externalProductId);
  const transactionId = s(data.transaction_id ?? data.transactionId ?? data.order_id ?? data.orderId ?? data.id, 180);
  if (!transactionId) throw new Error('Lynk transaction/order id tidak ditemukan.');
  const rawType=lifecycleToken(raw.event??raw.type??data.event??data.status);
  const refundStates=new Set(['payment_refund','payment_refunded','payment_cancel','payment_cancelled','payment_canceled',
    'payment_chargeback','payment_reversed','payment_voided','refund','refunded','cancelled','canceled','chargeback','reversed','voided']);
  const saleStates=new Set(['payment_received','payment_success','payment_paid','order_paid','received','success','paid','confirmed','completed','sale','purchase']);
  const isRefund=Boolean(rawType&&refundStates.has(rawType));
  const isSale=Boolean(rawType&&saleStates.has(rawType));
  if(!isRefund&&!isSale)throw new Error('Status lifecycle Lynk tidak dikenali; payload dikarantina.');
  const gross = money(data.amount ?? data.total_amount ?? data.totalAmount ?? data.price ?? 0);
  const feeReported = hasOwn(data,'fee')||hasOwn(data,'fee_amount')||hasOwn(data,'feeAmount');
  const costReported = hasOwn(data,'cost')||hasOwn(data,'cost_amount')||hasOwn(data,'costAmount');
  const fee = money(data.fee ?? data.fee_amount ?? data.feeAmount ?? 0);
  const cost = money(data.cost ?? data.cost_amount ?? data.costAmount ?? 0);
  const net = money(data.net_amount ?? data.netAmount, gross - fee);
  const original=isRefund?await env.DB.prepare(`SELECT id,gross_amount,fee_amount,cost_amount,net_amount,margin_amount,currency,
    content_item_id,campaign_id,offer_id FROM monetization_revenue_events
    WHERE brand_id=?1 AND source='lynk' AND transaction_id=?2 AND event_type NOT IN ('refund','chargeback')
      AND status='confirmed' ORDER BY datetime(created_at) DESC LIMIT 2`).bind(BRAND_ID,transactionId).all<Record<string,unknown>>():null;
  const originalRows=original?.results??[];
  if(isRefund&&originalRows.length!==1)throw new Error('Refund Lynk memerlukan tepat satu transaksi sale confirmed yang cocok.');
  const originalRow=isRefund?originalRows[0]!:null;
  if(originalRow&&Math.abs(gross)!==Math.abs(i(originalRow.gross_amount))){
    throw new Error('Monetization v1 hanya menerima refund Lynk penuh dengan amount yang sama seperti transaksi asal.');
  }
  const effectiveGross=originalRow?i(originalRow.gross_amount):gross;
  const effectiveFee=originalRow?i(originalRow.fee_amount):fee;
  const effectiveCost=originalRow?i(originalRow.cost_amount):cost;
  const effectiveNet=originalRow?i(originalRow.net_amount):net;
  const visitorId = s(data.visitor_id ?? data.visitorId ?? data.ref ?? data.reference, 180);
  return {
    source: 'lynk',
    eventType: isRefund ? 'refund' : 'sale',
    transactionId,
    externalReference: s(data.reference ?? data.external_reference ?? transactionId, 180),
    grossAmount: isRefund ? -Math.abs(effectiveGross) : effectiveGross,
    feeAmount: isRefund ? -Math.abs(effectiveFee) : effectiveFee,
    costAmount: isRefund ? -Math.abs(effectiveCost) : effectiveCost,
    netAmount: isRefund ? -Math.abs(effectiveNet) : effectiveNet,
    marginAmount: isRefund ? -Math.abs(effectiveNet) - (-Math.abs(effectiveCost)) : effectiveNet - effectiveCost,
    currency: originalRow?s(originalRow.currency,8)??'IDR':s(data.currency, 8) ?? 'IDR',
    status: isRefund ? 'refunded' : 'confirmed',
    offerId: originalRow?s(originalRow.offer_id,100):s(data.offer_id ?? data.offerId,100) ?? mapping.offer_id ?? null,
    campaignId: originalRow?s(originalRow.campaign_id,100):s(data.campaign_id ?? data.campaignId,100) ?? mapping.campaign_id ?? null,
    contentItemId: originalRow?s(originalRow.content_item_id,100):s(data.content_id ?? data.contentItemId,100) ?? mapping.content_item_id ?? null,
    visitorId,
    occurredAt: s(data.paid_at ?? data.paidAt ?? data.created_at ?? data.createdAt, 50),
    metadata: await safeProviderEvidence(raw, {
      externalProductId,
      providerItemSubtotal:hasOwn(data,'provider_item_subtotal')&&Number.isSafeInteger(Number(data.provider_item_subtotal))?Number(data.provider_item_subtotal):null,
      providerItemTotalDelta:hasOwn(data,'provider_item_total_delta')&&Number.isSafeInteger(Number(data.provider_item_total_delta))?Number(data.provider_item_total_delta):null,
      financialCompleteness:{
        fee:s(data.fee_data_status??data.feeDataStatus,20)??(feeReported?'reported':'unknown'),
        cost:s(data.cost_data_status??data.costDataStatus,20)??(costReported?'reported':'unknown')
      }
    })
  };
}

async function normalizeAffiliate(raw: Record<string, unknown>, env: MonetizationEnv): Promise<NormalizedRevenue> {
  const provider = s(raw.provider,80) ?? 'affiliate';
  const externalOfferId = s(raw.externalOfferId ?? raw.productId ?? raw.offerId,180);
  const mapping = await providerMapping(env, provider, 'offer', externalOfferId);
  const transactionId = s(raw.transactionId ?? raw.conversionId ?? raw.orderId ?? raw.id,180);
  if (!transactionId) throw new Error('Affiliate transaction/conversion id wajib.');
  const commission = money(raw.commissionAmount ?? raw.commission ?? raw.amount ?? 0);
  const feeReported=hasOwn(raw,'feeAmount')||hasOwn(raw,'fee');
  const costReported=hasOwn(raw,'costAmount')||hasOwn(raw,'cost');
  const fee=money(raw.feeAmount??raw.fee??0);
  const cost=money(raw.costAmount??raw.cost??0);
  const net=commission-fee;
  const statusText=lifecycleToken(raw.status,40);
  const rejectedStates=new Set(['rejected','cancelled','canceled','declined','voided','refunded','reversed','chargeback']);
  const pendingStates=new Set(['pending','in_review','under_review','on_hold']);
  const confirmedStates=new Set(['confirmed','approved','paid','completed','success']);
  const rejected=Boolean(statusText&&rejectedStates.has(statusText));
  const pending=Boolean(statusText&&pendingStates.has(statusText));
  const confirmed=Boolean(statusText&&confirmedStates.has(statusText));
  if(!rejected&&!pending&&!confirmed)throw new Error('Status lifecycle affiliate tidak dikenali; payload dikarantina.');
  return {
    source: provider,
    eventType: 'affiliate_commission',
    transactionId,
    externalReference: s(raw.externalReference ?? raw.clickId ?? raw.subId,180),
    grossAmount: rejected ? 0 : commission,
    feeAmount: rejected ? 0 : fee,
    costAmount: rejected ? 0 : cost,
    netAmount: rejected ? 0 : net,
    marginAmount: rejected ? 0 : net-cost,
    currency: s(raw.currency,8) ?? 'IDR',
    status: rejected ? 'rejected' : pending ? 'pending' : 'confirmed',
    offerId: s(raw.offerId,100) ?? mapping.offer_id ?? null,
    campaignId: s(raw.campaignId,100) ?? mapping.campaign_id ?? null,
    contentItemId: s(raw.contentItemId,100) ?? mapping.content_item_id ?? null,
    visitorId: s(raw.visitorId ?? raw.subId ?? raw.clickId,180),
    occurredAt: s(raw.occurredAt ?? raw.convertedAt,50),
    metadata: await safeProviderEvidence(raw, {
      externalOfferId,
      adapter:'normalized_internal_adapter',
      financialCompleteness:{fee:feeReported?'reported':'unknown',cost:costReported?'reported':'unknown'}
    })
  };
}

async function insertRevenue(normalized: NormalizedRevenue, env: MonetizationEnv): Promise<{ id: string; duplicate: boolean; updated: boolean }> {
  validateNormalizedRevenue(normalized);
  const id = uid('rev');
  const idem = `${normalized.source}:${normalized.eventType}:${normalized.transactionId ?? normalized.externalReference ?? id}`;
  try {
    const insert=env.DB.prepare(`INSERT INTO monetization_revenue_events
      (id,transaction_id,event_type,source,brand_id,content_item_id,campaign_id,offer_id,gross_amount,fee_amount,cost_amount,net_amount,margin_amount,currency,status,external_reference,idempotency_key,metadata_json,occurred_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,COALESCE(?19,CURRENT_TIMESTAMP))`)
      .bind(id, normalized.transactionId, normalized.eventType, normalized.source, BRAND_ID, normalized.contentItemId, normalized.campaignId, normalized.offerId,
        normalized.grossAmount, normalized.feeAmount, normalized.costAmount, normalized.netAmount, normalized.marginAmount,
        normalized.currency, normalized.status, normalized.externalReference, idem, jsonString(normalized.metadata), normalized.occurredAt);
    if(await monetizationQualityEnabled(env))await env.DB.batch([insert,unknownQualityStatement(env,'revenue_event',id,'Provider revenue awaits provenance verification.')]);
    else await insert.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('unique')) {
      const existing = await env.DB.prepare(`SELECT * FROM monetization_revenue_events WHERE idempotency_key=?1`).bind(idem).first<Record<string,unknown>>();
      if (existing?.id && existing.status === 'pending' && ['confirmed','rejected'].includes(normalized.status)) {
        const mutationId=uid('lifecycle');
        const mutationMetadata=jsonString({...normalized.metadata,lifecycleMutationId:mutationId});
        const update=env.DB.prepare(`UPDATE monetization_revenue_events SET
          content_item_id=?2,campaign_id=?3,offer_id=?4,gross_amount=?5,fee_amount=?6,cost_amount=?7,
          net_amount=?8,margin_amount=?9,currency=?10,status=?11,external_reference=?12,metadata_json=?13,
          occurred_at=COALESCE(?14,occurred_at)
          WHERE id=?1 AND status='pending'`).bind(
            existing.id,normalized.contentItemId,normalized.campaignId,normalized.offerId,
            normalized.grossAmount,normalized.feeAmount,normalized.costAmount,normalized.netAmount,normalized.marginAmount,
            normalized.currency,normalized.status,normalized.externalReference,mutationMetadata,normalized.occurredAt
          );
        let results:D1Result<unknown>[];
        if(await monetizationQualityEnabled(env)){
          const reason='Provider lifecycle mutation invalidated prior provenance verification.';
          results=await env.DB.batch([
            update,
            mutationGuardedInvalidationHistoryStatement(env,'revenue_event',String(existing.id),reason,idem,String(existing.id),mutationId),
            mutationGuardedInvalidationStatement(env,'revenue_event',String(existing.id),reason,String(existing.id),mutationId)
          ]);
        }
        else results=[await update.run()];
        if(Number(results[0]?.meta.changes??0)===0){
          const canonical=await env.DB.prepare(`SELECT id FROM monetization_revenue_events WHERE idempotency_key=?1`).bind(idem).first<{id:string}>();
          return {id:String(canonical?.id??existing.id),duplicate:true,updated:false};
        }
        return { id: String(existing.id), duplicate: false, updated: true };
      }
      if(existing?.id&&existing.status==='confirmed'&&normalized.status==='rejected'){
        const reversalId=uid('rev');
        const reversalKey=`${idem}:reversal`;
        const prior=await env.DB.prepare(`SELECT id FROM monetization_revenue_events WHERE idempotency_key=?1`).bind(reversalKey).first<{id:string}>();
        if(prior?.id)return {id:prior.id,duplicate:true,updated:false};
        const reversal=env.DB.prepare(`INSERT OR IGNORE INTO monetization_revenue_events
          (id,transaction_id,event_type,source,brand_id,content_item_id,campaign_id,offer_id,gross_amount,fee_amount,cost_amount,
           net_amount,margin_amount,currency,status,external_reference,idempotency_key,metadata_json,occurred_at)
          VALUES (?1,?2,'chargeback',?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'refunded',?14,?15,?16,COALESCE(?17,CURRENT_TIMESTAMP))`)
          .bind(reversalId,existing.transaction_id,existing.source,BRAND_ID,existing.content_item_id,existing.campaign_id,existing.offer_id,
            -i(existing.gross_amount),-i(existing.fee_amount),-i(existing.cost_amount),
            -i(existing.net_amount),-i(existing.margin_amount),existing.currency,existing.external_reference,reversalKey,
            jsonString({lifecycle:'confirmed_to_rejected',reversesRevenueEventId:existing.id,rawPayloadStored:false}),normalized.occurredAt);
        const quality=await monetizationQualityEnabled(env);
        const invalidationReason='Confirmed provider revenue was reversed; original and clawback require joint re-verification.';
        const results=quality?await env.DB.batch([
          reversal,
          unknownQualityStatement(env,'revenue_event',reversalId,'Provider clawback awaits provenance verification.'),
          guardedInvalidationHistoryStatement(env,'revenue_event',String(existing.id),invalidationReason,reversalKey,reversalId),
          guardedInvalidationStatement(env,'revenue_event',String(existing.id),invalidationReason,reversalId)
        ]):[await reversal.run()];
        if(Number(results[0]?.meta.changes??0)===0){
          const canonical=await env.DB.prepare(`SELECT id FROM monetization_revenue_events WHERE idempotency_key=?1`).bind(reversalKey).first<{id:string}>();
          if(!canonical?.id)throw new Error('Provider clawback tidak dapat disimpan.');
          return {id:canonical.id,duplicate:true,updated:false};
        }
        return {id:reversalId,duplicate:false,updated:true};
      }
      return { id: String(existing?.id ?? id), duplicate: true, updated: false };
    }
    throw error;
  }
  return { id, duplicate: false, updated: false };
}

async function findTouchpoints(visitorId: string, env: MonetizationEnv): Promise<Array<Record<string, unknown>>> {
  const quality=await monetizationQualityEnabled(env);
  const qualityScope=verifiedQualityFilter(quality,'event','e');
  const result = await env.DB.prepare(`SELECT id,event_type,content_item_id,campaign_id,offer_id,platform,occurred_at
    FROM monetization_events e WHERE brand_id=?1 AND visitor_id=?2
      AND event_type IN ('impression','click','affiliate_click','landing_view','lead','checkout')
      ${qualityScope}
    ORDER BY occurred_at ASC LIMIT 500`).bind(BRAND_ID, visitorId).all();
  return (result.results ?? []) as Array<Record<string, unknown>>;
}

export async function attributeRevenue(
  revenueEventId: string, visitorId: string | null, env: MonetizationEnv, updateExisting=true
): Promise<Record<string, unknown>> {
  const revenue = await env.DB.prepare('SELECT * FROM monetization_revenue_events WHERE id=?1 AND brand_id=?2').bind(revenueEventId, BRAND_ID).first<Record<string, unknown>>();
  if (!revenue) throw new Error('Revenue event tidak ditemukan.');
  const directContent = s(revenue.content_item_id,100); const directCampaign = s(revenue.campaign_id,100); const directOffer = s(revenue.offer_id,100);
  const touches = visitorId ? await findTouchpoints(visitorId, env) : [];
  const first = touches[0] ?? null; const last = touches[touches.length - 1] ?? null;
  let status: 'attributed'|'partial'|'unattributed' = 'unattributed';
  let reason = 'Tidak ada visitor/touchpoint atau direct mapping.';
  if (first || last || directContent || directCampaign || directOffer) {
    status = first && last ? 'attributed' : 'partial';
    reason = directContent || directCampaign || directOffer ? 'Direct/provider mapping tersedia; touchpoint dilengkapi jika ada.' : 'Touchpoint first/last tersedia.';
  }
  const id = uid('att');
  const conflictClause=updateExisting?`DO UPDATE SET
      visitor_id=excluded.visitor_id,model=excluded.model,first_event_id=excluded.first_event_id,first_content_item_id=excluded.first_content_item_id,
      first_campaign_id=excluded.first_campaign_id,first_offer_id=excluded.first_offer_id,first_platform=excluded.first_platform,last_event_id=excluded.last_event_id,
      last_content_item_id=excluded.last_content_item_id,last_campaign_id=excluded.last_campaign_id,last_offer_id=excluded.last_offer_id,last_platform=excluded.last_platform,
      attribution_status=excluded.attribution_status,reason=excluded.reason,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`:'DO NOTHING';
  await env.DB.prepare(`INSERT INTO monetization_attributions
    (id,brand_id,revenue_event_id,visitor_id,model,first_event_id,first_content_item_id,first_campaign_id,first_offer_id,first_platform,
     last_event_id,last_content_item_id,last_campaign_id,last_offer_id,last_platform,attribution_status,reason,metadata_json)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
    ON CONFLICT(revenue_event_id) ${conflictClause}`)
    .bind(id, BRAND_ID, revenueEventId, visitorId, status === 'unattributed' ? 'unattributed' : 'first_last',
      first?.id ?? null, first?.content_item_id ?? directContent, first?.campaign_id ?? directCampaign, first?.offer_id ?? directOffer, first?.platform ?? null,
      last?.id ?? null, last?.content_item_id ?? directContent, last?.campaign_id ?? directCampaign, last?.offer_id ?? directOffer, last?.platform ?? null,
      status, reason, jsonString({ touchpointCount: touches.length })).run();
  return (await env.DB.prepare('SELECT * FROM monetization_attributions WHERE revenue_event_id=?1').bind(revenueEventId).first<Record<string, unknown>>()) ?? {};
}

async function ingestProviderRevenue(normalized: NormalizedRevenue, env: MonetizationEnv): Promise<ApiResult> {
  const inserted = await insertRevenue(normalized, env);
  const existingAttribution=inserted.duplicate&&!inserted.updated
    ?await env.DB.prepare(`SELECT * FROM monetization_attributions WHERE revenue_event_id=?1`).bind(inserted.id).first<Record<string,unknown>>()
    :null;
  const attribution = existingAttribution??await attributeRevenue(
    inserted.id,normalized.visitorId??null,env,!(inserted.duplicate&&!inserted.updated)
  );
  await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,correlation_id,metadata_json)
    VALUES (?1,'revenue_ingest',?2,?3,?4)`)
    .bind(normalized.source, inserted.duplicate ? 'duplicate' : 'success', normalized.transactionId, jsonString({ revenueEventId: inserted.id, lifecycleUpdated: inserted.updated, attributionStatus: attribution.attribution_status ?? null })).run();
  return { status: inserted.duplicate || inserted.updated ? 200 : 201, body: { ok: true, duplicate: inserted.duplicate, updated: inserted.updated, revenueEventId: inserted.id, attribution } };
}

export async function ingestLynkWebhook(request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const verified = await verifyGenericWebhook(request, env.LYNK_WEBHOOK_SECRET);
  if (!verified.ok) return { status: 401, body: { ok: false, error: verified.error } };
  try {
    const normalized = await normalizeLynk(pickObject(JSON.parse(verified.rawBody)), env);
    return await ingestProviderRevenue(normalized, env);
  } catch (error) {
    await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,error_message,metadata_json) VALUES ('lynk','webhook','error',?1,?2)`)
      .bind(error instanceof Error ? error.message : 'Invalid Lynk webhook', jsonString({ receivedAt: new Date().toISOString() })).run();
    return { status: 400, body: { ok: false, error: error instanceof Error ? error.message : 'Lynk webhook tidak valid.' } };
  }
}

export async function ingestAffiliateConversion(request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const body = await request.json<Record<string, unknown>>();
  try { return await ingestProviderRevenue(await normalizeAffiliate(body, env), env); }
  catch (error) { return { status: 400, body: { ok: false, error: error instanceof Error ? error.message : 'Affiliate conversion tidak valid.' } }; }
}

export async function funnelAnalytics(env: MonetizationEnv, url: URL): Promise<ApiResult> {
  const days = Math.max(1, Math.min(365, i(url.searchParams.get('days'), 30)));
  const since = `-${days} days`;
  const quality=await monetizationQualityEnabled(env);
  const eventScope=verifiedQualityFilter(quality,'event','e'),revenueScope=verifiedQualityFilter(quality,'revenue_event','r');
  const row = await env.DB.prepare(`SELECT
    SUM(CASE WHEN event_type='impression' THEN 1 ELSE 0 END) impressions,
    SUM(CASE WHEN event_type IN ('click','affiliate_click') THEN 1 ELSE 0 END) clicks,
    SUM(CASE WHEN event_type='landing_view' THEN 1 ELSE 0 END) landing_views,
    SUM(CASE WHEN event_type='lead' THEN 1 ELSE 0 END) leads,
    SUM(CASE WHEN event_type='checkout' THEN 1 ELSE 0 END) checkouts,
    SUM(CASE WHEN event_type IN ('purchase','affiliate_conversion') THEN 1 ELSE 0 END) conversions
    FROM monetization_events e WHERE brand_id=?1 AND occurred_at>=datetime('now',?2) ${eventScope}`)
    .bind(BRAND_ID, since).first<Record<string, number>>();
  const revenue = await env.DB.prepare(`SELECT COUNT(*) transactions,COALESCE(SUM(gross_amount),0) gross,COALESCE(SUM(net_amount),0) net,COALESCE(SUM(margin_amount),0) profit
    FROM monetization_revenue_events r WHERE brand_id=?1 AND occurred_at>=datetime('now',?2) AND status IN ('confirmed','refunded') ${revenueScope}`).bind(BRAND_ID,since).first<Record<string,number>>();
  const impressions=i(row?.impressions), clicks=i(row?.clicks), landing=i(row?.landing_views), leads=i(row?.leads), checkouts=i(row?.checkouts), conversions=i(row?.conversions);
  const rate=(num:number,den:number)=>den>0?Number((num/den*100).toFixed(2)):null;
  return { status:200, body:{ ok:true,periodDays:days,dataScope:quality?'verified-production':'legacy-unclassified',counts:{impressions,clicks,landingViews:landing,leads,checkouts,conversions},rates:{ctr:rate(clicks,impressions),landingRate:rate(landing,clicks),leadRate:rate(leads,landing),checkoutRate:rate(checkouts,landing),conversionRate:rate(conversions,landing)},revenue:{transactions:i(revenue?.transactions),gross:i(revenue?.gross),net:i(revenue?.net),contributionProfit:i(revenue?.profit),contributionMarginRecorded:i(revenue?.profit),accountingProfit:null,revenuePerClick:clicks>0?Math.round(i(revenue?.net)/clicks):null,revenuePerThousandImpressions:impressions>0?Math.round(i(revenue?.net)/impressions*1000):null}} };
}

export async function attributionReport(env: MonetizationEnv, url: URL): Promise<ApiResult> {
  const days=Math.max(1,Math.min(365,i(url.searchParams.get('days'),30))); const since=`-${days} days`;
  const quality=await monetizationQualityEnabled(env),revenueScope=verifiedQualityFilter(quality,'revenue_event','r');
  const revenueContent=quality?"COALESCE(r.content_item_id,'unattributed')":"COALESCE(a.last_content_item_id,a.first_content_item_id,r.content_item_id,'unattributed')";
  const summary=await env.DB.prepare(`SELECT attribution_status,COUNT(*) total,COALESCE(SUM(r.net_amount),0) net_revenue,COALESCE(SUM(r.margin_amount),0) profit
    FROM monetization_attributions a JOIN monetization_revenue_events r ON r.id=a.revenue_event_id
    WHERE a.brand_id=?1 AND r.occurred_at>=datetime('now',?2) AND r.status IN ('confirmed','refunded') ${revenueScope}
    GROUP BY attribution_status ORDER BY total DESC`).bind(BRAND_ID,since).all();
  const byContent=await env.DB.prepare(`SELECT ${revenueContent} content_item_id,
    COUNT(*) conversions,COALESCE(SUM(r.net_amount),0) net_revenue,COALESCE(SUM(r.margin_amount),0) profit
    FROM monetization_revenue_events r LEFT JOIN monetization_attributions a ON a.revenue_event_id=r.id
    WHERE r.brand_id=?1 AND r.occurred_at>=datetime('now',?2) AND r.status IN ('confirmed','refunded') ${revenueScope}
    GROUP BY 1 ORDER BY profit DESC LIMIT 100`).bind(BRAND_ID,since).all();
  return {status:200,body:{ok:true,periodDays:days,dataScope:quality?'verified-production':'legacy-unclassified',attributionStatus:summary.results??[],byContent:byContent.results??[]}};
}

export async function runReconciliation(request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const body=await request.json<Record<string,unknown>>(); const source=s(body.source,80); const start=s(body.periodStart,50); const end=s(body.periodEnd,50);
  if(!source||!start||!end) return {status:400,body:{ok:false,error:'source, periodStart, periodEnd wajib.'}};
  const extCount=i(body.externalTransactionCount); const extGross=i(body.externalGrossAmount);
  const quality=await monetizationQualityEnabled(env),revenueScope=verifiedQualityFilter(quality,'revenue_event','r');
  const ledger=await env.DB.prepare(`SELECT COUNT(*) total,COALESCE(SUM(gross_amount),0) gross FROM monetization_revenue_events r
    WHERE brand_id=?1 AND source=?2 AND occurred_at>=?3 AND occurred_at<=?4 AND status IN ('confirmed','refunded') ${revenueScope}`).bind(BRAND_ID,source,start,end).first<Record<string,number>>();
  const ledgerCount=i(ledger?.total); const ledgerGross=i(ledger?.gross); const countDelta=ledgerCount-extCount; const grossDelta=ledgerGross-extGross;
  const status=countDelta===0&&grossDelta===0?'matched':'mismatch'; const id=uid('rec');
  await env.DB.prepare(`INSERT INTO monetization_reconciliation_runs
    (id,brand_id,source,period_start,period_end,external_transaction_count,external_gross_amount,ledger_transaction_count,ledger_gross_amount,transaction_count_delta,gross_amount_delta,status,metadata_json)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`)
    .bind(id,BRAND_ID,source,start,end,extCount,extGross,ledgerCount,ledgerGross,countDelta,grossDelta,status,jsonString(body.metadata)).run();
  if(status==='mismatch') await env.DB.prepare(`INSERT INTO monetization_reconciliation_items(reconciliation_run_id,issue_type,expected_amount,ledger_amount,notes) VALUES (?1,'aggregate_mismatch',?2,?3,?4)`)
    .bind(id,extGross,ledgerGross,`transaction_count_delta=${countDelta}`).run();
  return {status:201,body:{ok:true,reconciliation:{id,source,periodStart:start,periodEnd:end,status,dataScope:quality?'verified-production':'legacy-unclassified',external:{transactions:extCount,gross:extGross},ledger:{transactions:ledgerCount,gross:ledgerGross},delta:{transactions:countDelta,gross:grossDelta}}}};
}

export async function listReconciliations(env: MonetizationEnv): Promise<ApiResult> {
  const result=await env.DB.prepare(`SELECT * FROM monetization_reconciliation_runs WHERE brand_id=?1 ORDER BY created_at DESC LIMIT 100`).bind(BRAND_ID).all();
  return {status:200,body:{ok:true,reconciliations:result.results??[]}};
}
