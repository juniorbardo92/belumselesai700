var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/monetization-quality.ts
async function monetizationQualityEnabled(env) {
  return Boolean(await env.DB.prepare(`SELECT name FROM sqlite_master
    WHERE type='table' AND name='monetization_record_quality'`).first());
}
__name(monetizationQualityEnabled, "monetizationQualityEnabled");
function verifiedQualityFilter(enabled, recordType, alias) {
  if (!enabled) return "";
  const lifecycleScope = recordType === "revenue_event" ? `AND (${alias}.transaction_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM monetization_revenue_events lifecycle_member
    WHERE lifecycle_member.brand_id=${alias}.brand_id AND lifecycle_member.source=${alias}.source
      AND lifecycle_member.transaction_id=${alias}.transaction_id
      AND NOT EXISTS (SELECT 1 FROM monetization_record_quality lifecycle_quality
        WHERE lifecycle_quality.record_type='revenue_event' AND lifecycle_quality.record_id=lifecycle_member.id
          AND lifecycle_quality.data_class='production' AND lifecycle_quality.verification_status='verified'
          AND NULLIF(TRIM(lifecycle_quality.evidence_ref),'') IS NOT NULL
          AND NULLIF(TRIM(lifecycle_quality.reason),'') IS NOT NULL)
  )) AND NOT EXISTS (
    SELECT 1 FROM monetization_attributions attribution_scope
    WHERE attribution_scope.brand_id=${alias}.brand_id AND attribution_scope.revenue_event_id=${alias}.id
      AND ((attribution_scope.first_event_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM monetization_record_quality first_quality
        WHERE first_quality.record_type='event' AND first_quality.record_id=attribution_scope.first_event_id
          AND first_quality.data_class='production' AND first_quality.verification_status='verified'
          AND NULLIF(TRIM(first_quality.evidence_ref),'') IS NOT NULL AND NULLIF(TRIM(first_quality.reason),'') IS NOT NULL
      )) OR (attribution_scope.last_event_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM monetization_record_quality last_quality
        WHERE last_quality.record_type='event' AND last_quality.record_id=attribution_scope.last_event_id
          AND last_quality.data_class='production' AND last_quality.verification_status='verified'
          AND NULLIF(TRIM(last_quality.evidence_ref),'') IS NOT NULL AND NULLIF(TRIM(last_quality.reason),'') IS NOT NULL
      )))
  )` : "";
  return `AND EXISTS (SELECT 1 FROM monetization_record_quality quality_scope
    WHERE quality_scope.record_type='${recordType}' AND quality_scope.record_id=${alias}.id
      AND quality_scope.data_class='production' AND quality_scope.verification_status='verified'
      AND NULLIF(TRIM(quality_scope.evidence_ref),'') IS NOT NULL AND NULLIF(TRIM(quality_scope.reason),'') IS NOT NULL) ${lifecycleScope}`;
}
__name(verifiedQualityFilter, "verifiedQualityFilter");
function unknownQualityStatement(env, recordType, recordId, reason) {
  const sourceTable = recordType === "event" ? "monetization_events" : recordType === "revenue_event" ? "monetization_revenue_events" : "monetization_learning_insights";
  return env.DB.prepare(`INSERT INTO monetization_record_quality
    (record_type,record_id,data_class,verification_status,amount_basis,fee_status,cost_status,reason,metadata_json)
    SELECT ?1,?2,'unknown','unverified',?3,?4,?5,?6,?7
    WHERE EXISTS (SELECT 1 FROM ${sourceTable} WHERE id=?2)
    ON CONFLICT(record_type,record_id) DO UPDATE SET
      data_class='unknown',verification_status='unverified',amount_basis=excluded.amount_basis,
      fee_status=excluded.fee_status,cost_status=excluded.cost_status,evidence_ref=NULL,
      reason=excluded.reason,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(
    recordType,
    recordId,
    recordType === "revenue_event" ? "unknown" : null,
    recordType === "revenue_event" ? "unknown" : null,
    recordType === "revenue_event" ? "unknown" : null,
    reason,
    JSON.stringify({ classificationRequired: true, createdAutomatically: true })
  );
}
__name(unknownQualityStatement, "unknownQualityStatement");
function mutationGuardedInvalidationStatement(env, recordType, recordId, reason, guardRevenueId, mutationId) {
  return env.DB.prepare(`INSERT INTO monetization_record_quality
    (record_type,record_id,data_class,verification_status,amount_basis,fee_status,cost_status,evidence_ref,reason,metadata_json)
    SELECT ?1,?2,'unknown','unverified',?3,?4,?5,NULL,?6,?7
    WHERE EXISTS (SELECT 1 FROM monetization_revenue_events
      WHERE id=?8 AND json_extract(metadata_json,'$.lifecycleMutationId')=?9)
    ON CONFLICT(record_type,record_id) DO UPDATE SET
      data_class='unknown',verification_status='unverified',amount_basis=excluded.amount_basis,
      fee_status=excluded.fee_status,cost_status=excluded.cost_status,evidence_ref=NULL,
      reason=excluded.reason,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(
    recordType,
    recordId,
    recordType === "revenue_event" ? "unknown" : null,
    recordType === "revenue_event" ? "unknown" : null,
    recordType === "revenue_event" ? "unknown" : null,
    reason,
    JSON.stringify({ classificationRequired: true, invalidatedAutomatically: true }),
    guardRevenueId,
    mutationId
  );
}
__name(mutationGuardedInvalidationStatement, "mutationGuardedInvalidationStatement");
function mutationGuardedInvalidationHistoryStatement(env, recordType, recordId, reason, correlationId, guardRevenueId, mutationId) {
  return env.DB.prepare(`INSERT INTO monetization_record_quality_history
    (id,record_type,record_id,previous_data_class,previous_verification_status,previous_evidence_ref,previous_reason,previous_metadata_json,
     new_data_class,new_verification_status,evidence_ref,reason,new_metadata_json,actor_type,correlation_id,metadata_json)
    SELECT ?1,?2,?3,q.data_class,q.verification_status,q.evidence_ref,q.reason,q.metadata_json,
      'unknown','unverified',NULL,?4,?6,'system_lifecycle',?5,?6
    FROM monetization_record_quality q
    WHERE q.record_type=?2 AND q.record_id=?3 AND EXISTS (SELECT 1 FROM monetization_revenue_events
      WHERE id=?7 AND json_extract(metadata_json,'$.lifecycleMutationId')=?8)`).bind(
    `qhist-${crypto.randomUUID()}`,
    recordType,
    recordId,
    reason,
    correlationId,
    JSON.stringify({ source: "automatic_invalidation", identityPersisted: false }),
    guardRevenueId,
    mutationId
  );
}
__name(mutationGuardedInvalidationHistoryStatement, "mutationGuardedInvalidationHistoryStatement");
function guardedInvalidationStatement(env, recordType, recordId, reason, guardRevenueId) {
  return env.DB.prepare(`INSERT INTO monetization_record_quality
    (record_type,record_id,data_class,verification_status,amount_basis,fee_status,cost_status,evidence_ref,reason,metadata_json)
    SELECT ?1,?2,'unknown','unverified',?3,?4,?5,NULL,?6,?7
    WHERE EXISTS (SELECT 1 FROM monetization_revenue_events WHERE id=?8)
    ON CONFLICT(record_type,record_id) DO UPDATE SET
      data_class='unknown',verification_status='unverified',amount_basis=excluded.amount_basis,
      fee_status=excluded.fee_status,cost_status=excluded.cost_status,evidence_ref=NULL,
      reason=excluded.reason,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(
    recordType,
    recordId,
    recordType === "revenue_event" ? "unknown" : null,
    recordType === "revenue_event" ? "unknown" : null,
    recordType === "revenue_event" ? "unknown" : null,
    reason,
    JSON.stringify({ classificationRequired: true, invalidatedAutomatically: true }),
    guardRevenueId
  );
}
__name(guardedInvalidationStatement, "guardedInvalidationStatement");
function guardedInvalidationHistoryStatement(env, recordType, recordId, reason, correlationId, guardRevenueId) {
  return env.DB.prepare(`INSERT INTO monetization_record_quality_history
    (id,record_type,record_id,previous_data_class,previous_verification_status,previous_evidence_ref,previous_reason,previous_metadata_json,
     new_data_class,new_verification_status,evidence_ref,reason,new_metadata_json,actor_type,correlation_id,metadata_json)
    SELECT ?1,?2,?3,q.data_class,q.verification_status,q.evidence_ref,q.reason,q.metadata_json,
      'unknown','unverified',NULL,?4,?6,'system_lifecycle',?5,?6
    FROM monetization_record_quality q
    WHERE q.record_type=?2 AND q.record_id=?3 AND EXISTS (SELECT 1 FROM monetization_revenue_events WHERE id=?7)`).bind(
    `qhist-${crypto.randomUUID()}`,
    recordType,
    recordId,
    reason,
    correlationId,
    JSON.stringify({ source: "automatic_invalidation", identityPersisted: false }),
    guardRevenueId
  );
}
__name(guardedInvalidationHistoryStatement, "guardedInvalidationHistoryStatement");

// src/monetization-worker.ts
var BRAND_ID = "brand-umkm-naik-kelas";
var JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
var SECURITY_HEADERS = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};
function withSecurity(headers) {
  const result = new Headers(headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) result.set(key, value);
  return result;
}
__name(withSecurity, "withSecurity");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: withSecurity(JSON_HEADERS) });
}
__name(json, "json");
function redirect(url, status = 302) {
  return new Response(null, { status, headers: withSecurity({ Location: url, "Cache-Control": "no-store" }) });
}
__name(redirect, "redirect");
function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
__name(uid, "uid");
function safeJson(value) {
  return JSON.stringify(value ?? {});
}
__name(safeJson, "safeJson");
function recordValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
__name(recordValue, "recordValue");
function revenueMetadata(body, extra = {}) {
  const metadata = { ...recordValue(body.metadata), ...extra };
  metadata.financialCompleteness = {
    fee: body.feeAmount === void 0 ? "unknown" : "reported",
    cost: body.costAmount === void 0 ? "unknown" : "reported"
  };
  return safeJson(metadata);
}
__name(revenueMetadata, "revenueMetadata");
async function parseJsonObject(request) {
  const raw = await request.json();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Body JSON harus berupa object.");
  return raw;
}
__name(parseJsonObject, "parseJsonObject");
function stringValue(value, max = 500) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}
__name(stringValue, "stringValue");
function integerValue(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number);
}
__name(integerValue, "integerValue");
function strictIntegerField(body, key, fallback = 0) {
  if (body[key] === void 0) return { valid: true, present: false, value: fallback };
  const raw = body[key];
  const value = typeof raw === "number" ? raw : typeof raw === "string" && /^-?(0|[1-9]\d*)$/.test(raw.trim()) ? Number(raw) : Number.NaN;
  return { valid: Number.isSafeInteger(value), present: true, value: Number.isSafeInteger(value) ? value : fallback };
}
__name(strictIntegerField, "strictIntegerField");
function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
__name(numberValue, "numberValue");
function allowedValue(value, allowed, fallback) {
  if (typeof value !== "string") return fallback ?? null;
  return allowed.includes(value) ? value : fallback ?? null;
}
__name(allowedValue, "allowedValue");
function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
__name(isHttpUrl, "isHttpUrl");
function requireIngestToken(request, env) {
  if (!env.MONETIZATION_INGEST_TOKEN) return null;
  const supplied = request.headers.get("Authorization");
  if (supplied === `Bearer ${env.MONETIZATION_INGEST_TOKEN}`) return null;
  return json({ ok: false, error: "Unauthorized" }, 401);
}
__name(requireIngestToken, "requireIngestToken");
var OFFER_TYPES = ["own_product", "affiliate", "lead_generation", "service", "app_install", "free_lead_magnet"];
var OFFER_STATUSES = ["draft", "active", "paused", "archived"];
var CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed", "archived"];
var LINK_STATUSES = ["active", "paused", "archived"];
var GOALS = ["none", "awareness", "traffic", "lead", "affiliate", "own_product", "app_install", "service"];
var EVENT_TYPES = ["impression", "click", "landing_view", "lead", "checkout", "purchase", "refund", "affiliate_click", "affiliate_conversion", "app_install", "app_open", "signup", "tool_used"];
var REVENUE_TYPES = ["sale", "affiliate_commission", "subscription", "refund", "chargeback", "lead_value", "service_conversion"];
var REVENUE_STATUSES = ["pending", "confirmed", "refunded", "rejected"];
async function listOffers(env, url) {
  const status = stringValue(url.searchParams.get("status"), 20);
  const type = stringValue(url.searchParams.get("type"), 40);
  let sql = "SELECT * FROM monetization_offers WHERE brand_id = ?1";
  const binds = [BRAND_ID];
  if (status) {
    sql += ` AND status = ?${binds.length + 1}`;
    binds.push(status);
  }
  if (type) {
    sql += ` AND type = ?${binds.length + 1}`;
    binds.push(type);
  }
  sql += " ORDER BY updated_at DESC, created_at DESC LIMIT 250";
  const result = await env.DB.prepare(sql).bind(...binds).all();
  return { status: 200, body: { ok: true, offers: result.results ?? [] } };
}
__name(listOffers, "listOffers");
async function createOffer(request, env) {
  const body = await parseJsonObject(request);
  const name = stringValue(body.name, 160);
  const type = allowedValue(body.type, OFFER_TYPES);
  if (!name || !type) return { status: 400, body: { ok: false, error: "name dan type offer wajib valid." } };
  const destinationUrl = stringValue(body.destinationUrl, 2e3);
  if (destinationUrl && !isHttpUrl(destinationUrl)) return { status: 400, body: { ok: false, error: "destinationUrl tidak valid." } };
  const id = stringValue(body.id, 100) ?? uid("off");
  const status = allowedValue(body.status, OFFER_STATUSES, "draft");
  await env.DB.prepare(`INSERT INTO monetization_offers (
    id, brand_id, name, type, category, description, destination_url, price_amount, currency,
    commission_type, commission_value, estimated_margin_amount, audience, problem_solved, status, metadata_json
  ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)`).bind(
    id,
    BRAND_ID,
    name,
    type,
    stringValue(body.category, 120),
    stringValue(body.description, 3e3),
    destinationUrl,
    integerValue(body.priceAmount),
    stringValue(body.currency, 8) ?? "IDR",
    allowedValue(body.commissionType, ["percent", "fixed"]),
    numberValue(body.commissionValue),
    integerValue(body.estimatedMarginAmount),
    stringValue(body.audience, 500),
    stringValue(body.problemSolved, 1e3),
    status,
    safeJson(body.metadata)
  ).run();
  const offer = await env.DB.prepare("SELECT * FROM monetization_offers WHERE id = ?1").bind(id).first();
  return { status: 201, body: { ok: true, offer } };
}
__name(createOffer, "createOffer");
async function updateOffer(id, request, env) {
  const current = await env.DB.prepare("SELECT * FROM monetization_offers WHERE id = ?1 AND brand_id = ?2").bind(id, BRAND_ID).first();
  if (!current) return { status: 404, body: { ok: false, error: "Offer tidak ditemukan." } };
  const body = await parseJsonObject(request);
  const name = stringValue(body.name, 160) ?? String(current.name);
  const type = allowedValue(body.type, OFFER_TYPES) ?? String(current.type);
  const status = allowedValue(body.status, OFFER_STATUSES) ?? String(current.status);
  const destinationUrl = body.destinationUrl === null ? null : stringValue(body.destinationUrl, 2e3) ?? current.destination_url;
  if (destinationUrl && !isHttpUrl(destinationUrl)) return { status: 400, body: { ok: false, error: "destinationUrl tidak valid." } };
  await env.DB.prepare(`UPDATE monetization_offers SET
    name=?2,type=?3,category=?4,description=?5,destination_url=?6,price_amount=?7,currency=?8,
    commission_type=?9,commission_value=?10,estimated_margin_amount=?11,audience=?12,problem_solved=?13,status=?14,
    metadata_json=?15,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND brand_id=?16`).bind(
    id,
    name,
    type,
    body.category === null ? null : stringValue(body.category, 120) ?? current.category,
    body.description === null ? null : stringValue(body.description, 3e3) ?? current.description,
    destinationUrl,
    body.priceAmount === void 0 ? current.price_amount : integerValue(body.priceAmount),
    stringValue(body.currency, 8) ?? String(current.currency ?? "IDR"),
    body.commissionType === null ? null : allowedValue(body.commissionType, ["percent", "fixed"]) ?? current.commission_type,
    body.commissionValue === void 0 ? current.commission_value : numberValue(body.commissionValue),
    body.estimatedMarginAmount === void 0 ? current.estimated_margin_amount : integerValue(body.estimatedMarginAmount),
    body.audience === null ? null : stringValue(body.audience, 500) ?? current.audience,
    body.problemSolved === null ? null : stringValue(body.problemSolved, 1e3) ?? current.problem_solved,
    status,
    body.metadata === void 0 ? String(current.metadata_json ?? "{}") : safeJson(body.metadata),
    BRAND_ID
  ).run();
  const offer = await env.DB.prepare("SELECT * FROM monetization_offers WHERE id = ?1").bind(id).first();
  return { status: 200, body: { ok: true, offer } };
}
__name(updateOffer, "updateOffer");
async function listCampaigns(env) {
  const result = await env.DB.prepare("SELECT * FROM monetization_campaigns WHERE brand_id=?1 ORDER BY updated_at DESC LIMIT 250").bind(BRAND_ID).all();
  return { status: 200, body: { ok: true, campaigns: result.results ?? [] } };
}
__name(listCampaigns, "listCampaigns");
async function createCampaign(request, env) {
  const body = await parseJsonObject(request);
  const name = stringValue(body.name, 160);
  const objective = stringValue(body.objective, 80);
  if (!name || !objective) return { status: 400, body: { ok: false, error: "name dan objective campaign wajib." } };
  const id = stringValue(body.id, 100) ?? uid("cam");
  const status = allowedValue(body.status, CAMPAIGN_STATUSES, "draft");
  const offerId = stringValue(body.offerId, 100);
  if (offerId) {
    const offer = await env.DB.prepare("SELECT id FROM monetization_offers WHERE id=?1 AND brand_id=?2").bind(offerId, BRAND_ID).first();
    if (!offer) return { status: 400, body: { ok: false, error: "offerId campaign tidak valid untuk brand ini." } };
  }
  await env.DB.prepare(`INSERT INTO monetization_campaigns (id,brand_id,name,objective,offer_id,status,starts_at,ends_at,metadata_json)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`).bind(id, BRAND_ID, name, objective, offerId, status, stringValue(body.startsAt, 40), stringValue(body.endsAt, 40), safeJson(body.metadata)).run();
  const campaign = await env.DB.prepare("SELECT * FROM monetization_campaigns WHERE id=?1").bind(id).first();
  return { status: 201, body: { ok: true, campaign } };
}
__name(createCampaign, "createCampaign");
async function updateCampaign(id, request, env) {
  const current = await env.DB.prepare("SELECT * FROM monetization_campaigns WHERE id=?1 AND brand_id=?2").bind(id, BRAND_ID).first();
  if (!current) return { status: 404, body: { ok: false, error: "Campaign tidak ditemukan." } };
  const body = await parseJsonObject(request);
  const offerId = body.offerId === null ? null : stringValue(body.offerId, 100) ?? current.offer_id;
  if (offerId) {
    const offer = await env.DB.prepare("SELECT id FROM monetization_offers WHERE id=?1 AND brand_id=?2").bind(offerId, BRAND_ID).first();
    if (!offer) return { status: 400, body: { ok: false, error: "offerId campaign tidak valid untuk brand ini." } };
  }
  const status = allowedValue(body.status, CAMPAIGN_STATUSES) ?? String(current.status);
  await env.DB.prepare(`UPDATE monetization_campaigns SET
    name=?2,objective=?3,offer_id=?4,status=?5,starts_at=?6,ends_at=?7,metadata_json=?8,updated_at=CURRENT_TIMESTAMP
    WHERE id=?1 AND brand_id=?9`).bind(
    id,
    stringValue(body.name, 160) ?? String(current.name),
    stringValue(body.objective, 80) ?? String(current.objective),
    offerId,
    status,
    body.startsAt === null ? null : stringValue(body.startsAt, 40) ?? current.starts_at,
    body.endsAt === null ? null : stringValue(body.endsAt, 40) ?? current.ends_at,
    body.metadata === void 0 ? String(current.metadata_json ?? "{}") : safeJson(body.metadata),
    BRAND_ID
  ).run();
  return { status: 200, body: { ok: true, campaign: await env.DB.prepare("SELECT * FROM monetization_campaigns WHERE id=?1").bind(id).first() } };
}
__name(updateCampaign, "updateCampaign");
async function validateLinkReferences(env, contentId, campaignId, offerId) {
  const statements = [];
  if (contentId) statements.push(env.DB.prepare("SELECT id FROM content_items WHERE id=?1 AND brand_id=?2").bind(contentId, BRAND_ID));
  if (campaignId) statements.push(env.DB.prepare("SELECT id,offer_id FROM monetization_campaigns WHERE id=?1 AND brand_id=?2").bind(campaignId, BRAND_ID));
  if (offerId) statements.push(env.DB.prepare("SELECT id FROM monetization_offers WHERE id=?1 AND brand_id=?2").bind(offerId, BRAND_ID));
  const results = statements.length ? await env.DB.batch(statements) : [];
  let index = 0;
  if (contentId && !results[index++]?.results[0]) return "contentItemId tidak valid untuk brand ini.";
  const campaign = campaignId ? results[index++]?.results[0] : null;
  if (campaignId && !campaign) return "campaignId tidak valid untuk brand ini.";
  if (offerId && !results[index++]?.results[0]) return "offerId tidak valid untuk brand ini.";
  if (campaign && offerId && campaign.offer_id && String(campaign.offer_id) !== offerId) return "offerId tidak sama dengan offer milik campaign.";
  return null;
}
__name(validateLinkReferences, "validateLinkReferences");
async function validateLinkGraph(env, contentId, campaignId, offerId, requireActive) {
  const basic = await validateLinkReferences(env, contentId, campaignId, offerId);
  if (basic) return { error: basic, effectiveOfferId: offerId };
  const campaign = campaignId ? await env.DB.prepare(`SELECT id,offer_id,status FROM monetization_campaigns WHERE id=?1 AND brand_id=?2`).bind(campaignId, BRAND_ID).first() : null;
  const campaignOffer = campaign?.offer_id ? String(campaign.offer_id) : null;
  const effectiveOfferId = offerId ?? campaignOffer;
  if (offerId && campaignOffer && offerId !== campaignOffer) return { error: "offerId tidak sama dengan offer milik campaign.", effectiveOfferId };
  const offer = effectiveOfferId ? await env.DB.prepare(`SELECT id,status FROM monetization_offers WHERE id=?1 AND brand_id=?2`).bind(effectiveOfferId, BRAND_ID).first() : null;
  if (effectiveOfferId && !offer) return { error: "offer efektif tidak valid untuk brand ini.", effectiveOfferId };
  if (requireActive) {
    if (campaignId && campaign?.status !== "active") return { error: "Campaign harus active sebelum tracked link diaktifkan.", effectiveOfferId };
    if (effectiveOfferId && offer?.status !== "active") return { error: "Offer harus active sebelum tracked link diaktifkan.", effectiveOfferId };
    if (contentId) {
      const mapping = await env.DB.prepare(`SELECT campaign_id,offer_id FROM content_monetization WHERE content_item_id=?1`).bind(contentId).first();
      if (!mapping) return { error: "Mapping monetisasi content wajib ada sebelum tracked link diaktifkan.", effectiveOfferId };
      if ((mapping.campaign_id ? String(mapping.campaign_id) : null) !== campaignId) return { error: "Campaign tracked link tidak sama dengan mapping content.", effectiveOfferId };
      if ((mapping.offer_id ? String(mapping.offer_id) : null) !== effectiveOfferId) return { error: "Offer tracked link tidak sama dengan mapping content.", effectiveOfferId };
    }
  }
  return { error: null, effectiveOfferId };
}
__name(validateLinkGraph, "validateLinkGraph");
async function getContentMonetization(contentId, env) {
  const content = await env.DB.prepare("SELECT id,title,status,platform FROM content_items WHERE id=?1 AND brand_id=?2").bind(contentId, BRAND_ID).first();
  if (!content) return { status: 404, body: { ok: false, error: "Content tidak ditemukan." } };
  const monetization = await env.DB.prepare("SELECT * FROM content_monetization WHERE content_item_id=?1").bind(contentId).first();
  return { status: 200, body: { ok: true, content, monetization: monetization ?? { content_item_id: contentId, monetization_goal: "none", commercial_score: 0 } } };
}
__name(getContentMonetization, "getContentMonetization");
async function saveContentMonetization(contentId, request, env) {
  const content = await env.DB.prepare("SELECT id FROM content_items WHERE id=?1 AND brand_id=?2").bind(contentId, BRAND_ID).first();
  if (!content) return { status: 404, body: { ok: false, error: "Content tidak ditemukan." } };
  const body = await parseJsonObject(request);
  const goal = allowedValue(body.monetizationGoal, GOALS, "none");
  const destinationUrl = stringValue(body.destinationUrl, 2e3);
  if (destinationUrl && !isHttpUrl(destinationUrl)) return { status: 400, body: { ok: false, error: "destinationUrl tidak valid." } };
  const offerId = stringValue(body.offerId, 100);
  const campaignId = stringValue(body.campaignId, 100);
  const relation = await validateLinkGraph(env, contentId, campaignId, offerId, false);
  if (relation.error) return { status: 400, body: { ok: false, error: relation.error } };
  await env.DB.prepare(`INSERT INTO content_monetization (
    content_item_id,monetization_goal,offer_id,campaign_id,cta_id,cta_text,commercial_score,destination_url,metadata_json
  ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
  ON CONFLICT(content_item_id) DO UPDATE SET
    monetization_goal=excluded.monetization_goal,offer_id=excluded.offer_id,campaign_id=excluded.campaign_id,
    cta_id=excluded.cta_id,cta_text=excluded.cta_text,commercial_score=excluded.commercial_score,
    destination_url=excluded.destination_url,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(contentId, goal, relation.effectiveOfferId, campaignId, stringValue(body.ctaId, 100), stringValue(body.ctaText, 800), Math.max(0, Math.min(100, numberValue(body.commercialScore))), destinationUrl, safeJson(body.metadata)).run();
  return getContentMonetization(contentId, env);
}
__name(saveContentMonetization, "saveContentMonetization");
async function createTrackedLink(request, env) {
  const body = await parseJsonObject(request);
  const destinationUrl = stringValue(body.destinationUrl, 2e3);
  if (!destinationUrl || !isHttpUrl(destinationUrl)) return { status: 400, body: { ok: false, error: "destinationUrl wajib berupa http/https URL." } };
  const slug = (stringValue(body.slug, 80) ?? crypto.randomUUID().replaceAll("-", "").slice(0, 10)).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{3,79}$/.test(slug)) return { status: 400, body: { ok: false, error: "slug tidak valid." } };
  const contentId = stringValue(body.contentItemId, 100);
  const campaignId = stringValue(body.campaignId, 100);
  const offerId = stringValue(body.offerId, 100);
  const status = allowedValue(body.status, LINK_STATUSES, "active");
  const relation = await validateLinkGraph(env, contentId, campaignId, offerId, status === "active");
  if (relation.error) return { status: 409, body: { ok: false, error: relation.error } };
  const id = uid("lnk");
  try {
    await env.DB.prepare(`INSERT INTO monetization_tracked_links (
      id,slug,brand_id,content_item_id,campaign_id,offer_id,cta_id,platform,destination_url,status,metadata_json
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`).bind(id, slug, BRAND_ID, contentId, campaignId, relation.effectiveOfferId, stringValue(body.ctaId, 100), stringValue(body.platform, 40), destinationUrl, status, safeJson(body.metadata)).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Link gagal dibuat.";
    if (message.toLowerCase().includes("unique")) return { status: 409, body: { ok: false, error: "slug sudah digunakan." } };
    throw error;
  }
  const link = await env.DB.prepare("SELECT * FROM monetization_tracked_links WHERE id=?1").bind(id).first();
  return { status: 201, body: { ok: true, link } };
}
__name(createTrackedLink, "createTrackedLink");
async function updateTrackedLink(id, request, env) {
  const current = await env.DB.prepare("SELECT * FROM monetization_tracked_links WHERE id=?1 AND brand_id=?2").bind(id, BRAND_ID).first();
  if (!current) return { status: 404, body: { ok: false, error: "Tracked link tidak ditemukan." } };
  const body = await parseJsonObject(request);
  if (body.slug !== void 0 && stringValue(body.slug, 80)?.toLowerCase() !== String(current.slug)) {
    return { status: 400, body: { ok: false, error: "Slug tracked link bersifat immutable." } };
  }
  const destination = body.destinationUrl === void 0 ? String(current.destination_url) : stringValue(body.destinationUrl, 2e3);
  if (!destination || !isHttpUrl(destination)) return { status: 400, body: { ok: false, error: "destinationUrl tidak valid." } };
  if (destination !== String(current.destination_url) && String(current.status) !== "paused") {
    return { status: 409, body: { ok: false, error: "Pause tracked link sebelum mengubah destinationUrl." } };
  }
  const relationKeys = ["contentItemId", "campaignId", "offerId", "ctaId", "platform"];
  if (String(current.status) !== "paused" && relationKeys.some((key) => body[key] !== void 0)) {
    return { status: 409, body: { ok: false, error: "Pause tracked link sebelum mengubah relasi atau platform." } };
  }
  const contentId = body.contentItemId === null ? null : stringValue(body.contentItemId, 100) ?? current.content_item_id;
  const campaignId = body.campaignId === null ? null : stringValue(body.campaignId, 100) ?? current.campaign_id;
  const offerId = body.offerId === null ? null : stringValue(body.offerId, 100) ?? current.offer_id;
  const status = allowedValue(body.status, LINK_STATUSES) ?? String(current.status);
  const relation = await validateLinkGraph(env, contentId, campaignId, offerId, status === "active");
  if (relation.error) return { status: 409, body: { ok: false, error: relation.error } };
  await env.DB.prepare(`UPDATE monetization_tracked_links SET
    content_item_id=?2,campaign_id=?3,offer_id=?4,cta_id=?5,platform=?6,destination_url=?7,status=?8,
    metadata_json=?9,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND brand_id=?10`).bind(
    id,
    contentId,
    campaignId,
    relation.effectiveOfferId,
    body.ctaId === null ? null : stringValue(body.ctaId, 100) ?? current.cta_id,
    body.platform === null ? null : stringValue(body.platform, 40) ?? current.platform,
    destination,
    status,
    body.metadata === void 0 ? String(current.metadata_json ?? "{}") : safeJson(body.metadata),
    BRAND_ID
  ).run();
  return { status: 200, body: { ok: true, link: await env.DB.prepare("SELECT * FROM monetization_tracked_links WHERE id=?1").bind(id).first() } };
}
__name(updateTrackedLink, "updateTrackedLink");
async function listTrackedLinks(env) {
  const result = await env.DB.prepare("SELECT * FROM monetization_tracked_links WHERE brand_id=?1 ORDER BY created_at DESC LIMIT 250").bind(BRAND_ID).all();
  return { status: 200, body: { ok: true, links: result.results ?? [] } };
}
__name(listTrackedLinks, "listTrackedLinks");
async function recordEvent(body, env) {
  const eventType = allowedValue(body.eventType, EVENT_TYPES);
  if (!eventType) throw new Error("eventType tidak valid.");
  const valueField = strictIntegerField(body, "valueAmount");
  if (!valueField.valid) throw new Error("valueAmount harus safe integer.");
  const id = stringValue(body.id, 100) ?? uid("evt");
  const idempotencyKey = stringValue(body.idempotencyKey, 180);
  try {
    const insert = env.DB.prepare(`INSERT INTO monetization_events (
      id,event_type,brand_id,content_item_id,campaign_id,offer_id,tracked_link_id,source,platform,
      visitor_id,session_id,external_event_id,idempotency_key,value_amount,currency,metadata_json,occurred_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,COALESCE(?17,CURRENT_TIMESTAMP))`).bind(
      id,
      eventType,
      BRAND_ID,
      stringValue(body.contentItemId, 100),
      stringValue(body.campaignId, 100),
      stringValue(body.offerId, 100),
      stringValue(body.trackedLinkId, 100),
      stringValue(body.source, 80),
      stringValue(body.platform, 40),
      stringValue(body.visitorId, 180),
      stringValue(body.sessionId, 180),
      stringValue(body.externalEventId, 180),
      idempotencyKey,
      valueField.value,
      stringValue(body.currency, 8) ?? "IDR",
      safeJson(body.metadata),
      stringValue(body.occurredAt, 40)
    );
    if (await monetizationQualityEnabled(env)) await env.DB.batch([insert, unknownQualityStatement(env, "event", id, "New event awaits provenance verification.")]);
    else await insert.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Event gagal.";
    if (idempotencyKey && message.toLowerCase().includes("unique")) {
      const existing = await env.DB.prepare(`SELECT id FROM monetization_events WHERE brand_id=?1 AND idempotency_key=?2`).bind(BRAND_ID, idempotencyKey).first();
      return { duplicate: true, id: existing?.id ?? id };
    }
    throw error;
  }
  return { duplicate: false, id };
}
__name(recordEvent, "recordEvent");
async function ingestEvent(request, env) {
  const auth2 = requireIngestToken(request, env);
  if (auth2) return { status: auth2.status, body: { ok: false, error: "Unauthorized" } };
  const body = await parseJsonObject(request);
  try {
    const result = await recordEvent(body, env);
    return { status: result.duplicate ? 200 : 201, body: { ok: true, duplicate: result.duplicate, eventId: result.id } };
  } catch (error) {
    return { status: 400, body: { ok: false, error: error instanceof Error ? error.message : "Event tidak valid." } };
  }
}
__name(ingestEvent, "ingestEvent");
async function ingestRevenue(request, env) {
  const auth2 = requireIngestToken(request, env);
  if (auth2) return { status: auth2.status, body: { ok: false, error: "Unauthorized" } };
  const body = await parseJsonObject(request);
  const eventType = allowedValue(body.eventType, REVENUE_TYPES);
  const source = stringValue(body.source, 80);
  if (!eventType || !source) return { status: 400, body: { ok: false, error: "eventType revenue dan source wajib valid." } };
  const grossField = strictIntegerField(body, "grossAmount"), feeField = strictIntegerField(body, "feeAmount"), costField = strictIntegerField(body, "costAmount");
  if (!grossField.valid || !feeField.valid || !costField.valid) return { status: 400, body: { ok: false, error: "grossAmount, feeAmount, dan costAmount harus safe integer." } };
  const gross = grossField.value, fee = feeField.value, cost = costField.value;
  const netField = strictIntegerField(body, "netAmount", gross - fee), marginField = strictIntegerField(body, "marginAmount", (netField.present ? netField.value : gross - fee) - cost);
  if (!netField.valid || !marginField.valid) return { status: 400, body: { ok: false, error: "netAmount dan marginAmount harus safe integer." } };
  const net = netField.value, margin = marginField.value;
  if (netField.present && net !== gross - fee) {
    return { status: 400, body: { ok: false, error: "netAmount harus sama dengan grossAmount - feeAmount." } };
  }
  if (marginField.present && margin !== net - cost) {
    return { status: 400, body: { ok: false, error: "marginAmount harus sama dengan netAmount - costAmount." } };
  }
  const reversal = eventType === "refund" || eventType === "chargeback";
  const id = reversal ? uid("rev") : stringValue(body.id, 100) ?? uid("rev");
  if (reversal && [gross, fee, cost, net].some((value) => value > 0)) return { status: 400, body: { ok: false, error: "Refund/chargeback harus menggunakan gross, fee, cost, dan net nol atau negatif." } };
  if (!reversal && (gross < 0 || fee < 0 || cost < 0 || net < 0)) return { status: 400, body: { ok: false, error: "Sale/commission harus memiliki gross, fee, cost, dan net nol atau positif." } };
  const status = body.status === void 0 ? reversal ? "refunded" : "confirmed" : allowedValue(body.status, REVENUE_STATUSES);
  if (!status) return { status: 400, body: { ok: false, error: "status revenue tidak valid." } };
  if (reversal && status !== "refunded") return { status: 400, body: { ok: false, error: "Refund/chargeback wajib berstatus refunded." } };
  if (!reversal && status === "refunded") return { status: 400, body: { ok: false, error: "Gunakan eventType refund/chargeback untuk reversal." } };
  const idempotencyKey = stringValue(body.idempotencyKey, 180);
  const transactionId = stringValue(body.transactionId, 180);
  let reversedOriginal = null;
  if (reversal) {
    if (!idempotencyKey) return { status: 400, body: { ok: false, error: "idempotencyKey wajib untuk refund/chargeback." } };
    if (!transactionId) return { status: 400, body: { ok: false, error: "transactionId wajib untuk refund/chargeback." } };
    const duplicate = await env.DB.prepare(`SELECT id FROM monetization_revenue_events
      WHERE brand_id=?1 AND idempotency_key=?2`).bind(BRAND_ID, idempotencyKey).first();
    if (duplicate) return { status: 200, body: { ok: true, duplicate: true, revenueEventId: duplicate.id } };
    const originals = await env.DB.prepare(`SELECT id,gross_amount,fee_amount,cost_amount,net_amount,currency,
      content_item_id,campaign_id,offer_id
      FROM monetization_revenue_events WHERE brand_id=?1 AND source=?2 AND transaction_id=?3
      AND event_type NOT IN ('refund','chargeback') AND status='confirmed' ORDER BY datetime(created_at) DESC LIMIT 2`).bind(BRAND_ID, source, transactionId).all();
    if ((originals.results ?? []).length !== 1) return { status: 409, body: { ok: false, error: "Reversal memerlukan tepat satu transaksi confirmed yang cocok." } };
    reversedOriginal = originals.results[0];
    if (Math.abs(gross) > Number(reversedOriginal.gross_amount) || Math.abs(fee) > Number(reversedOriginal.fee_amount) || Math.abs(cost) > Number(reversedOriginal.cost_amount) || Math.abs(net) > Number(reversedOriginal.net_amount)) {
      return { status: 400, body: { ok: false, error: "Nilai reversal melebihi transaksi asal." } };
    }
    const suppliedDimensions = [
      ["contentItemId", "content_item_id"],
      ["campaignId", "campaign_id"],
      ["offerId", "offer_id"],
      ["currency", "currency"]
    ];
    for (const [inputKey, rowKey] of suppliedDimensions) {
      const supplied = stringValue(body[inputKey], 100), expected = stringValue(reversedOriginal[rowKey], 100);
      if (supplied && supplied !== expected) return { status: 409, body: { ok: false, error: `${inputKey} reversal tidak sama dengan transaksi asal.` } };
    }
  }
  const contentItemId = reversedOriginal ? stringValue(reversedOriginal.content_item_id, 100) : stringValue(body.contentItemId, 100);
  const campaignId = reversedOriginal ? stringValue(reversedOriginal.campaign_id, 100) : stringValue(body.campaignId, 100);
  const offerId = reversedOriginal ? stringValue(reversedOriginal.offer_id, 100) : stringValue(body.offerId, 100);
  const currency = reversedOriginal ? stringValue(reversedOriginal.currency, 8) ?? "IDR" : stringValue(body.currency, 8) ?? "IDR";
  if (currency.toUpperCase() !== "IDR") return { status: 400, body: { ok: false, error: "Monetization v1 hanya menerima currency IDR." } };
  const reversedOriginalId = reversedOriginal ? String(reversedOriginal.id) : null;
  try {
    const insertColumns = `(id,transaction_id,event_type,source,brand_id,content_item_id,campaign_id,offer_id,source_event_id,
      gross_amount,fee_amount,cost_amount,net_amount,margin_amount,currency,status,external_reference,idempotency_key,metadata_json,occurred_at)`;
    const insertValues = `?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,COALESCE(?20,CURRENT_TIMESTAMP)`;
    const insertSql = reversal ? `INSERT OR IGNORE INTO monetization_revenue_events ${insertColumns}
        SELECT ${insertValues} WHERE NOT EXISTS (SELECT 1 FROM monetization_revenue_events
          WHERE brand_id=?5 AND source=?4 AND transaction_id=?2 AND event_type IN ('refund','chargeback'))` : `INSERT INTO monetization_revenue_events ${insertColumns} VALUES (${insertValues})`;
    const insert = env.DB.prepare(insertSql).bind(
      id,
      transactionId,
      eventType,
      source,
      BRAND_ID,
      contentItemId,
      campaignId,
      offerId,
      stringValue(body.sourceEventId, 100),
      gross,
      fee,
      cost,
      net,
      margin,
      currency,
      status,
      stringValue(body.externalReference, 180),
      idempotencyKey,
      revenueMetadata(body, reversedOriginalId ? { reversesRevenueEventId: reversedOriginalId, lifecycleGroup: `${source}:${transactionId}` } : { oneWayLedger: true }),
      stringValue(body.occurredAt, 40)
    );
    let insertResult;
    if (await monetizationQualityEnabled(env)) {
      const invalidationReason = "Manual reversal recorded; original and reversal require joint re-verification.";
      const results = await env.DB.batch([
        insert,
        unknownQualityStatement(env, "revenue_event", id, "New revenue event awaits provenance verification."),
        ...reversedOriginalId ? [
          guardedInvalidationHistoryStatement(env, "revenue_event", reversedOriginalId, invalidationReason, idempotencyKey ?? id, id),
          guardedInvalidationStatement(env, "revenue_event", reversedOriginalId, invalidationReason, id)
        ] : []
      ]);
      insertResult = results[0];
    } else insertResult = await insert.run();
    if (Number(insertResult.meta.changes ?? 0) === 0) {
      const duplicate = idempotencyKey ? await env.DB.prepare(`SELECT id FROM monetization_revenue_events
        WHERE brand_id=?1 AND idempotency_key=?2`).bind(BRAND_ID, idempotencyKey).first() : null;
      if (duplicate) return { status: 200, body: { ok: true, duplicate: true, revenueEventId: duplicate.id } };
      return { status: 409, body: { ok: false, error: "Transaksi ini sudah memiliki refund/chargeback." } };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Revenue event gagal.";
    if (idempotencyKey && message.toLowerCase().includes("unique")) return { status: 200, body: { ok: true, duplicate: true } };
    throw error;
  }
  return { status: 201, body: {
    ok: true,
    revenueEventId: id,
    grossAmount: gross,
    netAmount: net,
    marginAmount: margin,
    contributionMarginRecorded: margin,
    accountingProfit: null,
    metricQuality: {
      feeStatus: body.feeAmount === void 0 ? "unknown" : "reported",
      costStatus: body.costAmount === void 0 ? "unknown" : "reported",
      completeness: body.feeAmount !== void 0 && body.costAmount !== void 0 ? "complete" : "incomplete"
    }
  } };
}
__name(ingestRevenue, "ingestRevenue");
async function verifyTrackedLinkEventQuality(env, eventId, linkId) {
  if (!await monetizationQualityEnabled(env)) return;
  const evidenceRef = `tracked-link:${linkId}:${eventId}`;
  const reason = "Server-observed /go redirect with active tracked-link graph. Raw referrer, user agent, and PII are not stored.";
  const metadata = JSON.stringify({
    source: "server_observed_tracked_link",
    trackedLinkId: linkId,
    evidenceVersion: "1.3",
    rawReferrerStored: false,
    rawUserAgentStored: false,
    piiStored: false
  });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO monetization_record_quality_history
      (id,record_type,record_id,previous_data_class,previous_verification_status,previous_evidence_ref,previous_reason,previous_metadata_json,
       new_data_class,new_verification_status,evidence_ref,reason,new_metadata_json,actor_type,correlation_id,metadata_json)
      SELECT ?1,'event',?2,q.data_class,q.verification_status,q.evidence_ref,q.reason,q.metadata_json,
        'production','verified',?3,?4,?5,'system_tracked_link',?2,?5
      FROM monetization_record_quality q
      WHERE q.record_type='event' AND q.record_id=?2`).bind(
      `qhist-${crypto.randomUUID()}`,
      eventId,
      evidenceRef,
      reason,
      metadata
    ),
    env.DB.prepare(`INSERT INTO monetization_record_quality
      (record_type,record_id,data_class,verification_status,amount_basis,fee_status,cost_status,evidence_ref,reason,metadata_json)
      VALUES ('event',?1,'production','verified',NULL,NULL,NULL,?2,?3,?4)
      ON CONFLICT(record_type,record_id) DO UPDATE SET
        data_class='production',verification_status='verified',evidence_ref=excluded.evidence_ref,
        reason=excluded.reason,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(
      eventId,
      evidenceRef,
      reason,
      metadata
    )
  ]);
}
__name(verifyTrackedLinkEventQuality, "verifyTrackedLinkEventQuality");

async function redirectTrackedLink(slug, request, env) {
  const link = await env.DB.prepare(`SELECT l.*,COALESCE(l.offer_id,c.offer_id) effective_offer_id,COALESCE(lo.type,co.type) offer_type,
    lo.status link_offer_status,c.status campaign_status,co.status campaign_offer_status,c.offer_id campaign_offer_id
    FROM monetization_tracked_links l
    LEFT JOIN monetization_campaigns c ON c.id=l.campaign_id AND c.brand_id=l.brand_id
    LEFT JOIN monetization_offers lo ON lo.id=l.offer_id AND lo.brand_id=l.brand_id
    LEFT JOIN monetization_offers co ON co.id=c.offer_id AND co.brand_id=l.brand_id
    WHERE l.slug=?1 AND l.brand_id=?2 AND l.status='active'
      AND (l.offer_id IS NULL OR lo.status='active')
      AND (l.campaign_id IS NULL OR c.status='active')
      AND (c.offer_id IS NULL OR co.status='active')
      AND (l.offer_id IS NULL OR c.offer_id IS NULL OR l.offer_id=c.offer_id)`).bind(slug, BRAND_ID).first();
  if (!link) return json({ ok: false, error: "Tracked link tidak ditemukan." }, 404);
  const destination = String(link.destination_url ?? "");
  if (!isHttpUrl(destination)) return json({ ok: false, error: "Destination tracked link tidak valid." }, 500);
  const visitorId = request.headers.get("X-Visitor-Id") ?? void 0;
  const sessionId = request.headers.get("X-Session-Id") ?? void 0;
  try {
    const recorded = await recordEvent({
      eventType: link.offer_type === "affiliate" ? "affiliate_click" : "click",
      contentItemId: link.content_item_id,
      campaignId: link.campaign_id,
      offerId: link.effective_offer_id,
      trackedLinkId: link.id,
      source: "tracked_link",
      platform: link.platform,
      visitorId,
      sessionId,
      metadata: { privacy: { rawUserAgentStored: false, rawReferrerStored: false }, ga4SessionForwarded: Boolean(visitorId && sessionId) }
    }, env);
    if (!recorded.duplicate && recorded.id) {
      await verifyTrackedLinkEventQuality(env, recorded.id, link.id);
    }
  } catch (error) {
    console.error(JSON.stringify({ message: "tracked_link_event_failed", slug, error: error instanceof Error ? error.message : "unknown" }));
  }
  return redirect(destination, 302);
}
__name(redirectTrackedLink, "redirectTrackedLink");
async function monetizationSummary(env, url) {
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const days = Math.max(1, Math.min(365, Number.isFinite(daysRaw) ? Math.round(daysRaw) : 30));
  const since = `-${days} days`;
  const quality = await monetizationQualityEnabled(env);
  const eventScope = verifiedQualityFilter(quality, "event", "e"), revenueScope = verifiedQualityFilter(quality, "revenue_event", "r");
  const feeCompleteSql = quality ? `CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q WHERE q.record_type='revenue_event'
    AND q.record_id=r.id AND q.fee_status IN ('actual','not_applicable')) OR json_extract(r.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END` : `CASE WHEN json_extract(r.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END`;
  const costCompleteSql = quality ? `CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q WHERE q.record_type='revenue_event'
    AND q.record_id=r.id AND q.cost_status IN ('actual','not_applicable')) OR json_extract(r.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END` : `CASE WHEN json_extract(r.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END`;
  const [events, revenue, offers] = await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN event_type IN ('click','affiliate_click') THEN 1 ELSE 0 END) clicks,
      SUM(CASE WHEN event_type='lead' THEN 1 ELSE 0 END) leads,
      SUM(CASE WHEN event_type='checkout' THEN 1 ELSE 0 END) checkouts,
      SUM(CASE WHEN event_type IN ('purchase','affiliate_conversion') THEN 1 ELSE 0 END) conversions
      FROM monetization_events e WHERE brand_id=?1 AND occurred_at >= datetime('now', ?2) ${eventScope}`).bind(BRAND_ID, since).first(),
    env.DB.prepare(`SELECT
      COUNT(*) revenue_events,
      COALESCE(SUM(gross_amount),0) gross_revenue,
      COALESCE(SUM(net_amount),0) net_revenue,
      COALESCE(SUM(margin_amount),0) contribution_profit,
      SUM(${feeCompleteSql}) fee_complete_events,SUM(${costCompleteSql}) cost_complete_events
      FROM monetization_revenue_events r WHERE brand_id=?1 AND occurred_at >= datetime('now', ?2) AND status IN ('confirmed','refunded') ${revenueScope}`).bind(BRAND_ID, since).first(),
    env.DB.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active FROM monetization_offers WHERE brand_id=?1").bind(BRAND_ID).first()
  ]);
  return {
    status: 200,
    body: {
      ok: true,
      periodDays: days,
      dataScope: quality ? "verified-production" : "legacy-unclassified",
      offers: { total: Number(offers?.total ?? 0), active: Number(offers?.active ?? 0) },
      funnel: {
        clicks: Number(events?.clicks ?? 0),
        leads: Number(events?.leads ?? 0),
        checkouts: Number(events?.checkouts ?? 0),
        conversions: Number(events?.conversions ?? 0)
      },
      revenue: {
        events: Number(revenue?.revenue_events ?? 0),
        gross: Number(revenue?.gross_revenue ?? 0),
        net: Number(revenue?.net_revenue ?? 0),
        contributionProfit: Number(revenue?.contribution_profit ?? 0),
        contributionMarginRecorded: Number(revenue?.contribution_profit ?? 0),
        accountingProfit: null,
        currency: "IDR",
        metricQuality: {
          feeCompleteEvents: Number(revenue?.fee_complete_events ?? 0),
          costCompleteEvents: Number(revenue?.cost_complete_events ?? 0),
          completeness: Number(revenue?.revenue_events ?? 0) > 0 && Number(revenue?.fee_complete_events ?? 0) === Number(revenue?.revenue_events ?? 0) && Number(revenue?.cost_complete_events ?? 0) === Number(revenue?.revenue_events ?? 0) ? "complete" : "incomplete"
        }
      }
    }
  };
}
__name(monetizationSummary, "monetizationSummary");
async function routeApi(request, env, url) {
  if (request.method === "GET" && url.pathname === "/api/monetization/status") {
    return json({ ok: true, service: "UMKM Monetization Engine", version: "1.0.0", mode: "additive-only", brandId: BRAND_ID });
  }
  if (request.method === "GET" && url.pathname === "/api/monetization/offers") {
    const result = await listOffers(env, url);
    return json(result.body, result.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/offers") {
    const result = await createOffer(request, env);
    return json(result.body, result.status);
  }
  const offerMatch = url.pathname.match(/^\/api\/monetization\/offers\/([^/]+)$/);
  if (request.method === "PATCH" && offerMatch?.[1]) {
    const result = await updateOffer(decodeURIComponent(offerMatch[1]), request, env);
    return json(result.body, result.status);
  }
  if (request.method === "GET" && url.pathname === "/api/monetization/campaigns") {
    const result = await listCampaigns(env);
    return json(result.body, result.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/campaigns") {
    const result = await createCampaign(request, env);
    return json(result.body, result.status);
  }
  const campaignMatch = url.pathname.match(/^\/api\/monetization\/campaigns\/([^/]+)$/);
  if (request.method === "PATCH" && campaignMatch?.[1]) {
    const result = await updateCampaign(decodeURIComponent(campaignMatch[1]), request, env);
    return json(result.body, result.status);
  }
  const contentMatch = url.pathname.match(/^\/api\/monetization\/content\/([^/]+)$/);
  if (request.method === "GET" && contentMatch?.[1]) {
    const result = await getContentMonetization(decodeURIComponent(contentMatch[1]), env);
    return json(result.body, result.status);
  }
  if (request.method === "PUT" && contentMatch?.[1]) {
    const result = await saveContentMonetization(decodeURIComponent(contentMatch[1]), request, env);
    return json(result.body, result.status);
  }
  if (request.method === "GET" && url.pathname === "/api/monetization/links") {
    const result = await listTrackedLinks(env);
    return json(result.body, result.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/links") {
    const result = await createTrackedLink(request, env);
    return json(result.body, result.status);
  }
  const linkMatch = url.pathname.match(/^\/api\/monetization\/links\/([^/]+)$/);
  if (request.method === "PATCH" && linkMatch?.[1]) {
    const result = await updateTrackedLink(decodeURIComponent(linkMatch[1]), request, env);
    return json(result.body, result.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/events") {
    const result = await ingestEvent(request, env);
    return json(result.body, result.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/revenue") {
    const result = await ingestRevenue(request, env);
    return json(result.body, result.status);
  }
  if (request.method === "GET" && url.pathname === "/api/monetization/summary") {
    const result = await monetizationSummary(env, url);
    return json(result.body, result.status);
  }
  return null;
}
__name(routeApi, "routeApi");
var monetization_worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      const api = await routeApi(request, env, url);
      if (api) return api;
      const goMatch = url.pathname.match(/^\/go\/([a-z0-9_-]{4,80})$/i);
      if (request.method === "GET" && goMatch?.[1]) return redirectTrackedLink(goMatch[1].toLowerCase(), request, env);
      if (request.method === "GET" && url.pathname === "/") {
        return json({
          ok: true,
          service: "UMKM Monetization Engine",
          version: "1.0.0",
          policy: "additive-only",
          endpoints: [
            "GET/POST /api/monetization/offers",
            "PATCH /api/monetization/offers/:id",
            "GET/POST /api/monetization/campaigns",
            "PATCH /api/monetization/campaigns/:id",
            "GET/PUT /api/monetization/content/:contentId",
            "GET/POST /api/monetization/links",
            "PATCH /api/monetization/links/:id",
            "POST /api/monetization/events",
            "POST /api/monetization/revenue",
            "GET /api/monetization/summary?days=30",
            "GET /go/:slug"
          ]
        });
      }
      return json({ ok: false, error: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(JSON.stringify({ message: "monetization_request_failed", path: url.pathname, error: message }));
      return json({ ok: false, error: "Monetization Engine gagal memproses request." }, 500);
    }
  }
};

// src/monetization-attribution.ts
var BRAND_ID2 = "brand-umkm-naik-kelas";
function uid2(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
__name(uid2, "uid");
function s(value, max = 500) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}
__name(s, "s");
function i(value, fallback = 0) {
  const n2 = Number(value);
  return Number.isFinite(n2) ? Math.round(n2) : fallback;
}
__name(i, "i");
function money(value, fallback = 0) {
  if (value === void 0 || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^-?(0|[1-9]\d*)$/.test(value.trim()) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed)) throw new Error("Provider amount harus safe integer.");
  return parsed;
}
__name(money, "money");
function jsonString(value) {
  return JSON.stringify(value ?? {});
}
__name(jsonString, "jsonString");
function validateNormalizedRevenue(value) {
  if (value.currency.toUpperCase() !== "IDR") throw new Error("Monetization v1 hanya menerima currency IDR.");
  const amounts = [value.grossAmount, value.feeAmount, value.costAmount, value.netAmount, value.marginAmount];
  if (amounts.some((amount) => !Number.isSafeInteger(amount))) throw new Error("Provider amount harus safe integer.");
  if (value.netAmount !== value.grossAmount - value.feeAmount) throw new Error("Provider net amount tidak sama dengan gross - fee.");
  if (value.marginAmount !== value.netAmount - value.costAmount) throw new Error("Provider margin amount tidak sama dengan net - cost.");
  const reversal = value.eventType === "refund" || value.eventType === "chargeback";
  if (reversal && [value.grossAmount, value.feeAmount, value.costAmount, value.netAmount].some((amount) => amount > 0)) throw new Error("Provider reversal harus memakai gross, fee, cost, dan net nol atau negatif.");
  if (!reversal && value.status !== "rejected" && (value.grossAmount < 0 || value.feeAmount < 0 || value.costAmount < 0 || value.netAmount < 0)) {
    throw new Error("Provider sale/commission memiliki amount negatif yang tidak valid.");
  }
}
__name(validateNormalizedRevenue, "validateNormalizedRevenue");
function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key) && value[key] !== null && value[key] !== void 0;
}
__name(hasOwn, "hasOwn");
function lifecycleToken(value, max = 80) {
  const text4 = s(value, max)?.toLowerCase();
  return text4 ? text4.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") : null;
}
__name(lifecycleToken, "lifecycleToken");
async function sha256Hex(value) {
  const digest2 = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest2)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function safeProviderEvidence(raw, extra) {
  const data = nested(raw, "data");
  return {
    ...extra,
    payloadHashSha256: await sha256Hex(JSON.stringify(raw)),
    topLevelKeys: Object.keys(raw).slice(0, 40),
    dataKeys: Object.keys(data).slice(0, 40),
    rawPayloadStored: false,
    piiStored: false
  };
}
__name(safeProviderEvidence, "safeProviderEvidence");
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let idx = 0; idx < a.length; idx += 1) diff |= a.charCodeAt(idx) ^ b.charCodeAt(idx);
  return diff === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(hmacHex, "hmacHex");
async function verifyGenericWebhook(request, secret) {
  const rawBody = await request.text();
  if (!secret) return { ok: true, rawBody };
  const supplied = request.headers.get("X-Monetization-Signature") ?? request.headers.get("X-Webhook-Signature");
  if (!supplied) return { ok: false, rawBody, error: "Webhook signature wajib." };
  const expected = await hmacHex(secret, rawBody);
  const normalized = supplied.replace(/^sha256=/i, "").toLowerCase();
  return timingSafeEqual(normalized, expected) ? { ok: true, rawBody } : { ok: false, rawBody, error: "Webhook signature tidak valid." };
}
__name(verifyGenericWebhook, "verifyGenericWebhook");
async function providerMapping(env, provider, externalType, externalId) {
  if (!externalId) return {};
  const row = await env.DB.prepare(`SELECT offer_id,campaign_id,content_item_id FROM monetization_provider_mappings
    WHERE brand_id=?1 AND provider=?2 AND external_type=?3 AND external_id=?4`).bind(BRAND_ID2, provider, externalType, externalId).first();
  return row ?? {};
}
__name(providerMapping, "providerMapping");
async function upsertProviderMapping(request, env) {
  const body = await request.json();
  const provider = s(body.provider, 80);
  const externalType = s(body.externalType, 80);
  const externalId = s(body.externalId, 180);
  if (!provider || !externalType || !externalId) return { status: 400, body: { ok: false, error: "provider, externalType, externalId wajib." } };
  const id = s(body.id, 100) ?? uid2("map");
  await env.DB.prepare(`INSERT INTO monetization_provider_mappings
    (id,brand_id,provider,external_type,external_id,offer_id,campaign_id,content_item_id,metadata_json)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
    ON CONFLICT(brand_id,provider,external_type,external_id) DO UPDATE SET
      offer_id=excluded.offer_id,campaign_id=excluded.campaign_id,content_item_id=excluded.content_item_id,
      metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(id, BRAND_ID2, provider, externalType, externalId, s(body.offerId, 100), s(body.campaignId, 100), s(body.contentItemId, 100), jsonString(body.metadata)).run();
  const mapping = await env.DB.prepare(`SELECT * FROM monetization_provider_mappings WHERE brand_id=?1 AND provider=?2 AND external_type=?3 AND external_id=?4`).bind(BRAND_ID2, provider, externalType, externalId).first();
  return { status: 200, body: { ok: true, mapping } };
}
__name(upsertProviderMapping, "upsertProviderMapping");
function pickObject(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Payload webhook harus object.");
  return raw;
}
__name(pickObject, "pickObject");
function nested(obj2, key) {
  const v = obj2[key];
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
__name(nested, "nested");
async function normalizeLynk(raw, env) {
  const data = Object.keys(nested(raw, "data")).length ? nested(raw, "data") : raw;
  const product = nested(data, "product");
  const externalProductId = s(data.product_id ?? data.productId ?? product.id, 180);
  const mapping = await providerMapping(env, "lynk", "product", externalProductId);
  const transactionId = s(data.transaction_id ?? data.transactionId ?? data.order_id ?? data.orderId ?? data.id, 180);
  if (!transactionId) throw new Error("Lynk transaction/order id tidak ditemukan.");
  const rawType = lifecycleToken(raw.event ?? raw.type ?? data.event ?? data.status);
  const refundStates = /* @__PURE__ */ new Set([
    "payment_refund",
    "payment_refunded",
    "payment_cancel",
    "payment_cancelled",
    "payment_canceled",
    "payment_chargeback",
    "payment_reversed",
    "payment_voided",
    "refund",
    "refunded",
    "cancelled",
    "canceled",
    "chargeback",
    "reversed",
    "voided"
  ]);
  const saleStates = /* @__PURE__ */ new Set(["payment_received", "payment_success", "payment_paid", "order_paid", "received", "success", "paid", "confirmed", "completed", "sale", "purchase"]);
  const isRefund = Boolean(rawType && refundStates.has(rawType));
  const isSale = Boolean(rawType && saleStates.has(rawType));
  if (!isRefund && !isSale) throw new Error("Status lifecycle Lynk tidak dikenali; payload dikarantina.");
  const gross = money(data.amount ?? data.total_amount ?? data.totalAmount ?? data.price ?? 0);
  const feeReported = hasOwn(data, "fee") || hasOwn(data, "fee_amount") || hasOwn(data, "feeAmount");
  const costReported = hasOwn(data, "cost") || hasOwn(data, "cost_amount") || hasOwn(data, "costAmount");
  const fee = money(data.fee ?? data.fee_amount ?? data.feeAmount ?? 0);
  const cost = money(data.cost ?? data.cost_amount ?? data.costAmount ?? 0);
  const net = money(data.net_amount ?? data.netAmount, gross - fee);
  const original = isRefund ? await env.DB.prepare(`SELECT id,gross_amount,fee_amount,cost_amount,net_amount,margin_amount,currency,
    content_item_id,campaign_id,offer_id FROM monetization_revenue_events
    WHERE brand_id=?1 AND source='lynk' AND transaction_id=?2 AND event_type NOT IN ('refund','chargeback')
      AND status='confirmed' ORDER BY datetime(created_at) DESC LIMIT 2`).bind(BRAND_ID2, transactionId).all() : null;
  const originalRows = original?.results ?? [];
  if (isRefund && originalRows.length !== 1) throw new Error("Refund Lynk memerlukan tepat satu transaksi sale confirmed yang cocok.");
  const originalRow = isRefund ? originalRows[0] : null;
  if (originalRow && Math.abs(gross) !== Math.abs(i(originalRow.gross_amount))) {
    throw new Error("Monetization v1 hanya menerima refund Lynk penuh dengan amount yang sama seperti transaksi asal.");
  }
  const effectiveGross = originalRow ? i(originalRow.gross_amount) : gross;
  const effectiveFee = originalRow ? i(originalRow.fee_amount) : fee;
  const effectiveCost = originalRow ? i(originalRow.cost_amount) : cost;
  const effectiveNet = originalRow ? i(originalRow.net_amount) : net;
  const visitorId = s(data.visitor_id ?? data.visitorId ?? data.ref ?? data.reference, 180);
  return {
    source: "lynk",
    eventType: isRefund ? "refund" : "sale",
    transactionId,
    externalReference: s(data.reference ?? data.external_reference ?? transactionId, 180),
    grossAmount: isRefund ? -Math.abs(effectiveGross) : effectiveGross,
    feeAmount: isRefund ? -Math.abs(effectiveFee) : effectiveFee,
    costAmount: isRefund ? -Math.abs(effectiveCost) : effectiveCost,
    netAmount: isRefund ? -Math.abs(effectiveNet) : effectiveNet,
    marginAmount: isRefund ? -Math.abs(effectiveNet) - -Math.abs(effectiveCost) : effectiveNet - effectiveCost,
    currency: originalRow ? s(originalRow.currency, 8) ?? "IDR" : s(data.currency, 8) ?? "IDR",
    status: isRefund ? "refunded" : "confirmed",
    offerId: originalRow ? s(originalRow.offer_id, 100) : s(data.offer_id ?? data.offerId, 100) ?? mapping.offer_id ?? null,
    campaignId: originalRow ? s(originalRow.campaign_id, 100) : s(data.campaign_id ?? data.campaignId, 100) ?? mapping.campaign_id ?? null,
    contentItemId: originalRow ? s(originalRow.content_item_id, 100) : s(data.content_id ?? data.contentItemId, 100) ?? mapping.content_item_id ?? null,
    visitorId,
    occurredAt: s(data.paid_at ?? data.paidAt ?? data.created_at ?? data.createdAt, 50),
    metadata: await safeProviderEvidence(raw, {
      externalProductId,
      providerItemSubtotal: hasOwn(data, "provider_item_subtotal") && Number.isSafeInteger(Number(data.provider_item_subtotal)) ? Number(data.provider_item_subtotal) : null,
      providerItemTotalDelta: hasOwn(data, "provider_item_total_delta") && Number.isSafeInteger(Number(data.provider_item_total_delta)) ? Number(data.provider_item_total_delta) : null,
      financialCompleteness: {
        fee: s(data.fee_data_status ?? data.feeDataStatus, 20) ?? (feeReported ? "reported" : "unknown"),
        cost: s(data.cost_data_status ?? data.costDataStatus, 20) ?? (costReported ? "reported" : "unknown")
      }
    })
  };
}
__name(normalizeLynk, "normalizeLynk");
async function normalizeAffiliate(raw, env) {
  const provider = s(raw.provider, 80) ?? "affiliate";
  const externalOfferId = s(raw.externalOfferId ?? raw.productId ?? raw.offerId, 180);
  const mapping = await providerMapping(env, provider, "offer", externalOfferId);
  const transactionId = s(raw.transactionId ?? raw.conversionId ?? raw.orderId ?? raw.id, 180);
  if (!transactionId) throw new Error("Affiliate transaction/conversion id wajib.");
  const commission = money(raw.commissionAmount ?? raw.commission ?? raw.amount ?? 0);
  const feeReported = hasOwn(raw, "feeAmount") || hasOwn(raw, "fee");
  const costReported = hasOwn(raw, "costAmount") || hasOwn(raw, "cost");
  const fee = money(raw.feeAmount ?? raw.fee ?? 0);
  const cost = money(raw.costAmount ?? raw.cost ?? 0);
  const net = commission - fee;
  const statusText = lifecycleToken(raw.status, 40);
  const rejectedStates = /* @__PURE__ */ new Set(["rejected", "cancelled", "canceled", "declined", "voided", "refunded", "reversed", "chargeback"]);
  const pendingStates = /* @__PURE__ */ new Set(["pending", "in_review", "under_review", "on_hold"]);
  const confirmedStates = /* @__PURE__ */ new Set(["confirmed", "approved", "paid", "completed", "success"]);
  const rejected = Boolean(statusText && rejectedStates.has(statusText));
  const pending = Boolean(statusText && pendingStates.has(statusText));
  const confirmed = Boolean(statusText && confirmedStates.has(statusText));
  if (!rejected && !pending && !confirmed) throw new Error("Status lifecycle affiliate tidak dikenali; payload dikarantina.");
  return {
    source: provider,
    eventType: "affiliate_commission",
    transactionId,
    externalReference: s(raw.externalReference ?? raw.clickId ?? raw.subId, 180),
    grossAmount: rejected ? 0 : commission,
    feeAmount: rejected ? 0 : fee,
    costAmount: rejected ? 0 : cost,
    netAmount: rejected ? 0 : net,
    marginAmount: rejected ? 0 : net - cost,
    currency: s(raw.currency, 8) ?? "IDR",
    status: rejected ? "rejected" : pending ? "pending" : "confirmed",
    offerId: s(raw.offerId, 100) ?? mapping.offer_id ?? null,
    campaignId: s(raw.campaignId, 100) ?? mapping.campaign_id ?? null,
    contentItemId: s(raw.contentItemId, 100) ?? mapping.content_item_id ?? null,
    visitorId: s(raw.visitorId ?? raw.subId ?? raw.clickId, 180),
    occurredAt: s(raw.occurredAt ?? raw.convertedAt, 50),
    metadata: await safeProviderEvidence(raw, {
      externalOfferId,
      adapter: "normalized_internal_adapter",
      financialCompleteness: { fee: feeReported ? "reported" : "unknown", cost: costReported ? "reported" : "unknown" }
    })
  };
}
__name(normalizeAffiliate, "normalizeAffiliate");
async function insertRevenue(normalized, env) {
  validateNormalizedRevenue(normalized);
  const id = uid2("rev");
  const idem = `${normalized.source}:${normalized.eventType}:${normalized.transactionId ?? normalized.externalReference ?? id}`;
  try {
    const insert = env.DB.prepare(`INSERT INTO monetization_revenue_events
      (id,transaction_id,event_type,source,brand_id,content_item_id,campaign_id,offer_id,gross_amount,fee_amount,cost_amount,net_amount,margin_amount,currency,status,external_reference,idempotency_key,metadata_json,occurred_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,COALESCE(?19,CURRENT_TIMESTAMP))`).bind(
      id,
      normalized.transactionId,
      normalized.eventType,
      normalized.source,
      BRAND_ID2,
      normalized.contentItemId,
      normalized.campaignId,
      normalized.offerId,
      normalized.grossAmount,
      normalized.feeAmount,
      normalized.costAmount,
      normalized.netAmount,
      normalized.marginAmount,
      normalized.currency,
      normalized.status,
      normalized.externalReference,
      idem,
      jsonString(normalized.metadata),
      normalized.occurredAt
    );
    if (await monetizationQualityEnabled(env)) await env.DB.batch([insert, unknownQualityStatement(env, "revenue_event", id, "Provider revenue awaits provenance verification.")]);
    else await insert.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("unique")) {
      const existing = await env.DB.prepare(`SELECT * FROM monetization_revenue_events WHERE idempotency_key=?1`).bind(idem).first();
      if (existing?.id && existing.status === "pending" && ["confirmed", "rejected"].includes(normalized.status)) {
        const mutationId = uid2("lifecycle");
        const mutationMetadata = jsonString({ ...normalized.metadata, lifecycleMutationId: mutationId });
        const update = env.DB.prepare(`UPDATE monetization_revenue_events SET
          content_item_id=?2,campaign_id=?3,offer_id=?4,gross_amount=?5,fee_amount=?6,cost_amount=?7,
          net_amount=?8,margin_amount=?9,currency=?10,status=?11,external_reference=?12,metadata_json=?13,
          occurred_at=COALESCE(?14,occurred_at)
          WHERE id=?1 AND status='pending'`).bind(
          existing.id,
          normalized.contentItemId,
          normalized.campaignId,
          normalized.offerId,
          normalized.grossAmount,
          normalized.feeAmount,
          normalized.costAmount,
          normalized.netAmount,
          normalized.marginAmount,
          normalized.currency,
          normalized.status,
          normalized.externalReference,
          mutationMetadata,
          normalized.occurredAt
        );
        let results;
        if (await monetizationQualityEnabled(env)) {
          const reason = "Provider lifecycle mutation invalidated prior provenance verification.";
          results = await env.DB.batch([
            update,
            mutationGuardedInvalidationHistoryStatement(env, "revenue_event", String(existing.id), reason, idem, String(existing.id), mutationId),
            mutationGuardedInvalidationStatement(env, "revenue_event", String(existing.id), reason, String(existing.id), mutationId)
          ]);
        } else results = [await update.run()];
        if (Number(results[0]?.meta.changes ?? 0) === 0) {
          const canonical = await env.DB.prepare(`SELECT id FROM monetization_revenue_events WHERE idempotency_key=?1`).bind(idem).first();
          return { id: String(canonical?.id ?? existing.id), duplicate: true, updated: false };
        }
        return { id: String(existing.id), duplicate: false, updated: true };
      }
      if (existing?.id && existing.status === "confirmed" && normalized.status === "rejected") {
        const reversalId = uid2("rev");
        const reversalKey = `${idem}:reversal`;
        const prior = await env.DB.prepare(`SELECT id FROM monetization_revenue_events WHERE idempotency_key=?1`).bind(reversalKey).first();
        if (prior?.id) return { id: prior.id, duplicate: true, updated: false };
        const reversal = env.DB.prepare(`INSERT OR IGNORE INTO monetization_revenue_events
          (id,transaction_id,event_type,source,brand_id,content_item_id,campaign_id,offer_id,gross_amount,fee_amount,cost_amount,
           net_amount,margin_amount,currency,status,external_reference,idempotency_key,metadata_json,occurred_at)
          VALUES (?1,?2,'chargeback',?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'refunded',?14,?15,?16,COALESCE(?17,CURRENT_TIMESTAMP))`).bind(
          reversalId,
          existing.transaction_id,
          existing.source,
          BRAND_ID2,
          existing.content_item_id,
          existing.campaign_id,
          existing.offer_id,
          -i(existing.gross_amount),
          -i(existing.fee_amount),
          -i(existing.cost_amount),
          -i(existing.net_amount),
          -i(existing.margin_amount),
          existing.currency,
          existing.external_reference,
          reversalKey,
          jsonString({ lifecycle: "confirmed_to_rejected", reversesRevenueEventId: existing.id, rawPayloadStored: false }),
          normalized.occurredAt
        );
        const quality = await monetizationQualityEnabled(env);
        const invalidationReason = "Confirmed provider revenue was reversed; original and clawback require joint re-verification.";
        const results = quality ? await env.DB.batch([
          reversal,
          unknownQualityStatement(env, "revenue_event", reversalId, "Provider clawback awaits provenance verification."),
          guardedInvalidationHistoryStatement(env, "revenue_event", String(existing.id), invalidationReason, reversalKey, reversalId),
          guardedInvalidationStatement(env, "revenue_event", String(existing.id), invalidationReason, reversalId)
        ]) : [await reversal.run()];
        if (Number(results[0]?.meta.changes ?? 0) === 0) {
          const canonical = await env.DB.prepare(`SELECT id FROM monetization_revenue_events WHERE idempotency_key=?1`).bind(reversalKey).first();
          if (!canonical?.id) throw new Error("Provider clawback tidak dapat disimpan.");
          return { id: canonical.id, duplicate: true, updated: false };
        }
        return { id: reversalId, duplicate: false, updated: true };
      }
      return { id: String(existing?.id ?? id), duplicate: true, updated: false };
    }
    throw error;
  }
  return { id, duplicate: false, updated: false };
}
__name(insertRevenue, "insertRevenue");
async function findTouchpoints(visitorId, env) {
  const quality = await monetizationQualityEnabled(env);
  const qualityScope = verifiedQualityFilter(quality, "event", "e");
  const result = await env.DB.prepare(`SELECT id,event_type,content_item_id,campaign_id,offer_id,platform,occurred_at
    FROM monetization_events e WHERE brand_id=?1 AND visitor_id=?2
      AND event_type IN ('impression','click','affiliate_click','landing_view','lead','checkout')
      ${qualityScope}
    ORDER BY occurred_at ASC LIMIT 500`).bind(BRAND_ID2, visitorId).all();
  return result.results ?? [];
}
__name(findTouchpoints, "findTouchpoints");
async function attributeRevenue(revenueEventId, visitorId, env, updateExisting = true) {
  const revenue = await env.DB.prepare("SELECT * FROM monetization_revenue_events WHERE id=?1 AND brand_id=?2").bind(revenueEventId, BRAND_ID2).first();
  if (!revenue) throw new Error("Revenue event tidak ditemukan.");
  const directContent = s(revenue.content_item_id, 100);
  const directCampaign = s(revenue.campaign_id, 100);
  const directOffer = s(revenue.offer_id, 100);
  const touches = visitorId ? await findTouchpoints(visitorId, env) : [];
  const first = touches[0] ?? null;
  const last = touches[touches.length - 1] ?? null;
  let status = "unattributed";
  let reason = "Tidak ada visitor/touchpoint atau direct mapping.";
  if (first || last || directContent || directCampaign || directOffer) {
    status = first && last ? "attributed" : "partial";
    reason = directContent || directCampaign || directOffer ? "Direct/provider mapping tersedia; touchpoint dilengkapi jika ada." : "Touchpoint first/last tersedia.";
  }
  const id = uid2("att");
  const conflictClause = updateExisting ? `DO UPDATE SET
      visitor_id=excluded.visitor_id,model=excluded.model,first_event_id=excluded.first_event_id,first_content_item_id=excluded.first_content_item_id,
      first_campaign_id=excluded.first_campaign_id,first_offer_id=excluded.first_offer_id,first_platform=excluded.first_platform,last_event_id=excluded.last_event_id,
      last_content_item_id=excluded.last_content_item_id,last_campaign_id=excluded.last_campaign_id,last_offer_id=excluded.last_offer_id,last_platform=excluded.last_platform,
      attribution_status=excluded.attribution_status,reason=excluded.reason,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP` : "DO NOTHING";
  await env.DB.prepare(`INSERT INTO monetization_attributions
    (id,brand_id,revenue_event_id,visitor_id,model,first_event_id,first_content_item_id,first_campaign_id,first_offer_id,first_platform,
     last_event_id,last_content_item_id,last_campaign_id,last_offer_id,last_platform,attribution_status,reason,metadata_json)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
    ON CONFLICT(revenue_event_id) ${conflictClause}`).bind(
    id,
    BRAND_ID2,
    revenueEventId,
    visitorId,
    status === "unattributed" ? "unattributed" : "first_last",
    first?.id ?? null,
    first?.content_item_id ?? directContent,
    first?.campaign_id ?? directCampaign,
    first?.offer_id ?? directOffer,
    first?.platform ?? null,
    last?.id ?? null,
    last?.content_item_id ?? directContent,
    last?.campaign_id ?? directCampaign,
    last?.offer_id ?? directOffer,
    last?.platform ?? null,
    status,
    reason,
    jsonString({ touchpointCount: touches.length })
  ).run();
  return await env.DB.prepare("SELECT * FROM monetization_attributions WHERE revenue_event_id=?1").bind(revenueEventId).first() ?? {};
}
__name(attributeRevenue, "attributeRevenue");
async function ingestProviderRevenue(normalized, env) {
  const inserted = await insertRevenue(normalized, env);
  const existingAttribution2 = inserted.duplicate && !inserted.updated ? await env.DB.prepare(`SELECT * FROM monetization_attributions WHERE revenue_event_id=?1`).bind(inserted.id).first() : null;
  const attribution = existingAttribution2 ?? await attributeRevenue(
    inserted.id,
    normalized.visitorId ?? null,
    env,
    !(inserted.duplicate && !inserted.updated)
  );
  await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,correlation_id,metadata_json)
    VALUES (?1,'revenue_ingest',?2,?3,?4)`).bind(normalized.source, inserted.duplicate ? "duplicate" : "success", normalized.transactionId, jsonString({ revenueEventId: inserted.id, lifecycleUpdated: inserted.updated, attributionStatus: attribution.attribution_status ?? null })).run();
  return { status: inserted.duplicate || inserted.updated ? 200 : 201, body: { ok: true, duplicate: inserted.duplicate, updated: inserted.updated, revenueEventId: inserted.id, attribution } };
}
__name(ingestProviderRevenue, "ingestProviderRevenue");
async function ingestLynkWebhook(request, env) {
  const verified = await verifyGenericWebhook(request, env.LYNK_WEBHOOK_SECRET);
  if (!verified.ok) return { status: 401, body: { ok: false, error: verified.error } };
  try {
    const normalized = await normalizeLynk(pickObject(JSON.parse(verified.rawBody)), env);
    return await ingestProviderRevenue(normalized, env);
  } catch (error) {
    await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,error_message,metadata_json) VALUES ('lynk','webhook','error',?1,?2)`).bind(error instanceof Error ? error.message : "Invalid Lynk webhook", jsonString({ receivedAt: (/* @__PURE__ */ new Date()).toISOString() })).run();
    return { status: 400, body: { ok: false, error: error instanceof Error ? error.message : "Lynk webhook tidak valid." } };
  }
}
__name(ingestLynkWebhook, "ingestLynkWebhook");
async function ingestAffiliateConversion(request, env) {
  const body = await request.json();
  try {
    return await ingestProviderRevenue(await normalizeAffiliate(body, env), env);
  } catch (error) {
    return { status: 400, body: { ok: false, error: error instanceof Error ? error.message : "Affiliate conversion tidak valid." } };
  }
}
__name(ingestAffiliateConversion, "ingestAffiliateConversion");
async function funnelAnalytics(env, url) {
  const days = Math.max(1, Math.min(365, i(url.searchParams.get("days"), 30)));
  const since = `-${days} days`;
  const quality = await monetizationQualityEnabled(env);
  const eventScope = verifiedQualityFilter(quality, "event", "e"), revenueScope = verifiedQualityFilter(quality, "revenue_event", "r");
  const row = await env.DB.prepare(`SELECT
    SUM(CASE WHEN event_type='impression' THEN 1 ELSE 0 END) impressions,
    SUM(CASE WHEN event_type IN ('click','affiliate_click') THEN 1 ELSE 0 END) clicks,
    SUM(CASE WHEN event_type='landing_view' THEN 1 ELSE 0 END) landing_views,
    SUM(CASE WHEN event_type='lead' THEN 1 ELSE 0 END) leads,
    SUM(CASE WHEN event_type='checkout' THEN 1 ELSE 0 END) checkouts,
    SUM(CASE WHEN event_type IN ('purchase','affiliate_conversion') THEN 1 ELSE 0 END) conversions
    FROM monetization_events e WHERE brand_id=?1 AND occurred_at>=datetime('now',?2) ${eventScope}`).bind(BRAND_ID2, since).first();
  const revenue = await env.DB.prepare(`SELECT COUNT(*) transactions,COALESCE(SUM(gross_amount),0) gross,COALESCE(SUM(net_amount),0) net,COALESCE(SUM(margin_amount),0) profit
    FROM monetization_revenue_events r WHERE brand_id=?1 AND occurred_at>=datetime('now',?2) AND status IN ('confirmed','refunded') ${revenueScope}`).bind(BRAND_ID2, since).first();
  const impressions = i(row?.impressions), clicks = i(row?.clicks), landing = i(row?.landing_views), leads = i(row?.leads), checkouts = i(row?.checkouts), conversions = i(row?.conversions);
  const rate = /* @__PURE__ */ __name((num2, den) => den > 0 ? Number((num2 / den * 100).toFixed(2)) : null, "rate");
  return { status: 200, body: { ok: true, periodDays: days, dataScope: quality ? "verified-production" : "legacy-unclassified", counts: { impressions, clicks, landingViews: landing, leads, checkouts, conversions }, rates: { ctr: rate(clicks, impressions), landingRate: rate(landing, clicks), leadRate: rate(leads, landing), checkoutRate: rate(checkouts, landing), conversionRate: rate(conversions, landing) }, revenue: { transactions: i(revenue?.transactions), gross: i(revenue?.gross), net: i(revenue?.net), contributionProfit: i(revenue?.profit), contributionMarginRecorded: i(revenue?.profit), accountingProfit: null, revenuePerClick: clicks > 0 ? Math.round(i(revenue?.net) / clicks) : null, revenuePerThousandImpressions: impressions > 0 ? Math.round(i(revenue?.net) / impressions * 1e3) : null } } };
}
__name(funnelAnalytics, "funnelAnalytics");
async function attributionReport(env, url) {
  const days = Math.max(1, Math.min(365, i(url.searchParams.get("days"), 30)));
  const since = `-${days} days`;
  const quality = await monetizationQualityEnabled(env), revenueScope = verifiedQualityFilter(quality, "revenue_event", "r");
  const revenueContent = quality ? "COALESCE(r.content_item_id,'unattributed')" : "COALESCE(a.last_content_item_id,a.first_content_item_id,r.content_item_id,'unattributed')";
  const summary = await env.DB.prepare(`SELECT attribution_status,COUNT(*) total,COALESCE(SUM(r.net_amount),0) net_revenue,COALESCE(SUM(r.margin_amount),0) profit
    FROM monetization_attributions a JOIN monetization_revenue_events r ON r.id=a.revenue_event_id
    WHERE a.brand_id=?1 AND r.occurred_at>=datetime('now',?2) AND r.status IN ('confirmed','refunded') ${revenueScope}
    GROUP BY attribution_status ORDER BY total DESC`).bind(BRAND_ID2, since).all();
  const byContent = await env.DB.prepare(`SELECT ${revenueContent} content_item_id,
    COUNT(*) conversions,COALESCE(SUM(r.net_amount),0) net_revenue,COALESCE(SUM(r.margin_amount),0) profit
    FROM monetization_revenue_events r LEFT JOIN monetization_attributions a ON a.revenue_event_id=r.id
    WHERE r.brand_id=?1 AND r.occurred_at>=datetime('now',?2) AND r.status IN ('confirmed','refunded') ${revenueScope}
    GROUP BY 1 ORDER BY profit DESC LIMIT 100`).bind(BRAND_ID2, since).all();
  return { status: 200, body: { ok: true, periodDays: days, dataScope: quality ? "verified-production" : "legacy-unclassified", attributionStatus: summary.results ?? [], byContent: byContent.results ?? [] } };
}
__name(attributionReport, "attributionReport");
async function runReconciliation(request, env) {
  const body = await request.json();
  const source = s(body.source, 80);
  const start = s(body.periodStart, 50);
  const end = s(body.periodEnd, 50);
  if (!source || !start || !end) return { status: 400, body: { ok: false, error: "source, periodStart, periodEnd wajib." } };
  const extCount = i(body.externalTransactionCount);
  const extGross = i(body.externalGrossAmount);
  const quality = await monetizationQualityEnabled(env), revenueScope = verifiedQualityFilter(quality, "revenue_event", "r");
  const ledger = await env.DB.prepare(`SELECT COUNT(*) total,COALESCE(SUM(gross_amount),0) gross FROM monetization_revenue_events r
    WHERE brand_id=?1 AND source=?2 AND occurred_at>=?3 AND occurred_at<=?4 AND status IN ('confirmed','refunded') ${revenueScope}`).bind(BRAND_ID2, source, start, end).first();
  const ledgerCount = i(ledger?.total);
  const ledgerGross = i(ledger?.gross);
  const countDelta = ledgerCount - extCount;
  const grossDelta = ledgerGross - extGross;
  const status = countDelta === 0 && grossDelta === 0 ? "matched" : "mismatch";
  const id = uid2("rec");
  await env.DB.prepare(`INSERT INTO monetization_reconciliation_runs
    (id,brand_id,source,period_start,period_end,external_transaction_count,external_gross_amount,ledger_transaction_count,ledger_gross_amount,transaction_count_delta,gross_amount_delta,status,metadata_json)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`).bind(id, BRAND_ID2, source, start, end, extCount, extGross, ledgerCount, ledgerGross, countDelta, grossDelta, status, jsonString(body.metadata)).run();
  if (status === "mismatch") await env.DB.prepare(`INSERT INTO monetization_reconciliation_items(reconciliation_run_id,issue_type,expected_amount,ledger_amount,notes) VALUES (?1,'aggregate_mismatch',?2,?3,?4)`).bind(id, extGross, ledgerGross, `transaction_count_delta=${countDelta}`).run();
  return { status: 201, body: { ok: true, reconciliation: { id, source, periodStart: start, periodEnd: end, status, dataScope: quality ? "verified-production" : "legacy-unclassified", external: { transactions: extCount, gross: extGross }, ledger: { transactions: ledgerCount, gross: ledgerGross }, delta: { transactions: countDelta, gross: grossDelta } } } };
}
__name(runReconciliation, "runReconciliation");
async function listReconciliations(env) {
  const result = await env.DB.prepare(`SELECT * FROM monetization_reconciliation_runs WHERE brand_id=?1 ORDER BY created_at DESC LIMIT 100`).bind(BRAND_ID2).all();
  return { status: 200, body: { ok: true, reconciliations: result.results ?? [] } };
}
__name(listReconciliations, "listReconciliations");

// src/monetization-worker-v2.ts
var JSON_HEADERS2 = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
function json2(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS2 });
}
__name(json2, "json");
function authorized(request, env) {
  if (!env.MONETIZATION_INGEST_TOKEN) return true;
  return request.headers.get("Authorization") === `Bearer ${env.MONETIZATION_INGEST_TOKEN}`;
}
__name(authorized, "authorized");
var monetization_worker_v2_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/api/monetization/provider-mappings") {
        if (!authorized(request, env)) return json2({ ok: false, error: "Unauthorized" }, 401);
        const result = await upsertProviderMapping(request, env);
        return json2(result.body, result.status);
      }
      if (request.method === "POST" && url.pathname === "/api/monetization/webhooks/lynk") {
        const result = await ingestLynkWebhook(request, env);
        return json2(result.body, result.status);
      }
      if (request.method === "POST" && url.pathname === "/api/monetization/affiliate/conversions") {
        if (!authorized(request, env)) return json2({ ok: false, error: "Unauthorized" }, 401);
        const result = await ingestAffiliateConversion(request, env);
        return json2(result.body, result.status);
      }
      if (request.method === "GET" && url.pathname === "/api/monetization/funnel") {
        const result = await funnelAnalytics(env, url);
        return json2(result.body, result.status);
      }
      if (request.method === "GET" && url.pathname === "/api/monetization/attribution") {
        const result = await attributionReport(env, url);
        return json2(result.body, result.status);
      }
      if (request.method === "POST" && url.pathname === "/api/monetization/reconciliation") {
        if (!authorized(request, env)) return json2({ ok: false, error: "Unauthorized" }, 401);
        const result = await runReconciliation(request, env);
        return json2(result.body, result.status);
      }
      if (request.method === "GET" && url.pathname === "/api/monetization/reconciliation") {
        const result = await listReconciliations(env);
        return json2(result.body, result.status);
      }
      return monetization_worker_default.fetch(request, env);
    } catch (error) {
      console.error(JSON.stringify({ message: "monetization_v2_request_failed", path: url.pathname, error: error instanceof Error ? error.message : "unknown" }));
      return json2({ ok: false, error: "Monetization Engine gagal memproses request." }, 500);
    }
  }
};

// src/monetization-learning.ts
var BRAND_ID3 = "brand-umkm-naik-kelas";
var DEFAULT_MODEL = "deepseek-v4-flash";
function uid3(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
__name(uid3, "uid");
function num(value) {
  const n2 = Number(value);
  return Number.isFinite(n2) ? n2 : 0;
}
__name(num, "num");
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
__name(isRecord, "isRecord");
async function aggregatedDataset(env, days) {
  const since = `-${days} days`;
  const qualityTable = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='monetization_record_quality'`).first();
  const verifiedRevenue = verifiedQualityFilter(Boolean(qualityTable), "revenue_event", "mr");
  const verifiedEvent = qualityTable ? `AND EXISTS (SELECT 1 FROM monetization_record_quality q
    WHERE q.record_type='event' AND q.record_id=me.id AND q.data_class='production' AND q.verification_status='verified')` : "";
  const feeCompleteSql = qualityTable ? `CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q
      WHERE q.record_type='revenue_event' AND q.record_id=mr.id AND q.fee_status IN ('actual','not_applicable'))
      OR json_extract(mr.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END` : `CASE WHEN json_extract(mr.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END`;
  const costCompleteSql = qualityTable ? `CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q
      WHERE q.record_type='revenue_event' AND q.record_id=mr.id AND q.cost_status IN ('actual','not_applicable'))
      OR json_extract(mr.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END` : `CASE WHEN json_extract(mr.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END`;
  const revenueContent = qualityTable ? "mr.content_item_id" : "COALESCE(a.last_content_item_id,a.first_content_item_id,mr.content_item_id)";
  const revenueOffer = qualityTable ? "mr.offer_id" : "COALESCE(a.last_offer_id,a.first_offer_id,mr.offer_id)";
  const revenuePlatform = qualityTable ? "COALESCE(c.platform,'unknown')" : "COALESCE(a.last_platform,a.first_platform,c.platform,'unknown')";
  const [overview, topics, contents, offers, platforms] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(DISTINCT ${revenueContent}) contents,COUNT(*) revenue_events,
      COALESCE(SUM(mr.gross_amount),0) gross,COALESCE(SUM(mr.net_amount),0) net,COALESCE(SUM(mr.margin_amount),0) contribution_margin,
      SUM(${feeCompleteSql}) fee_complete_events,SUM(${costCompleteSql}) cost_complete_events
      FROM monetization_revenue_events mr LEFT JOIN monetization_attributions a ON a.revenue_event_id=mr.id
      WHERE mr.brand_id=?1 AND mr.occurred_at>=datetime('now',?2)
      AND mr.status IN ('confirmed','refunded') ${verifiedRevenue}`).bind(BRAND_ID3, since).first(),
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
      WHERE t.brand_id=?1 GROUP BY t.id,t.title HAVING revenue_events>0 ORDER BY contribution_margin DESC LIMIT 40`).bind(BRAND_ID3, since).all(),
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
      ORDER BY contribution_margin DESC LIMIT 60`).bind(BRAND_ID3, since).all(),
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
      WHERE o.brand_id=?1 AND COALESCE(r.revenue_events,0)>0 ORDER BY contribution_margin DESC LIMIT 40`).bind(BRAND_ID3, since).all(),
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
      ORDER BY contribution_margin DESC`).bind(BRAND_ID3, since).all()
  ]);
  const overviewRow = isRecord(overview) ? overview : {};
  const revenueEvents = num(overviewRow.revenue_events);
  const feeComplete = num(overviewRow.fee_complete_events);
  const costComplete = num(overviewRow.cost_complete_events);
  const distinctContents = num(overviewRow.contents);
  const financialCompleteness = revenueEvents > 0 ? Math.min(feeComplete, costComplete) / revenueEvents : 0;
  const decisionGrade = Boolean(qualityTable) && revenueEvents >= 5 && distinctContents >= 2 && financialCompleteness >= 0.8;
  const confidenceCap = decisionGrade ? 1 : 0.25;
  return {
    periodDays: days,
    datasetVersion: "2.0-no-fanout",
    dataScope: qualityTable ? "verified-production" : "legacy-unclassified",
    dataQuality: { decisionMode: decisionGrade ? "decision-grade" : "advisory", actionable: decisionGrade, revenueEvents, distinctContents, feeCompleteEvents: feeComplete, costCompleteEvents: costComplete, financialCompleteness, confidenceCap },
    overview: overviewRow,
    topics: topics.results ?? [],
    contents: contents.results ?? [],
    offers: offers.results ?? [],
    platforms: platforms.results ?? []
  };
}
__name(aggregatedDataset, "aggregatedDataset");
function learningPrompt(dataset) {
  return `Anda adalah Revenue Intelligence Analyst untuk UMKM Naik Kelas. Analisis hanya data yang diberikan. Jangan mengarang sebab yang tidak didukung data.

Kembalikan JSON valid persis berbentuk:
{"summary":"string","insights":[{"scope":"topic|content|offer|platform|cta|portfolio","statement":"string","confidence":0.0,"evidence":{"metric":"value"},"actionRecommendation":"string"}],"researchGuidance":{"prioritize":["string"],"deprioritize":["string"],"commercialPatterns":["string"]},"contentGuidance":{"hooks":["string"],"ctaPatterns":["string"],"angles":["string"],"avoid":["string"]}}

Gunakan confidence 0\u20131 dan jangan melebihi dataQuality.confidenceCap. Bila data belum cukup, katakan data belum cukup dan gunakan confidence rendah. contribution_margin adalah margin kontribusi tercatat yang masih sementara bila fee/HPP belum lengkap; jangan menyebutnya laba bersih. Jangan mengorbankan audience trust.
DATA:
${JSON.stringify(dataset)}`;
}
__name(learningPrompt, "learningPrompt");
async function callDeepSeek(env, dataset) {
  if (env.MONETIZATION_AI_ENABLED !== "true") throw new Error("MONETIZATION_AI_ENABLED belum true.");
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY belum tersedia.");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.DEEPSEEK_MODEL ?? DEFAULT_MODEL, messages: [{ role: "system", content: "Return valid JSON only." }, { role: "user", content: learningPrompt(dataset) }], thinking: { type: "disabled" }, response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 3500, stream: false })
  });
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
  const raw = await response.json();
  if (!isRecord(raw) || !Array.isArray(raw.choices) || !isRecord(raw.choices[0]) || !isRecord(raw.choices[0].message) || typeof raw.choices[0].message.content !== "string") throw new Error("Respons DeepSeek tidak lengkap.");
  const parsed = JSON.parse(raw.choices[0].message.content);
  if (!isRecord(parsed) || !Array.isArray(parsed.insights)) throw new Error("Learning JSON tidak valid.");
  return parsed;
}
__name(callDeepSeek, "callDeepSeek");
async function runLearning(env, url) {
  const days = Math.max(7, Math.min(365, Math.round(num(url.searchParams.get("days") ?? 30)) || 30));
  const runId = `learn-${crypto.randomUUID()}`;
  const dataset = await aggregatedDataset(env, days);
  const overview = isRecord(dataset.overview) ? dataset.overview : {};
  if (num(overview.revenue_events) === 0) {
    await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,correlation_id,metadata_json)
      VALUES ('deepseek','revenue_learning','warning',?1,?2)`).bind(runId, JSON.stringify({
      skipped: true,
      reason: "no_verified_revenue",
      days,
      datasetVersion: dataset.datasetVersion,
      dataQuality: dataset.dataQuality,
      guidanceActionable: false,
      researchGuidance: {},
      contentGuidance: {}
    })).run();
    return { status: 200, body: { ok: true, skipped: true, reason: "Belum ada revenue event production+verified.", dataset } };
  }
  try {
    const analysis = await callDeepSeek(env, dataset);
    const insights = Array.isArray(analysis.insights) ? analysis.insights : [];
    const quality = isRecord(dataset.dataQuality) ? dataset.dataQuality : {};
    const confidenceCap = Math.max(0, Math.min(1, num(quality.confidenceCap) || 0.25));
    const now = /* @__PURE__ */ new Date();
    const start = new Date(now.getTime() - days * 864e5).toISOString();
    const end = now.toISOString();
    let stored = 0;
    for (const item of insights.slice(0, 20)) {
      if (!isRecord(item) || typeof item.statement !== "string") continue;
      const confidence = Math.max(0, Math.min(confidenceCap, num(item.confidence)));
      const id = uid3("ins");
      const insert = env.DB.prepare(`INSERT INTO monetization_learning_insights
        (id,brand_id,scope,period_start,period_end,statement,evidence_json,confidence,action_recommendation,status)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'active')`).bind(
        id,
        BRAND_ID3,
        String(item.scope ?? "portfolio").slice(0, 80),
        start,
        end,
        item.statement,
        JSON.stringify({ ...isRecord(item.evidence) ? item.evidence : {}, learningRunId: runId }),
        confidence,
        typeof item.actionRecommendation === "string" ? item.actionRecommendation : null
      );
      if (await monetizationQualityEnabled(env)) await env.DB.batch([insert, unknownQualityStatement(env, "learning_insight", id, "AI learning insight requires operator provenance review.")]);
      else await insert.run();
      stored += 1;
    }
    await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,correlation_id,metadata_json)
      VALUES ('deepseek','revenue_learning','success',?1,?2)`).bind(runId, JSON.stringify({ runId, days, stored, datasetVersion: dataset.datasetVersion, dataQuality: quality, summary: analysis.summary ?? null, researchGuidance: analysis.researchGuidance ?? {}, contentGuidance: analysis.contentGuidance ?? {} })).run();
    return { status: 201, body: { ok: true, periodDays: days, storedInsights: stored, analysis, datasetOverview: overview, dataQuality: quality } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Learning failed";
    await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,error_message,correlation_id,metadata_json)
      VALUES ('deepseek','revenue_learning','error',?1,?2,?3)`).bind(message, runId, JSON.stringify({ runId, days })).run();
    return { status: 503, body: { ok: false, error: message, datasetOverview: overview } };
  }
}
__name(runLearning, "runLearning");
async function learningContext(env) {
  const qualityTable = await monetizationQualityEnabled(env);
  const insightScope = verifiedQualityFilter(qualityTable, "learning_insight", "i");
  const latest = await env.DB.prepare(`SELECT status,correlation_id,metadata_json,created_at FROM monetization_integration_logs
    WHERE provider='deepseek' AND operation='revenue_learning' ORDER BY created_at DESC,id DESC LIMIT 1`).first();
  const latestRunId = typeof latest?.correlation_id === "string" ? latest.correlation_id : "";
  const insights = latestRunId ? await env.DB.prepare(`SELECT id,scope,statement,evidence_json,confidence,action_recommendation,created_at
    FROM monetization_learning_insights i WHERE brand_id=?1 AND status='active'
      AND json_extract(evidence_json,'$.learningRunId')=?2 ${insightScope}
    ORDER BY confidence DESC,created_at DESC LIMIT 30`).bind(BRAND_ID3, latestRunId).all() : { results: [] };
  let stored = {};
  try {
    stored = latest?.metadata_json ? JSON.parse(String(latest.metadata_json)) : {};
  } catch {
  }
  const storedRecord = isRecord(stored) ? stored : {};
  const quality = isRecord(storedRecord.dataQuality) ? storedRecord.dataQuality : {};
  const verifiedInsights = (insights.results ?? []).length;
  const latestStored = Math.max(0, Math.round(num(storedRecord.stored)));
  const advisory = latest?.status !== "success" || quality.decisionMode !== "decision-grade" || quality.actionable !== true || verifiedInsights === 0 || verifiedInsights !== latestStored;
  return { status: 200, body: {
    ok: true,
    insights: insights.results ?? [],
    guidance: advisory ? {} : storedRecord,
    advisoryGuidance: advisory ? storedRecord : {},
    quality: {
      ...quality,
      decisionMode: advisory ? "advisory" : "decision-grade",
      actionable: !advisory,
      insightScope: qualityTable ? "verified-production" : "legacy-unclassified",
      verifiedInsights,
      latestRunInsights: latestStored,
      latestRunId: latestRunId || null,
      latestRunStatus: latest?.status ?? null
    }
  } };
}
__name(learningContext, "learningContext");
async function learningStatus(env) {
  const qualityTable = await monetizationQualityEnabled(env);
  const scope = verifiedQualityFilter(qualityTable, "learning_insight", "i");
  const count = await env.DB.prepare(`SELECT COUNT(*) total,MAX(created_at) latest FROM monetization_learning_insights i
    WHERE brand_id=?1 AND status='active' ${scope}`).bind(BRAND_ID3).first();
  return { status: 200, body: {
    ok: true,
    configured: Boolean(env.DEEPSEEK_API_KEY),
    enabled: env.MONETIZATION_AI_ENABLED === "true",
    model: env.DEEPSEEK_MODEL ?? DEFAULT_MODEL,
    activeInsights: num(count?.total),
    latestInsightAt: count?.latest ?? null,
    dataScope: qualityTable ? "verified-production" : "legacy-unclassified"
  } };
}
__name(learningStatus, "learningStatus");

// src/monetization-worker-v3.ts
function json3(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
__name(json3, "json");
function authorized2(request, env) {
  if (!env.MONETIZATION_INGEST_TOKEN) return true;
  return request.headers.get("Authorization") === `Bearer ${env.MONETIZATION_INGEST_TOKEN}`;
}
__name(authorized2, "authorized");
var monetization_worker_v3_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/monetization/learning/status") {
      const result = await learningStatus(env);
      return json3(result.body, result.status);
    }
    if (request.method === "GET" && url.pathname === "/api/monetization/learning/context") {
      const result = await learningContext(env);
      return json3(result.body, result.status);
    }
    if (request.method === "POST" && url.pathname === "/api/monetization/learning/run") {
      if (!authorized2(request, env)) return json3({ ok: false, error: "Unauthorized" }, 401);
      const result = await runLearning(env, url);
      return json3(result.body, result.status);
    }
    return monetization_worker_v2_default.fetch(request, env);
  }
};

// src/monetization-operations.ts
var BRAND_ID4 = "brand-umkm-naik-kelas";
function uid4(p) {
  return `${p}-${crypto.randomUUID()}`;
}
__name(uid4, "uid");
function s2(v, max = 500) {
  if (typeof v !== "string") return null;
  const x = v.trim();
  return x ? x.slice(0, max) : null;
}
__name(s2, "s");
function n(v, f = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : f;
}
__name(n, "n");
function obj(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v;
}
__name(obj, "obj");
async function listExperiments(env) {
  const r = await env.DB.prepare(`SELECT * FROM monetization_experiments WHERE brand_id=?1 ORDER BY created_at DESC LIMIT 100`).bind(BRAND_ID4).all();
  return { status: 200, body: { ok: true, experiments: r.results ?? [] } };
}
__name(listExperiments, "listExperiments");
async function createExperiment(request, env) {
  const b = obj(await request.json());
  const hypothesis = s2(b.hypothesis, 1e3), variable = s2(b.variable, 80), metric = s2(b.primaryMetric, 100);
  if (!hypothesis || !variable || !metric) return { status: 400, body: { ok: false, error: "hypothesis, variable, primaryMetric wajib." } };
  const id = s2(b.id, 100) ?? uid4("exp");
  await env.DB.prepare(`INSERT INTO monetization_experiments(id,brand_id,hypothesis,variable,variant_a_json,variant_b_json,primary_metric,status,starts_at,ends_at)
 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`).bind(id, BRAND_ID4, hypothesis, variable, JSON.stringify(b.variantA ?? {}), JSON.stringify(b.variantB ?? {}), metric, s2(b.status, 20) ?? "draft", s2(b.startsAt, 50), s2(b.endsAt, 50)).run();
  return { status: 201, body: { ok: true, experiment: await env.DB.prepare("SELECT * FROM monetization_experiments WHERE id=?1").bind(id).first() } };
}
__name(createExperiment, "createExperiment");
async function completeExperiment(id, request, env) {
  const b = obj(await request.json());
  const winner = s2(b.winner, 10);
  if (winner && !["a", "b", "none"].includes(winner)) return { status: 400, body: { ok: false, error: "winner harus a, b, atau none." } };
  const current = await env.DB.prepare("SELECT id FROM monetization_experiments WHERE id=?1 AND brand_id=?2").bind(id, BRAND_ID4).first();
  if (!current) return { status: 404, body: { ok: false, error: "Experiment tidak ditemukan." } };
  await env.DB.prepare(`UPDATE monetization_experiments SET status='completed',winner=?2,result_json=?3,ends_at=COALESCE(?4,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(id, winner ?? "none", JSON.stringify(b.result ?? {}), s2(b.endsAt, 50)).run();
  return { status: 200, body: { ok: true, experiment: await env.DB.prepare("SELECT * FROM monetization_experiments WHERE id=?1").bind(id).first() } };
}
__name(completeExperiment, "completeExperiment");
async function operationsSnapshot(env, url) {
  const days = Math.max(1, Math.min(365, Math.round(n(url.searchParams.get("days"), 30))));
  const since = `-${days} days`;
  const quality = await monetizationQualityEnabled(env);
  const revenueScope = verifiedQualityFilter(quality, "revenue_event", "r"), eventScope = verifiedQualityFilter(quality, "event", "e");
  const feeCompleteSql = quality ? `CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q WHERE q.record_type='revenue_event'
   AND q.record_id=r.id AND q.fee_status IN ('actual','not_applicable')) OR json_extract(r.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END` : `CASE WHEN json_extract(r.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END`;
  const costCompleteSql = quality ? `CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q WHERE q.record_type='revenue_event'
   AND q.record_id=r.id AND q.cost_status IN ('actual','not_applicable')) OR json_extract(r.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END` : `CASE WHEN json_extract(r.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END`;
  const revenueContent = quality ? "r.content_item_id" : "COALESCE(a.last_content_item_id,a.first_content_item_id,r.content_item_id)";
  const revenueOffer = quality ? "r.offer_id" : "COALESCE(a.last_offer_id,a.first_offer_id,r.offer_id)";
  const [revenueResult, eventsResult, attribution, offersResult, experimentsResult, errors, topContent, topOffers] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) transactions,COALESCE(SUM(gross_amount),0) gross,COALESCE(SUM(net_amount),0) net,COALESCE(SUM(margin_amount),0) profit,
    SUM(${feeCompleteSql}) fee_complete,SUM(${costCompleteSql}) cost_complete
    FROM monetization_revenue_events r WHERE brand_id=?1 AND occurred_at>=datetime('now',?2) AND status IN('confirmed','refunded') ${revenueScope}`).bind(BRAND_ID4, since),
    env.DB.prepare(`SELECT SUM(CASE WHEN event_type IN('click','affiliate_click') THEN 1 ELSE 0 END) clicks,SUM(CASE WHEN event_type='lead' THEN 1 ELSE 0 END) leads,SUM(CASE WHEN event_type='checkout' THEN 1 ELSE 0 END) checkouts FROM monetization_events e WHERE brand_id=?1 AND occurred_at>=datetime('now',?2) ${eventScope}`).bind(BRAND_ID4, since),
    env.DB.prepare(`SELECT a.attribution_status,COUNT(*) total FROM monetization_attributions a JOIN monetization_revenue_events r ON r.id=a.revenue_event_id
    WHERE a.brand_id=?1 AND a.created_at>=datetime('now',?2) AND r.status IN('confirmed','refunded') ${revenueScope} GROUP BY a.attribution_status`).bind(BRAND_ID4, since),
    env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active FROM monetization_offers WHERE brand_id=?1`).bind(BRAND_ID4),
    env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) running FROM monetization_experiments WHERE brand_id=?1`).bind(BRAND_ID4),
    env.DB.prepare(`SELECT provider,operation,error_message,created_at FROM monetization_integration_logs WHERE status='error' AND created_at>=datetime('now',?1) ORDER BY created_at DESC LIMIT 20`).bind(since),
    env.DB.prepare(`SELECT c.id,c.title,c.platform,COUNT(r.id) transactions,COALESCE(SUM(r.net_amount),0) net_revenue,COALESCE(SUM(r.margin_amount),0) profit
    FROM monetization_revenue_events r LEFT JOIN monetization_attributions a ON a.revenue_event_id=r.id
    JOIN content_items c ON c.id=${revenueContent}
    WHERE r.brand_id=?1 AND r.occurred_at>=datetime('now',?2) AND r.status IN('confirmed','refunded') ${revenueScope}
    GROUP BY c.id,c.title,c.platform ORDER BY profit DESC LIMIT 10`).bind(BRAND_ID4, since),
    env.DB.prepare(`SELECT o.id,o.name,o.type,COUNT(r.id) transactions,COALESCE(SUM(r.net_amount),0) net_revenue,COALESCE(SUM(r.margin_amount),0) profit
    FROM monetization_revenue_events r LEFT JOIN monetization_attributions a ON a.revenue_event_id=r.id
    JOIN monetization_offers o ON o.id=${revenueOffer}
    WHERE r.brand_id=?1 AND r.occurred_at>=datetime('now',?2) AND r.status IN('confirmed','refunded') ${revenueScope}
    GROUP BY o.id,o.name,o.type ORDER BY profit DESC LIMIT 10`).bind(BRAND_ID4, since)
  ]);
  const revenue = revenueResult?.results?.[0] ?? {}, events = eventsResult?.results?.[0] ?? {};
  const offers = offersResult?.results?.[0] ?? {}, experiments = experimentsResult?.results?.[0] ?? {};
  const transactionCount = n(revenue?.transactions), feeComplete = n(revenue?.fee_complete), costComplete = n(revenue?.cost_complete);
  return { status: 200, body: { ok: true, periodDays: days, dataScope: quality ? "verified-production" : "legacy-unclassified", revenue: {
    transactions: transactionCount,
    gross: n(revenue?.gross),
    net: n(revenue?.net),
    profit: n(revenue?.profit),
    contributionMarginRecorded: n(revenue?.profit),
    accountingProfit: null,
    metricQuality: { feeCompleteEvents: feeComplete, costCompleteEvents: costComplete, completeness: transactionCount > 0 && feeComplete === transactionCount && costComplete === transactionCount ? "complete" : "incomplete" }
  }, traffic: { clicks: n(events?.clicks), leads: n(events?.leads), checkouts: n(events?.checkouts) }, offers: { total: n(offers?.total), active: n(offers?.active) }, experiments: { total: n(experiments?.total), running: n(experiments?.running) }, attribution: attribution?.results ?? [], topContent: topContent?.results ?? [], topOffers: topOffers?.results ?? [], recentErrors: errors?.results ?? [] } };
}
__name(operationsSnapshot, "operationsSnapshot");
async function commandReport(request, env) {
  const b = obj(await request.json());
  const q = (s2(b.query, 500) ?? "").toLowerCase();
  const url = new URL("https://internal/report");
  url.searchParams.set("days", String(Math.max(1, Math.min(365, n(b.days, 30)))));
  const snap = (await operationsSnapshot(env, url)).body;
  if (q.includes("revenue") || q.includes("omzet") || q.includes("pendapatan") || q.includes("profit")) return { status: 200, body: { ok: true, type: "revenue", data: snap.revenue, periodDays: snap.periodDays, dataScope: snap.dataScope } };
  if (q.includes("offer") || q.includes("produk")) return { status: 200, body: { ok: true, type: "offers", data: snap.topOffers, periodDays: snap.periodDays, dataScope: snap.dataScope } };
  if (q.includes("konten") || q.includes("content") || q.includes("perform")) return { status: 200, body: { ok: true, type: "content", data: snap.topContent, periodDays: snap.periodDays, dataScope: snap.dataScope } };
  if (q.includes("error") || q.includes("gagal") || q.includes("health")) return { status: 200, body: { ok: true, type: "health", data: snap.recentErrors } };
  return { status: 200, body: { ok: true, type: "overview", data: snap } };
}
__name(commandReport, "commandReport");

// src/monetization-app.ts
var BRAND_ID5 = "brand-umkm-naik-kelas";
var APP_EVENTS = /* @__PURE__ */ new Set(["app_install", "app_open", "signup", "tool_used"]);
function uid5(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
__name(uid5, "uid");
function s3(v, max = 500) {
  if (typeof v !== "string") return null;
  const x = v.trim();
  return x ? x.slice(0, max) : null;
}
__name(s3, "s");
function safeJson2(v) {
  return JSON.stringify(v ?? {});
}
__name(safeJson2, "safeJson");
function isHttpsUrl(v) {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}
__name(isHttpsUrl, "isHttpsUrl");
async function bodyObject(request) {
  const x = await request.json();
  if (!x || typeof x !== "object" || Array.isArray(x)) throw new Error("Body JSON harus object.");
  return x;
}
__name(bodyObject, "bodyObject");
async function ingestAppEvent(request, env) {
  try {
    const b = await bodyObject(request);
    const eventType = s3(b.eventType, 40);
    const appInstanceId = s3(b.appInstanceId, 180);
    if (!eventType || !APP_EVENTS.has(eventType)) return { status: 400, body: { ok: false, error: "eventType APK tidak valid." } };
    if (!appInstanceId) return { status: 400, body: { ok: false, error: "appInstanceId pseudonymous wajib." } };
    const idem = s3(b.idempotencyKey, 180) ?? `apk:${eventType}:${appInstanceId}:${s3(b.occurredAt, 50) ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 16)}`;
    const id = uid5("evt");
    const insert = env.DB.prepare(`INSERT OR IGNORE INTO monetization_events
   (id,event_type,brand_id,content_item_id,campaign_id,offer_id,source,platform,visitor_id,session_id,idempotency_key,metadata_json,occurred_at)
   VALUES (?1,?2,?3,?4,?5,?6,'apk','app',?7,?8,?9,?10,COALESCE(?11,CURRENT_TIMESTAMP))`).bind(id, eventType, BRAND_ID5, s3(b.contentItemId, 100), s3(b.campaignId, 100), s3(b.offerId, 100), appInstanceId, s3(b.sessionId, 180), idem, safeJson2({ appVersion: s3(b.appVersion, 40), devicePlatform: s3(b.devicePlatform, 40) ?? "android", properties: b.properties ?? {} }), s3(b.occurredAt, 50));
    const quality = await monetizationQualityEnabled(env);
    const results = quality ? await env.DB.batch([insert, unknownQualityStatement(env, "event", id, "APK event awaits provenance verification.")]) : [await insert.run()];
    if (Number(results[0]?.meta.changes ?? 0) === 0) {
      const existing = await env.DB.prepare("SELECT id FROM monetization_events WHERE brand_id=?1 AND idempotency_key=?2").bind(BRAND_ID5, idem).first();
      if (existing) return { status: 200, body: { ok: true, duplicate: true, eventId: existing.id, eventType } };
      return { status: 409, body: { ok: false, error: "APK event tidak dapat disimpan." } };
    }
    return { status: 201, body: { ok: true, duplicate: false, eventId: id, eventType } };
  } catch {
    return { status: 400, body: { ok: false, error: "APK event tidak valid." } };
  }
}
__name(ingestAppEvent, "ingestAppEvent");
async function createAppHandoff(request, env) {
  try {
    const b = await bodyObject(request);
    const appInstanceId = s3(b.appInstanceId, 180);
    const offerId = s3(b.offerId, 100);
    if (!appInstanceId || !offerId) return { status: 400, body: { ok: false, error: "appInstanceId dan offerId wajib." } };
    const offer = await env.DB.prepare(`SELECT id,type,destination_url,status FROM monetization_offers WHERE id=?1 AND brand_id=?2`).bind(offerId, BRAND_ID5).first();
    if (!offer || offer.status !== "active") return { status: 404, body: { ok: false, error: "Offer aktif tidak ditemukan." } };
    const override = s3(b.destinationUrl, 2e3);
    const destination = override ?? s3(offer.destination_url, 2e3);
    if (!destination || !isHttpsUrl(destination)) return { status: 400, body: { ok: false, error: "Destination offer wajib HTTPS." } };
    const eventId = uid5("evt");
    const idem = s3(b.idempotencyKey, 180) ?? `apk-handoff:${appInstanceId}:${offerId}:${crypto.randomUUID()}`;
    const eventType = offer.type === "affiliate" ? "affiliate_click" : "click";
    const insert = env.DB.prepare(`INSERT OR IGNORE INTO monetization_events
   (id,event_type,brand_id,content_item_id,campaign_id,offer_id,source,platform,visitor_id,session_id,idempotency_key,metadata_json,occurred_at)
   VALUES (?1,?2,?3,?4,?5,?6,'apk','app',?7,?8,?9,?10,CURRENT_TIMESTAMP)`).bind(eventId, eventType, BRAND_ID5, s3(b.contentItemId, 100), s3(b.campaignId, 100), offerId, appInstanceId, s3(b.sessionId, 180), idem, safeJson2({ handoff: true, destinationHost: new URL(destination).hostname, appVersion: s3(b.appVersion, 40), offerType: offer.type }));
    const quality = await monetizationQualityEnabled(env);
    const results = quality ? await env.DB.batch([insert, unknownQualityStatement(env, "event", eventId, "APK handoff awaits provenance verification.")]) : [await insert.run()];
    if (Number(results[0]?.meta.changes ?? 0) === 0) {
      const existing = await env.DB.prepare(`SELECT id,event_type FROM monetization_events WHERE brand_id=?1 AND idempotency_key=?2`).bind(BRAND_ID5, idem).first();
      if (existing) return { status: 200, body: { ok: true, duplicate: true, eventId: existing.id, eventType: existing.event_type, offerId, destinationUrl: destination, attributionVisitorId: appInstanceId } };
      return { status: 409, body: { ok: false, error: "APK handoff tidak dapat disimpan." } };
    }
    return { status: 201, body: { ok: true, duplicate: false, eventId, eventType, offerId, destinationUrl: destination, attributionVisitorId: appInstanceId } };
  } catch {
    return { status: 400, body: { ok: false, error: "APK handoff tidak valid." } };
  }
}
__name(createAppHandoff, "createAppHandoff");

// src/monetization-worker-v4.ts
function json4(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
__name(json4, "json");
function auth(r, e) {
  return Boolean(e.MONETIZATION_INGEST_TOKEN) && r.headers.get("Authorization") === `Bearer ${e.MONETIZATION_INGEST_TOKEN}`;
}
__name(auth, "auth");
function secureEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i2 = 0; i2 < a.length; i2++) diff |= a.charCodeAt(i2) ^ b.charCodeAt(i2);
  return diff === 0;
}
__name(secureEqual, "secureEqual");
function isPublicMonetizationRoute(request, url) {
  if (request.method === "GET" && url.pathname === "/api/monetization/status") return true;
  if (request.method === "POST" && url.pathname === "/api/monetization/webhooks/lynk") return true;
  return false;
}
__name(isPublicMonetizationRoute, "isPublicMonetizationRoute");
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
__name(asObject, "asObject");
function objectKeys(value) {
  return Object.keys(asObject(value)).slice(0, 40);
}
__name(objectKeys, "objectKeys");
function text(value, max = 200) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}
__name(text, "text");
function monetary(value, fallback = 0) {
  if (value === void 0 || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^-?(0|[1-9]\d*)$/.test(value.trim()) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) ? parsed : null;
}
__name(monetary, "monetary");
function hasOwn2(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
__name(hasOwn2, "hasOwn");
function providerOk(response) {
  if (response.status >= 200 && response.status < 300 && response.status !== 200) {
    return new Response(response.body, { status: 200, headers: response.headers });
  }
  return response;
}
__name(providerOk, "providerOk");
function buildRealLynkPayload(payload) {
  const root = asObject(payload);
  const data = asObject(root.data);
  const messageData = asObject(data.message_data ?? data.messageData);
  const event = (text(root.event, 80) ?? "").toLowerCase();
  const action = (text(data.message_action ?? data.messageAction, 40) ?? "").toUpperCase();
  const refId = text(messageData.refId ?? messageData.ref_id, 180);
  const saleEvent = event === "payment.received";
  const reversalEvent = ["payment.refunded", "payment.cancelled", "payment.canceled", "payment.chargeback", "payment.reversed"].includes(event);
  if (!saleEvent && !reversalEvent) return { kind: "unknown" };
  if (action !== "SUCCESS") return { kind: "unknown" };
  if (!refId) return { kind: "invalid_known_event", error: "Lynk SUCCESS event wajib memiliki refId." };
  const totals = asObject(messageData.totals);
  if (!hasOwn2(messageData, "totals") || Object.keys(totals).length === 0) {
    return { kind: "invalid_known_event", error: "Lynk SUCCESS event wajib memiliki totals." };
  }
  if (hasOwn2(messageData, "items") && !Array.isArray(messageData.items)) {
    return { kind: "invalid_known_event", error: "Lynk items harus berupa array." };
  }
  const rawItems = Array.isArray(messageData.items) ? messageData.items : [];
  if (rawItems.length > 50) return { kind: "invalid_known_event", error: "Lynk items melebihi batas 50." };
  if (saleEvent && rawItems.length === 0) {
    return { kind: "invalid_known_event", error: "Lynk payment.received wajib memiliki item." };
  }
  if (rawItems.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    return { kind: "invalid_known_event", error: "Lynk item tidak valid." };
  }
  const items = rawItems.map(asObject);
  const firstItem = items[0] ?? {};
  const productId = text(firstItem.uuid ?? firstItem.id, 180);
  if (saleEvent && !productId) return { kind: "invalid_known_event", error: "Lynk payment.received wajib memiliki product id." };
  const itemAmounts = items.map((item) => hasOwn2(item, "price") ? monetary(item.price, Number.NaN) : null);
  const itemQuantities = items.map((item) => hasOwn2(item, "qty") ? monetary(item.qty, Number.NaN) : 1);
  if (itemAmounts.some((value) => value === null || !Number.isSafeInteger(value) || Number(value) < 0) || itemQuantities.some((value) => value === null || !Number.isSafeInteger(value) || Number(value) <= 0)) {
    return { kind: "invalid_known_event", error: "Lynk item amount/quantity tidak valid." };
  }
  const calculatedItems = items.reduce((sum, item, index) => sum + Number(itemAmounts[index]) * Number(itemQuantities[index]), 0);
  const grossKey = hasOwn2(totals, "grandTotal") ? "grandTotal" : hasOwn2(totals, "grand_total") ? "grand_total" : null;
  if (!grossKey) return { kind: "invalid_known_event", error: "Lynk totals.grandTotal wajib tersedia." };
  const gross = monetary(totals[grossKey], Number.NaN);
  if (gross === null || !Number.isSafeInteger(gross) || gross <= 0) {
    return { kind: "invalid_known_event", error: "Lynk gross amount tidak valid." };
  }
  const feeReported = ["fee", "feeAmount", "fee_amount", "serviceFee", "service_fee"].some((key) => Object.prototype.hasOwnProperty.call(totals, key));
  const fee = monetary(totals.fee ?? totals.feeAmount ?? totals.fee_amount ?? totals.serviceFee ?? totals.service_fee, 0);
  if (fee === null || !Number.isSafeInteger(fee) || fee < 0 || fee > gross) {
    return { kind: "invalid_known_event", error: "Lynk fee tidak valid." };
  }
  const occurredAt = text(messageData.createdAt ?? messageData.created_at, 50);
  const safeItems = items.slice(0, 50).map((item, index) => ({ uuid: text(item.uuid ?? item.id, 180), qty: Number(itemQuantities[index]), price: Number(itemAmounts[index]) }));
  return { kind: "normalized", payload: {
    event: reversalEvent ? "payment.refunded" : "payment.received",
    data: {
      transaction_id: refId,
      product_id: productId,
      amount: gross,
      fee,
      fee_data_status: feeReported ? "reported" : "unknown",
      cost_data_status: "unknown",
      net_amount: gross - fee,
      currency: "IDR",
      status: reversalEvent ? "refunded" : "confirmed",
      created_at: occurredAt,
      message_action: "SUCCESS",
      item_count: items.length,
      provider_item_subtotal: calculatedItems,
      provider_item_total_delta: gross - calculatedItems,
      items: safeItems
    }
  } };
}
__name(buildRealLynkPayload, "buildRealLynkPayload");
async function logRejectedLynk(env, error, payload) {
  const root = asObject(payload);
  const data = asObject(root.data);
  const messageData = asObject(data.message_data ?? data.messageData);
  const metadata = { receivedAt: (/* @__PURE__ */ new Date()).toISOString(), kind: "invalid_known_event", topLevelKeys: objectKeys(root), dataKeys: objectKeys(data), messageDataKeys: objectKeys(messageData), rawPayloadStored: false };
  await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,error_message,metadata_json) VALUES ('lynk','webhook_normalization','error',?1,?2)`).bind(error, JSON.stringify(metadata)).run();
}
__name(logRejectedLynk, "logRejectedLynk");
async function handleLynk(request, env, url) {
  if (!env.LYNK_WEBHOOK_SECRET) return json4({ ok: false, error: "Lynk webhook belum dikonfigurasi." }, 503);
  const diagnosticRequest = request.clone();
  const callbackToken = url.searchParams.get("token");
  const tokenAuthenticated = Boolean(callbackToken && secureEqual(callbackToken, env.LYNK_WEBHOOK_SECRET));
  const hmacRequest = diagnosticRequest.clone();
  const hmacAuthenticated = tokenAuthenticated ? false : (await verifyGenericWebhook(hmacRequest, env.LYNK_WEBHOOK_SECRET)).ok;
  if (tokenAuthenticated || hmacAuthenticated) {
    let originalPayload = {};
    try {
      originalPayload = await diagnosticRequest.clone().json();
    } catch {
      const error = "Payload Lynk bukan JSON yang valid.";
      await logRejectedLynk(env, error, {});
      return json4({ ok: false, error }, 400);
    }
    const parsed = buildRealLynkPayload(originalPayload);
    if (parsed.kind === "invalid_known_event") {
      await logRejectedLynk(env, parsed.error, originalPayload);
      return json4({ ok: false, error: parsed.error }, 400);
    }
    if (parsed.kind === "normalized") {
      const relayPromise = env.PANGLIMA_LYNK_WEBHOOK ? env.PANGLIMA_LYNK_WEBHOOK.fetch(new Request("https://panglima-lynk-webhook.internal/internal/monetization-relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(originalPayload)
      })).then((response) => ({ ok: response.ok, status: response.status })).catch((error) => ({ ok: false, status: 0, error: error instanceof Error ? error.message : "unknown" })) : Promise.resolve({ ok: false, status: 0, skipped: true });
      const safeRequest = new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.payload) });
      const monetizationResponse = await monetization_worker_v3_default.fetch(safeRequest, { ...env, LYNK_WEBHOOK_SECRET: void 0 });
      const relayResult = await relayPromise;
      if (!relayResult.ok) {
        console.error(JSON.stringify({ message: "panglima_payment_relay_failed", status: relayResult.status, skipped: relayResult.skipped === true, error: relayResult.error ?? null }));
      }
      return providerOk(monetizationResponse);
    }
  }
  const delegatedEnv = tokenAuthenticated ? { ...env, LYNK_WEBHOOK_SECRET: void 0 } : env;
  const response = await monetization_worker_v3_default.fetch(request, delegatedEnv);
  if (response.status !== 400) return providerOk(response);
  const responseClone = response.clone();
  let errorMessage = "";
  try {
    const body = await responseClone.json();
    errorMessage = typeof body.error === "string" ? body.error : "";
  } catch {
  }
  if (errorMessage !== "Lynk transaction/order id tidak ditemukan.") return response;
  let payload = {};
  try {
    payload = await diagnosticRequest.json();
  } catch {
  }
  const root = asObject(payload);
  const data = asObject(root.data);
  const messageData = asObject(data.message_data ?? data.messageData);
  const metadata = { receivedAt: (/* @__PURE__ */ new Date()).toISOString(), kind: "probe_or_unknown_schema", topLevelKeys: objectKeys(root), dataKeys: objectKeys(data), messageDataKeys: objectKeys(messageData) };
  await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,error_message,metadata_json) VALUES ('lynk','webhook_probe','warning',NULL,?1)`).bind(JSON.stringify(metadata)).run();
  return json4({ ok: true, accepted: true, ignored: true, reason: "Lynk probe/unknown schema accepted without revenue write." }, 200);
}
__name(handleLynk, "handleLynk");
var monetization_worker_v4_default = { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/monetization/") && !isPublicMonetizationRoute(request, url) && !auth(request, env)) {
    return json4({ ok: false, error: "Unauthorized" }, 401);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/webhooks/lynk") return handleLynk(request, env, url);
  if (request.method === "POST" && url.pathname === "/api/monetization/app/events") {
    const x = await ingestAppEvent(request, env);
    return json4(x.body, x.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/app/handoff") {
    const x = await createAppHandoff(request, env);
    return json4(x.body, x.status);
  }
  if (request.method === "GET" && url.pathname === "/api/monetization/operations") {
    const x = await operationsSnapshot(env, url);
    return json4(x.body, x.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/command") {
    const x = await commandReport(request, env);
    return json4(x.body, x.status);
  }
  if (request.method === "GET" && url.pathname === "/api/monetization/experiments") {
    const x = await listExperiments(env);
    return json4(x.body, x.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/experiments") {
    const x = await createExperiment(request, env);
    return json4(x.body, x.status);
  }
  const m = url.pathname.match(/^\/api\/monetization\/experiments\/([^/]+)\/complete$/);
  if (request.method === "POST" && m?.[1]) {
    const x = await completeExperiment(decodeURIComponent(m[1]), request, env);
    return json4(x.body, x.status);
  }
  return monetization_worker_v3_default.fetch(request, env);
} };

// src/monetization-dashboard.ts
var monetizationDashboardHtml = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UMKM Monetization Engine</title><style>:root{--bg:#f5f0e7;--paper:#fffaf0;--ink:#1b1612;--muted:#756d64;--red:#9e1b13;--gold:#c69a3d;--green:#23845b;--line:#e7d9c2}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif}main{max-width:1280px;margin:auto;padding:32px 20px 60px}.top{display:flex;justify-content:space-between;gap:20px;align-items:center}.eyebrow{font-size:11px;letter-spacing:.16em;color:var(--red);font-weight:800}.top h1{font-family:Georgia,serif;margin:5px 0}.badge{background:#e6f4ed;color:var(--green);padding:7px 10px;border-radius:999px;font-weight:800;font-size:12px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:22px 0}.card,.panel{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px}.card span,.muted{color:var(--muted);font-size:12px}.card strong{display:block;font-family:Georgia,serif;font-size:28px;margin-top:8px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.panel h2{font-family:Georgia,serif;font-size:19px;margin:0 0 14px}.list{display:grid;gap:9px}.row{display:grid;grid-template-columns:1fr auto;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}.row:last-child{border-bottom:0}.row small{display:block;color:var(--muted);margin-top:3px}.money{font-weight:800}.warn{color:#9e1b13}.ok{color:var(--green)}button,select{border:1px solid var(--line);background:#fff;padding:9px 11px;border-radius:9px}button{background:var(--red);color:#fff;border:0;font-weight:700}@media(max-width:800px){.grid{grid-template-columns:1fr 1fr}.two{grid-template-columns:1fr}}@media(max-width:460px){.grid{grid-template-columns:1fr}}</style></head><body><main><div class="top"><div><div class="eyebrow">MONETIZATION ENGINE v1.0</div><h1>UMKM Naik Kelas</h1><div class="muted">Revenue, attribution, conversion, dan AI learning.</div></div><div><select id="days"><option value="7">7 hari</option><option selected value="30">30 hari</option><option value="90">90 hari</option></select> <button id="refresh">Refresh</button></div></div><div class="grid"><div class="card"><span>Net Revenue</span><strong id="net">\u2014</strong></div><div class="card"><span>Contribution Profit</span><strong id="profit">\u2014</strong></div><div class="card"><span>Clicks</span><strong id="clicks">\u2014</strong></div><div class="card"><span>Leads</span><strong id="leads">\u2014</strong></div></div><div class="two"><section class="panel"><h2>Top Content by Profit</h2><div id="content" class="list"></div></section><section class="panel"><h2>Top Offers</h2><div id="offers" class="list"></div></section></div><div class="two" style="margin-top:14px"><section class="panel"><h2>Attribution</h2><div id="attr" class="list"></div></section><section class="panel"><h2>System Health</h2><div id="health" class="list"></div></section></div></main><script>const rupiah=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));const num=n=>new Intl.NumberFormat('id-ID').format(Number(n||0));const row=(name,sub,val)=>'<div class="row"><div><b>'+name+'</b><small>'+sub+'</small></div><div class="money">'+val+'</div></div>';async function load(){const d=document.getElementById('days').value;const r=await fetch('/api/monetization/operations?days='+d);const x=await r.json();if(!r.ok||!x.ok)throw new Error(x.error||'Gagal memuat');document.getElementById('net').textContent=rupiah(x.revenue.net);document.getElementById('profit').textContent=rupiah(x.revenue.profit);document.getElementById('clicks').textContent=num(x.traffic.clicks);document.getElementById('leads').textContent=num(x.traffic.leads);document.getElementById('content').innerHTML=(x.topContent||[]).map(v=>row(v.title||v.id,(v.platform||'')+' \xB7 '+num(v.transactions)+' transaksi',rupiah(v.profit))).join('')||'<div class="muted">Belum ada data.</div>';document.getElementById('offers').innerHTML=(x.topOffers||[]).map(v=>row(v.name||v.id,(v.type||'')+' \xB7 '+num(v.transactions)+' transaksi',rupiah(v.profit))).join('')||'<div class="muted">Belum ada data.</div>';document.getElementById('attr').innerHTML=(x.attribution||[]).map(v=>row(v.attribution_status,'revenue attribution',num(v.total))).join('')||'<div class="muted">Belum ada attribution.</div>';document.getElementById('health').innerHTML=(x.recentErrors||[]).map(v=>row(v.provider,v.operation+' \xB7 '+v.created_at,'<span class="warn">error</span>')).join('')||'<div class="ok">Tidak ada error terbaru.</div>';}document.getElementById('refresh').onclick=()=>load().catch(e=>alert(e.message));document.getElementById('days').onchange=()=>load().catch(e=>alert(e.message));load().catch(e=>document.getElementById('health').innerHTML='<div class="warn">'+e.message+'</div>');<\/script></body></html>`;

// src/monetization-worker-v5.ts
function json5(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
__name(json5, "json");
function authorized3(request, env) {
  return Boolean(env.MONETIZATION_INGEST_TOKEN) && request.headers.get("Authorization") === `Bearer ${env.MONETIZATION_INGEST_TOKEN}`;
}
__name(authorized3, "authorized");
function isQueueMessage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value;
  return (row.kind === "operational_probe" || row.kind === "integration_event") && typeof row.correlationId === "string" && row.correlationId.length > 0;
}
__name(isQueueMessage, "isQueueMessage");
async function recordCron(env, status, metadata, error) {
  await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,error_message,metadata_json) VALUES ('system','daily_revenue_learning',?1,?2,?3)`).bind(status, error ?? null, JSON.stringify(metadata ?? {})).run();
}
__name(recordCron, "recordCron");
async function recordQueue(env, message) {
  await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,correlation_id,metadata_json) VALUES ('system',?1,'success',?2,?3)`).bind(message.kind === "operational_probe" ? "queue_probe" : "queue_integration_event", message.correlationId, JSON.stringify(message.metadata ?? {})).run();
}
__name(recordQueue, "recordQueue");
var monetization_worker_v5_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/dashboard" || url.pathname === "/monetization")) return new Response(monetizationDashboardHtml, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" } });
    if (request.method === "POST" && url.pathname === "/api/monetization/queue/probe") {
      if (!authorized3(request, env)) return json5({ ok: false, error: "Unauthorized" }, 401);
      if (!env.MONETIZATION_QUEUE) return json5({ ok: false, error: "Queue binding belum tersedia." }, 503);
      const body = await request.json().catch(() => ({}));
      const rawCorrelation = body.correlationId;
      const correlationId = typeof rawCorrelation === "string" && rawCorrelation.trim() ? rawCorrelation.trim().slice(0, 180) : `queue-probe-${crypto.randomUUID()}`;
      await env.MONETIZATION_QUEUE.send({ kind: "operational_probe", correlationId, metadata: { receivedAt: (/* @__PURE__ */ new Date()).toISOString() } });
      return json5({ ok: true, queued: true, correlationId }, 202);
    }
    return monetization_worker_v4_default.fetch(request, env);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const result = await runLearning(env, new URL("https://internal.local/api/monetization/learning/run?days=30"));
        const body = result.body;
        await recordCron(env, result.status >= 200 && result.status < 300 ? "success" : "error", { cron: controller.cron, status: result.status, skipped: body?.skipped ?? false, storedInsights: body?.storedInsights ?? 0 }, result.status >= 400 ? String(body?.error ?? "learning_failed") : void 0);
      } catch (error) {
        await recordCron(env, "error", { cron: controller.cron }, error instanceof Error ? error.message : "unknown cron error");
      }
    })());
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      if (!isQueueMessage(message.body)) {
        message.ack();
        continue;
      }
      try {
        await recordQueue(env, message.body);
        message.ack();
      } catch {
        message.retry();
      }
    }
  }
};

// src/monetization-worker-v6.ts
function json6(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}
__name(json6, "json");
async function verifyOpenClaw(request, env) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const verifyRequest = new Request("https://content-os.internal/api/internal/openclaw/verify", {
    method: "POST",
    headers: { Authorization: authorization }
  });
  const response = await env.CONTENT_OS.fetch(verifyRequest);
  if (response.status !== 200) return false;
  const body = await response.json().catch(() => ({}));
  return body.ok === true && body.principal === "openclaw";
}
__name(verifyOpenClaw, "verifyOpenClaw");
var monetization_worker_v6_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/monetization/openclaw/command") {
      if (!await verifyOpenClaw(request, env)) return json6({ ok: false, error: "Unauthorized" }, 401);
      const result = await commandReport(request, env);
      return json6(result.body, result.status);
    }
    if (request.method === "GET" && url.pathname === "/api/monetization/openclaw/context") {
      if (!await verifyOpenClaw(request, env)) return json6({ ok: false, error: "Unauthorized" }, 401);
      const result = await learningContext(env);
      const body = result.body;
      return json6({
        ok: result.status >= 200 && result.status < 300,
        role: "revenue-learning-feedback",
        consumer: "openclaw-hermes-research-loop",
        insights: body.insights ?? [],
        guidance: body.guidance ?? {},
        policy: { researchAssistant: "Hermes", contentAssistant: "DeepSeek", publisher: "Repliz draft-only" }
      }, result.status);
    }
    if (request.method === "GET" && url.pathname === "/api/monetization/openclaw/runtime") {
      if (!env.MONETIZATION_INGEST_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.MONETIZATION_INGEST_TOKEN}`) {
        return json6({ ok: false, error: "Unauthorized" }, 401);
      }
      const response = await env.CONTENT_OS.fetch(new Request("https://content-os.internal/api/status"));
      return json6({
        ok: response.status === 200,
        serviceBinding: response.status === 200,
        openClawVerifier: "configured-on-content-os",
        revenueCommand: "ready",
        revenueLearningContext: "ready",
        externalCallerAcceptance: "pending-real-openclaw-request"
      }, response.status === 200 ? 200 : 503);
    }
    return monetization_worker_v5_default.fetch(request, env);
  },
  scheduled: monetization_worker_v5_default.scheduled,
  queue: monetization_worker_v5_default.queue
};

// src/monetization-worker-v7.ts
function json7(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}
__name(json7, "json");
function telegramAuthorized(request, env) {
  return Boolean(env.TELEGRAM_WEBHOOK_SECRET) && request.headers.get("X-Telegram-Bot-Api-Secret-Token") === env.TELEGRAM_WEBHOOK_SECRET;
}
__name(telegramAuthorized, "telegramAuthorized");
function commandName(text4) {
  return text4.trim().split(/\s+/)[0]?.toLowerCase().replace(/@[^\s]+$/, "") ?? "";
}
__name(commandName, "commandName");
function telegramReply(chatId, text4) {
  return json7({ method: "sendMessage", chat_id: chatId, text: text4, parse_mode: "HTML", disable_web_page_preview: true });
}
__name(telegramReply, "telegramReply");
function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
__name(esc, "esc");
function compactRows(rows, limit = 5) {
  if (!Array.isArray(rows) || rows.length === 0) return "Belum ada data.";
  return rows.slice(0, limit).map((row, index) => {
    const x = row && typeof row === "object" && !Array.isArray(row) ? row : {};
    const name = x.name ?? x.title ?? x.id ?? `#${index + 1}`;
    const margin = Number(x.contributionMarginRecorded ?? x.profit ?? 0);
    return `${index + 1}. ${esc(name)} \u2014 margin tercatat Rp${new Intl.NumberFormat("id-ID").format(margin)}`;
  }).join("\n");
}
__name(compactRows, "compactRows");
async function handleTelegram(request, env) {
  if (!env.TELEGRAM_WEBHOOK_SECRET) return json7({ ok: false, error: "Telegram command center belum diaktifkan." }, 503);
  if (!telegramAuthorized(request, env)) return json7({ ok: false, error: "Unauthorized" }, 401);
  const update = await request.json().catch(() => ({}));
  const message = update.message;
  const chatId = message?.chat?.id;
  const text4 = typeof message?.text === "string" ? message.text.trim() : "";
  if (chatId === void 0 || !text4) return json7({ ok: true, ignored: true });
  const command = commandName(text4);
  if (command === "/help" || command === "/start") {
    return telegramReply(chatId, "<b>UMKM Content OS</b>\n/revenue \u2014 ledger 30 hari\n/profit \u2014 margin kontribusi tercatat\n/offers \u2014 top offer\n/content \u2014 top content\n/health \u2014 integration health\n/learning \u2014 revenue learning untuk riset berikutnya");
  }
  if (command === "/learning") {
    const result2 = await learningContext(env);
    const body2 = result2.body;
    const insights = Array.isArray(body2.insights) ? body2.insights : [];
    const lines = insights.slice(0, 5).map((item, index) => {
      const row = item && typeof item === "object" && !Array.isArray(item) ? item : {};
      return `${index + 1}. ${esc(row.statement ?? "Insight")}`;
    });
    return telegramReply(chatId, `<b>Revenue Learning</b>
${lines.join("\n") || "Belum ada insight aktif."}`);
  }
  const queryMap = {
    "/revenue": "revenue",
    "/profit": "profit",
    "/offers": "offer",
    "/content": "content",
    "/health": "health"
  };
  const query = queryMap[command];
  if (!query) return telegramReply(chatId, "Perintah tidak dikenal. Gunakan /help.");
  const internalRequest = new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, days: 30 }) });
  const result = await commandReport(internalRequest, env);
  const body = result.body;
  if (result.status >= 400) return telegramReply(chatId, "Command gagal diproses.");
  if (body.type === "revenue") {
    const data = body.data ?? {};
    const f = /* @__PURE__ */ __name((v) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v ?? 0)), "f");
    return telegramReply(chatId, `<b>Revenue \xB7 30 hari</b>
Omzet tercatat: ${f(data.gross)}
Penerimaan bersih tercatat: ${f(data.net)}
Margin kontribusi tercatat: ${f(data.contributionMarginRecorded ?? data.profit)}
Entri ledger: ${Number(data.transactions ?? 0)}
Bukan laba bersih akuntansi.`);
  }
  if (body.type === "offers") return telegramReply(chatId, `<b>Top Offers</b>
${compactRows(body.data)}`);
  if (body.type === "content") return telegramReply(chatId, `<b>Top Content</b>
${compactRows(body.data)}`);
  if (body.type === "health") {
    const errors = Array.isArray(body.data) ? body.data : [];
    return telegramReply(chatId, errors.length ? `<b>Health</b>
${errors.slice(0, 5).map((e) => esc(JSON.stringify(e))).join("\n")}` : "<b>Health</b>\nTidak ada error terbaru.");
  }
  return telegramReply(chatId, "Command selesai.");
}
__name(handleTelegram, "handleTelegram");
var monetization_worker_v7_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/monetization/telegram/webhook") return handleTelegram(request, env);
    if (request.method === "GET" && url.pathname === "/api/monetization/telegram/runtime") {
      if (!env.MONETIZATION_INGEST_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.MONETIZATION_INGEST_TOKEN}`) return json7({ ok: false, error: "Unauthorized" }, 401);
      return json7({ ok: true, configured: Boolean(env.TELEGRAM_WEBHOOK_SECRET), mode: "single-bot-read-only-command-center", commands: ["/revenue", "/profit", "/offers", "/content", "/health", "/learning"], publishing: false });
    }
    return monetization_worker_v6_default.fetch(request, env);
  },
  scheduled: monetization_worker_v6_default.scheduled,
  queue: monetization_worker_v6_default.queue
};

// src/monetization-worker-v8.ts
var TELEGRAM_COMMANDS = [
  { command: "/revenue", intent: "revenue", description: "Revenue 30 hari" },
  { command: "/profit", intent: "profit", description: "Margin kontribusi tercatat 30 hari" },
  { command: "/offers", intent: "offer", description: "Top offer berdasarkan margin tercatat" },
  { command: "/content", intent: "content", description: "Top content berdasarkan margin tercatat" },
  { command: "/health", intent: "health", description: "Integration health" },
  { command: "/learning", intent: "learning-context", description: "Revenue learning untuk riset berikutnya" }
];
function json8(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}
__name(json8, "json");
async function verifyOpenClaw2(request, env) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const response = await env.CONTENT_OS.fetch(new Request("https://content-os.internal/api/internal/openclaw/verify", {
    method: "POST",
    headers: { Authorization: authorization }
  }));
  return response.status === 200;
}
__name(verifyOpenClaw2, "verifyOpenClaw");
var monetization_worker_v8_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/monetization/telegram/webhook") {
      return json8({ ok: false, error: "Direct Telegram webhook dinonaktifkan. Gunakan Telegram \u2192 OpenClaw \u2192 Monetization." }, 410);
    }
    if (request.method === "GET" && url.pathname === "/api/monetization/telegram/runtime") {
      if (!env.MONETIZATION_INGEST_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.MONETIZATION_INGEST_TOKEN}`) {
        return json8({ ok: false, error: "Unauthorized" }, 401);
      }
      return json8({
        ok: true,
        transport: "openclaw",
        singleBot: true,
        directWebhook: false,
        publishing: false,
        commands: TELEGRAM_COMMANDS.map((item) => item.command),
        externalBotRuntime: "pending-real-openclaw-telegram-runtime"
      });
    }
    if (request.method === "GET" && url.pathname === "/api/monetization/openclaw/telegram-manifest") {
      if (!await verifyOpenClaw2(request, env)) return json8({ ok: false, error: "Unauthorized" }, 401);
      return json8({
        ok: true,
        interface: "telegram",
        orchestrator: "openclaw",
        singleBot: true,
        publishing: false,
        commands: TELEGRAM_COMMANDS,
        routes: {
          report: "/api/monetization/openclaw/command",
          learning: "/api/monetization/openclaw/context"
        }
      });
    }
    return monetization_worker_v7_default.fetch(request, env);
  },
  scheduled: monetization_worker_v7_default.scheduled,
  queue: monetization_worker_v7_default.queue
};

// src/monetization-worker-v9.ts
var OBSERVED_ROUTES = /* @__PURE__ */ new Map([
  ["/api/monetization/openclaw/command", "command"],
  ["/api/monetization/openclaw/context", "learning_context"],
  ["/api/monetization/openclaw/telegram-manifest", "telegram_manifest"]
]);
var ALLOWED_COMMANDS = /* @__PURE__ */ new Set(["revenue", "profit", "offer", "offers", "content", "health", "learning", "learning-context"]);
var ALLOWED_INTERFACES = /* @__PURE__ */ new Set(["telegram", "agent", "web"]);
function json9(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}
__name(json9, "json");
function safeHeader(request, name, max = 160) {
  const value = request.headers.get(name)?.trim();
  if (!value) return null;
  return value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) || null;
}
__name(safeHeader, "safeHeader");
async function opaqueCorrelation(...candidates) {
  const source = candidates.find((value) => Boolean(value)) ?? crypto.randomUUID();
  const digest2 = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const hex = Array.from(new Uint8Array(digest2)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `oc-${hex.slice(0, 32)}`;
}
__name(opaqueCorrelation, "opaqueCorrelation");
async function safeCommand(request) {
  try {
    const body = await request.json();
    const raw = typeof body.query === "string" ? body.query.trim().toLowerCase() : "";
    return ALLOWED_COMMANDS.has(raw) ? raw : null;
  } catch {
    return null;
  }
}
__name(safeCommand, "safeCommand");
function parseMetadata(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
__name(parseMetadata, "parseMetadata");
async function parseUpstream(response) {
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}
__name(parseUpstream, "parseUpstream");
async function contentOsAutomationStatus(env) {
  try {
    const response = await env.CONTENT_OS.fetch(new Request("https://content-os.internal/api/automation/status"));
    return parseUpstream(response);
  } catch {
    return { status: 502, body: { ok: false, error: "Content OS automation status unavailable." } };
  }
}
__name(contentOsAutomationStatus, "contentOsAutomationStatus");
async function verifyOpenClaw3(request, env) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  try {
    const response = await env.CONTENT_OS.fetch(new Request("https://content-os.internal/api/internal/openclaw/verify", {
      method: "POST",
      headers: { Authorization: authorization }
    }));
    return response.status === 200;
  } catch {
    return false;
  }
}
__name(verifyOpenClaw3, "verifyOpenClaw");
async function recordOpenClawEvidence(request, env, operation, responseStatus) {
  const externalRunId = safeHeader(request, "X-OpenClaw-Run-Id");
  const suppliedCorrelation = safeHeader(request, "X-Correlation-Id");
  const rawInterface = safeHeader(request, "X-OpenClaw-Interface", 40)?.toLowerCase() ?? null;
  const interfaceName = rawInterface && ALLOWED_INTERFACES.has(rawInterface) ? rawInterface : null;
  const telegramUpdatePresent = Boolean(safeHeader(request, "X-Telegram-Update-Id", 80));
  const correlationId = await opaqueCorrelation(externalRunId, suppliedCorrelation);
  const command = operation === "command" ? await safeCommand(request) : null;
  const metadata = {
    evidenceVersion: "1.0",
    route: new URL(request.url).pathname,
    responseStatus,
    command,
    interface: interfaceName,
    externalRunIdPresent: Boolean(externalRunId),
    suppliedCorrelationPresent: Boolean(suppliedCorrelation),
    telegramUpdateIdPresent: telegramUpdatePresent,
    identifiersStoredAs: "sha256-prefix",
    piiStored: false,
    recordedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,error_code,error_message,correlation_id,metadata_json)
    VALUES ('openclaw',?1,'success',NULL,NULL,?2,?3)`).bind(operation, correlationId, JSON.stringify(metadata)).run();
}
__name(recordOpenClawEvidence, "recordOpenClawEvidence");
async function readOpenClawEvidence(request, env) {
  if (!env.MONETIZATION_INGEST_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.MONETIZATION_INGEST_TOKEN}`) {
    return json9({ ok: false, error: "Unauthorized" }, 401);
  }
  const [result, automation] = await Promise.all([
    env.DB.prepare(`SELECT operation,status,correlation_id,metadata_json,created_at
      FROM monetization_integration_logs
      WHERE provider='openclaw'
      ORDER BY id DESC
      LIMIT 50`).all(),
    contentOsAutomationStatus(env)
  ]);
  const evidence = (result.results ?? []).map((row) => ({
    operation: row.operation,
    status: row.status,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    metadata: parseMetadata(row.metadata_json)
  }));
  const realExternal = evidence.filter(
    (item) => item.metadata.externalRunIdPresent === true || item.metadata.interface === "telegram" || item.metadata.telegramUpdateIdPresent === true
  );
  return json9({
    ok: true,
    policy: {
      provider: "openclaw",
      readOnly: true,
      piiStored: false,
      identifiersStoredAs: "sha256-prefix",
      externalEvidenceRequires: "X-OpenClaw-Run-Id or Telegram interface evidence"
    },
    counts: { total: evidence.length, externalRuntime: realExternal.length },
    contentOsAutomation: { httpStatus: automation.status, ...automation.body },
    latest: evidence.slice(0, 20),
    latestExternal: realExternal.slice(0, 20)
  });
}
__name(readOpenClawEvidence, "readOpenClawEvidence");
async function openClawAutomationStatus(request, env) {
  if (!await verifyOpenClaw3(request, env)) return json9({ ok: false, error: "Unauthorized" }, 401);
  const upstream = await contentOsAutomationStatus(env);
  return json9({
    ok: upstream.status >= 200 && upstream.status < 300,
    source: "content-os-service-binding",
    automation: upstream.body
  }, upstream.status >= 200 && upstream.status < 300 ? 200 : 502);
}
__name(openClawAutomationStatus, "openClawAutomationStatus");
async function enrichManifest(response) {
  if (!response.ok) return response;
  const body = await response.clone().json().catch(() => null);
  if (!body) return response;
  const routes = body.routes && typeof body.routes === "object" && !Array.isArray(body.routes) ? body.routes : {};
  return json9({
    ...body,
    routes: {
      ...routes,
      automationStatus: "/api/monetization/openclaw/automation-status"
    },
    evidence: {
      optionalHeaders: {
        "X-OpenClaw-Run-Id": "opaque external runtime execution id; stored only as a hash prefix",
        "X-Correlation-Id": "opaque cross-service correlation id; stored only as a hash prefix",
        "X-OpenClaw-Interface": "telegram for Telegram-originated commands",
        "X-Telegram-Update-Id": "presence only; value and chat id are not stored"
      },
      piiStored: false,
      identifiersStoredAs: "sha256-prefix"
    }
  }, response.status);
}
__name(enrichManifest, "enrichManifest");
var monetization_worker_v9_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/monetization/openclaw/evidence") {
      return readOpenClawEvidence(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/monetization/openclaw/automation-status") {
      const observed = request.clone();
      const response2 = await openClawAutomationStatus(request, env);
      if (response2.ok) {
        ctx.waitUntil(recordOpenClawEvidence(observed, env, "automation_status", response2.status).catch(() => void 0));
      }
      return response2;
    }
    const operation = OBSERVED_ROUTES.get(url.pathname);
    const observedRequest = operation ? request.clone() : null;
    const response = await monetization_worker_v8_default.fetch(request, env);
    if (operation && observedRequest && response.status >= 200 && response.status < 300) {
      ctx.waitUntil(recordOpenClawEvidence(observedRequest, env, operation, response.status).catch(() => void 0));
    }
    if (url.pathname === "/api/monetization/openclaw/telegram-manifest") {
      return enrichManifest(response);
    }
    return response;
  },
  scheduled: monetization_worker_v8_default.scheduled,
  queue: monetization_worker_v8_default.queue
};

// src/monetization-worker-v10.ts
var MAX_BODY_BYTES = 16 * 1024;
var MAX_KEYWORDS = 12;
var MAX_KEYWORD_LENGTH = 80;
var ALLOWED_RESEARCH_PLATFORMS = /* @__PURE__ */ new Set(["threads", "instagram"]);
function json10(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}
__name(json10, "json");
function isRecord2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
__name(isRecord2, "isRecord");
function text2(value, max) {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}
__name(text2, "text");
function safeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text2(item, MAX_KEYWORD_LENGTH)).filter((item) => Boolean(item));
}
__name(safeStringArray, "safeStringArray");
function dedupeKeywords(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const value of values) {
    const normalized = value.toLocaleLowerCase("id-ID");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
    if (result.length >= MAX_KEYWORDS) break;
  }
  return result;
}
__name(dedupeKeywords, "dedupeKeywords");
async function readJson(request) {
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new Error("Payload riset terlalu besar.");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) throw new Error("Payload riset terlalu besar.");
  const parsed = JSON.parse(body);
  if (!isRecord2(parsed)) throw new Error("Payload riset tidak valid.");
  return parsed;
}
__name(readJson, "readJson");
async function verifyOpenClaw4(request, env) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  try {
    const response = await env.CONTENT_OS.fetch(new Request("https://content-os.internal/api/internal/openclaw/verify", {
      method: "POST",
      headers: { Authorization: authorization }
    }));
    return response.status === 200;
  } catch {
    return false;
  }
}
__name(verifyOpenClaw4, "verifyOpenClaw");
async function contentOsJson(env, path, init) {
  try {
    const response = await env.CONTENT_OS.fetch(new Request(`https://content-os.internal${path}`, init));
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  } catch {
    return { status: 502, body: { ok: false, error: "Content OS service binding unavailable." } };
  }
}
__name(contentOsJson, "contentOsJson");
function guidanceKeywords(contextBody) {
  if (!isRecord2(contextBody)) return [];
  const guidance = isRecord2(contextBody.guidance) ? contextBody.guidance : {};
  const researchGuidance = isRecord2(guidance.researchGuidance) ? guidance.researchGuidance : {};
  return dedupeKeywords([
    ...safeStringArray(researchGuidance.prioritize),
    ...safeStringArray(researchGuidance.commercialPatterns)
  ]);
}
__name(guidanceKeywords, "guidanceKeywords");
async function hashedCorrelation(request) {
  const raw = text2(request.headers.get("X-OpenClaw-Run-Id"), 160) ?? text2(request.headers.get("X-Correlation-Id"), 160) ?? crypto.randomUUID();
  const digest2 = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(digest2)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `oc-${hex.slice(0, 32)}`;
}
__name(hashedCorrelation, "hashedCorrelation");
async function recordResearchEvidence(request, env, status, appliedGuidance) {
  const metadata = {
    evidenceVersion: "1.0",
    route: "/api/monetization/openclaw/research",
    responseStatus: status,
    interface: text2(request.headers.get("X-OpenClaw-Interface"), 40)?.toLowerCase() ?? null,
    externalRunIdPresent: Boolean(request.headers.get("X-OpenClaw-Run-Id")),
    telegramUpdateIdPresent: Boolean(request.headers.get("X-Telegram-Update-Id")),
    revenueLearningApplied: appliedGuidance > 0,
    appliedGuidanceKeywordCount: appliedGuidance,
    identifiersStoredAs: "sha256-prefix",
    piiStored: false,
    publishing: false,
    recordedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,error_code,error_message,correlation_id,metadata_json)
    VALUES ('openclaw','research_trigger','success',NULL,NULL,?1,?2)`).bind(await hashedCorrelation(request), JSON.stringify(metadata)).run();
}
__name(recordResearchEvidence, "recordResearchEvidence");
async function researchManifest(request, env) {
  if (!await verifyOpenClaw4(request, env)) return json10({ ok: false, error: "Unauthorized" }, 401);
  return json10({
    ok: true,
    interface: "openclaw",
    workflow: "topic_research",
    mode: "read-only",
    publishing: false,
    revenueLearningEnrichment: true,
    allowedPlatforms: ["threads", "instagram"],
    request: {
      topic: "string 8-300 characters",
      keywords: "optional string[]; maximum 12 after enrichment",
      platform: "threads|instagram; default threads",
      lookbackDays: "integer 1-30; default 7",
      providerId: "optional Content OS connector id",
      useRevenueLearning: "boolean; default true"
    },
    endpoint: "/api/monetization/openclaw/research"
  });
}
__name(researchManifest, "researchManifest");
async function researchReadiness(request, env) {
  if (!env.MONETIZATION_INGEST_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.MONETIZATION_INGEST_TOKEN}`) {
    return json10({ ok: false, error: "Unauthorized" }, 401);
  }
  const [topicStatus, learning] = await Promise.all([
    contentOsJson(env, "/api/topic-research/status"),
    learningContext(env)
  ]);
  const learningBody = isRecord2(learning.body) ? learning.body : {};
  const keywords = guidanceKeywords(learningBody);
  return json10({
    ok: topicStatus.status === 200 && topicStatus.body.ok === true,
    bridge: "openclaw-to-content-os-service-binding",
    mode: "read-only",
    publishing: false,
    allowedPlatforms: ["threads", "instagram"],
    revenueLearning: {
      available: learning.status === 200,
      activeInsights: Array.isArray(learningBody.insights) ? learningBody.insights.length : 0,
      enrichmentKeywordCount: keywords.length
    },
    topicResearch: { httpStatus: topicStatus.status, ...topicStatus.body }
  }, topicStatus.status === 200 ? 200 : 502);
}
__name(researchReadiness, "researchReadiness");
async function triggerResearch(request, env, ctx) {
  if (!await verifyOpenClaw4(request, env)) return json10({ ok: false, error: "Unauthorized" }, 401);
  try {
    const input = await readJson(request.clone());
    const topic = text2(input.topic, 300);
    if (!topic || topic.length < 8) return json10({ ok: false, error: "Topik harus berisi 8-300 karakter." }, 400);
    const platform = (text2(input.platform, 20) ?? "threads").toLowerCase();
    if (!ALLOWED_RESEARCH_PLATFORMS.has(platform)) {
      return json10({ ok: false, error: "Platform riset OpenClaw hanya threads atau instagram." }, 400);
    }
    const lookbackDays = Number(input.lookbackDays ?? 7);
    if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 30) {
      return json10({ ok: false, error: "Periode riset harus 1-30 hari." }, 400);
    }
    const supplied = safeStringArray(input.keywords);
    if (Array.isArray(input.keywords) && supplied.length !== input.keywords.length) {
      return json10({ ok: false, error: "Keyword riset harus berupa teks." }, 400);
    }
    const useRevenueLearning = input.useRevenueLearning !== false;
    const learning = useRevenueLearning ? await learningContext(env) : { status: 200, body: { ok: true, insights: [], guidance: {} } };
    const enriched = useRevenueLearning ? guidanceKeywords(learning.body) : [];
    const keywords = dedupeKeywords([...supplied, ...enriched]);
    const providerId = text2(input.providerId, 100);
    const payload = { topic, platform, lookbackDays, keywords };
    if (providerId) payload.providerId = providerId;
    const upstream = await contentOsJson(env, "/api/topic-research/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (upstream.status >= 200 && upstream.status < 300) {
      ctx.waitUntil(recordResearchEvidence(request.clone(), env, upstream.status, enriched.length).catch(() => void 0));
    }
    return json10({
      ok: upstream.status >= 200 && upstream.status < 300,
      orchestrator: "openclaw",
      mode: "read-only",
      publishing: false,
      revenueLearningApplied: useRevenueLearning && enriched.length > 0,
      appliedGuidanceKeywordCount: useRevenueLearning ? enriched.length : 0,
      research: upstream.body
    }, upstream.status);
  } catch (error) {
    const message = error instanceof SyntaxError ? "Body harus berupa JSON valid." : error instanceof Error ? error.message : "Riset gagal diproses.";
    return json10({ ok: false, error: message }, 400);
  }
}
__name(triggerResearch, "triggerResearch");
async function enrichTelegramManifest(response) {
  if (!response.ok) return response;
  const body = await response.clone().json().catch(() => null);
  if (!body) return response;
  const routes = isRecord2(body.routes) ? body.routes : {};
  return json10({
    ...body,
    routes: {
      ...routes,
      research: "/api/monetization/openclaw/research",
      researchManifest: "/api/monetization/openclaw/research-manifest"
    }
  }, response.status);
}
__name(enrichTelegramManifest, "enrichTelegramManifest");
var monetization_worker_v10_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/monetization/openclaw/research-readiness") {
      return researchReadiness(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/monetization/openclaw/research-manifest") {
      return researchManifest(request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/monetization/openclaw/research") {
      return triggerResearch(request, env, ctx);
    }
    const response = await monetization_worker_v9_default.fetch(request, env, ctx);
    if (request.method === "GET" && url.pathname === "/api/monetization/openclaw/telegram-manifest") {
      return enrichTelegramManifest(response);
    }
    return response;
  },
  scheduled: monetization_worker_v9_default.scheduled,
  queue: monetization_worker_v9_default.queue
};

// src/monetization-worker-v11.ts
var MAX_BODY_BYTES2 = 16 * 1024;
var MAX_RETRY_ATTEMPTS = 4;
var ALLOWED_PLATFORMS = /* @__PURE__ */ new Set(["threads", "instagram"]);
var RETRYABLE_STATUSES = /* @__PURE__ */ new Set([429, 502, 503, 504]);
var JOB_ID_PATTERN = /^research-job-[0-9a-f-]{36}$/i;
function json11(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}
__name(json11, "json");
function isRecord3(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
__name(isRecord3, "isRecord");
function text3(value, max) {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}
__name(text3, "text");
function safeArray(value, maxItems = 12, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text3(item, maxLength)).filter((item) => Boolean(item)).slice(0, maxItems);
}
__name(safeArray, "safeArray");
function dedupe(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of values) {
    const key = item.toLocaleLowerCase("id-ID");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
__name(dedupe, "dedupe");
function parseMetadata2(value) {
  try {
    const parsed = JSON.parse(value);
    return isRecord3(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
__name(parseMetadata2, "parseMetadata");
async function verifyOpenClaw5(request, env) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  try {
    const response = await env.CONTENT_OS.fetch(new Request("https://content-os.internal/api/internal/openclaw/verify", {
      method: "POST",
      headers: { Authorization: authorization }
    }));
    return response.status === 200;
  } catch {
    return false;
  }
}
__name(verifyOpenClaw5, "verifyOpenClaw");
async function readBody(request) {
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES2) throw new Error("Payload riset terlalu besar.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES2) throw new Error("Payload riset terlalu besar.");
  const parsed = JSON.parse(raw);
  if (!isRecord3(parsed)) throw new Error("Payload riset tidak valid.");
  return parsed;
}
__name(readBody, "readBody");
function guidanceKeywords2(body) {
  if (!isRecord3(body)) return [];
  const guidance = isRecord3(body.guidance) ? body.guidance : {};
  const research = isRecord3(guidance.researchGuidance) ? guidance.researchGuidance : {};
  return dedupe([...safeArray(research.prioritize), ...safeArray(research.commercialPatterns)]).slice(0, 12);
}
__name(guidanceKeywords2, "guidanceKeywords");
async function sha256Prefix(value) {
  const digest2 = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest2)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 32);
}
__name(sha256Prefix, "sha256Prefix");
async function normalizeRetryPayload(input, env) {
  const topic = text3(input.topic, 300);
  if (!topic || topic.length < 8) throw new Error("Topik harus berisi 8-300 karakter.");
  const platform = (text3(input.platform, 20) ?? "threads").toLowerCase();
  if (!ALLOWED_PLATFORMS.has(platform)) throw new Error("Platform riset OpenClaw hanya threads atau instagram.");
  const lookbackDays = Number(input.lookbackDays ?? 7);
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 30) throw new Error("Periode riset harus 1-30 hari.");
  const supplied = safeArray(input.keywords);
  const useRevenueLearning = input.useRevenueLearning !== false;
  const learning = useRevenueLearning ? await learningContext(env) : { status: 200, body: {} };
  const enriched = useRevenueLearning && learning.status >= 200 && learning.status < 300 ? guidanceKeywords2(learning.body) : [];
  const candidates = dedupe([...supplied, ...enriched, topic]);
  const primary = candidates[0] ?? topic;
  const providerId = text3(input.providerId, 100) ?? void 0;
  return {
    payload: {
      topic,
      keywords: [primary],
      platform,
      lookbackDays,
      ...providerId ? { providerId } : {}
    },
    revenueLearningApplied: useRevenueLearning && enriched.length > 0,
    appliedGuidanceKeywordCount: useRevenueLearning ? enriched.length : 0,
    topicHash: await sha256Prefix(topic)
  };
}
__name(normalizeRetryPayload, "normalizeRetryPayload");
async function recordJobState(env, correlationId, status, state, metadata = {}, errorCode, errorMessage) {
  await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,error_code,error_message,correlation_id,metadata_json)
    VALUES ('repliz','research_retry',?1,?2,?3,?4,?5)`).bind(status, errorCode ?? null, errorMessage ?? null, correlationId, JSON.stringify({
    evidenceVersion: "1.0",
    state,
    asynchronous: true,
    readOnly: true,
    publishing: false,
    piiStored: false,
    ...metadata,
    recordedAt: (/* @__PURE__ */ new Date()).toISOString()
  })).run();
}
__name(recordJobState, "recordJobState");
async function latestJobState(env, correlationId) {
  const row = await env.DB.prepare(`SELECT status,error_code,error_message,metadata_json,created_at
    FROM monetization_integration_logs
    WHERE provider='repliz' AND operation='research_retry' AND correlation_id=?1
    ORDER BY id DESC LIMIT 1`).bind(correlationId).first();
  return row ? { row, metadata: parseMetadata2(row.metadata_json) } : null;
}
__name(latestJobState, "latestJobState");
function isLegacyQueueMessage(value) {
  if (!isRecord3(value)) return false;
  return (value.kind === "operational_probe" || value.kind === "integration_event") && Boolean(text3(value.correlationId, 180));
}
__name(isLegacyQueueMessage, "isLegacyQueueMessage");
function isResearchRetryMessage(value) {
  if (!isRecord3(value) || value.kind !== "openclaw_research_retry" || !isRecord3(value.payload)) return false;
  return Boolean(text3(value.correlationId, 180)) && Number.isInteger(value.attempt) && Number.isInteger(value.maxAttempts);
}
__name(isResearchRetryMessage, "isResearchRetryMessage");
async function enqueueTimeoutRetry(request, response, env) {
  if (!env.MONETIZATION_QUEUE) return response;
  try {
    const input = await readBody(request);
    const normalized = await normalizeRetryPayload(input, env);
    const correlationId = `research-job-${crypto.randomUUID()}`;
    const queuedAt = (/* @__PURE__ */ new Date()).toISOString();
    const message = {
      kind: "openclaw_research_retry",
      correlationId,
      attempt: 1,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      queuedAt,
      revenueLearningApplied: normalized.revenueLearningApplied,
      appliedGuidanceKeywordCount: normalized.appliedGuidanceKeywordCount,
      payload: normalized.payload
    };
    await recordJobState(env, correlationId, "warning", "queued", {
      attempt: 1,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      topicHash: normalized.topicHash,
      platform: normalized.payload.platform,
      lookbackDays: normalized.payload.lookbackDays,
      revenueLearningApplied: normalized.revenueLearningApplied,
      appliedGuidanceKeywordCount: normalized.appliedGuidanceKeywordCount
    });
    await env.MONETIZATION_QUEUE.send(message);
    const upstreamUnknown = await response.clone().json().catch(() => ({}));
    const upstream = isRecord3(upstreamUnknown) ? upstreamUnknown : {};
    const research = isRecord3(upstream.research) ? upstream.research : {};
    return json11({
      ok: true,
      accepted: true,
      queued: true,
      orchestrator: "openclaw",
      mode: "read-only",
      publishing: false,
      revenueLearningApplied: normalized.revenueLearningApplied,
      appliedGuidanceKeywordCount: normalized.appliedGuidanceKeywordCount,
      research: {
        ok: true,
        status: "waiting_provider",
        provider: "repliz",
        jobId: correlationId,
        pollPath: `/api/monetization/openclaw/research-jobs/${correlationId}`,
        previousAttempt: {
          requestId: text3(research.requestId, 80),
          runId: text3(research.runId, 80),
          error: text3(research.error, 240)
        }
      }
    }, 202);
  } catch (error) {
    console.error(JSON.stringify({ message: "research_retry_enqueue_failed", error: error instanceof Error ? error.message : "unknown" }));
    return response;
  }
}
__name(enqueueTimeoutRetry, "enqueueTimeoutRetry");
async function readResearchJob(request, env, jobId) {
  if (!await verifyOpenClaw5(request, env)) return json11({ ok: false, error: "Unauthorized" }, 401);
  if (!JOB_ID_PATTERN.test(jobId)) return json11({ ok: false, error: "Research job ID tidak valid." }, 400);
  const result = await env.DB.prepare(`SELECT status,error_code,error_message,metadata_json,created_at
    FROM monetization_integration_logs
    WHERE provider='repliz' AND operation='research_retry' AND correlation_id=?1
    ORDER BY id DESC LIMIT 20`).bind(jobId).all();
  if (!result.results.length) return json11({ ok: false, error: "Research job tidak ditemukan." }, 404);
  const history = result.results.map((row) => ({
    status: row.status,
    errorCode: row.error_code,
    error: row.error_message,
    createdAt: row.created_at,
    metadata: parseMetadata2(row.metadata_json)
  }));
  const latest = history[0];
  const state = typeof latest.metadata.state === "string" ? latest.metadata.state : "waiting_provider";
  let research = null;
  const contentOsRunId = text3(latest.metadata.contentOsRunId, 80);
  if (state === "ready" && contentOsRunId) {
    try {
      const response = await env.CONTENT_OS.fetch(new Request(`https://content-os.internal/api/topic-research/runs/${encodeURIComponent(contentOsRunId)}`));
      research = await response.json().catch(() => null);
    } catch {
      research = null;
    }
  }
  return json11({
    ok: true,
    job: {
      id: jobId,
      status: state,
      provider: "repliz",
      asynchronous: true,
      readOnly: true,
      publishing: false,
      attempt: latest.metadata.attempt ?? null,
      maxAttempts: latest.metadata.maxAttempts ?? MAX_RETRY_ATTEMPTS,
      error: latest.error,
      contentOsRunId: contentOsRunId ?? null,
      research
    },
    history
  });
}
__name(readResearchJob, "readResearchJob");
async function processResearchRetry(message, body, env) {
  const existing = await latestJobState(env, body.correlationId);
  const existingState = existing?.metadata.state;
  if (existingState === "ready" || existingState === "failed") {
    message.ack();
    return;
  }
  await recordJobState(env, body.correlationId, "warning", "processing", {
    attempt: body.attempt,
    maxAttempts: body.maxAttempts,
    platform: body.payload.platform,
    lookbackDays: body.payload.lookbackDays,
    revenueLearningApplied: body.revenueLearningApplied,
    appliedGuidanceKeywordCount: body.appliedGuidanceKeywordCount
  });
  let status = 502;
  let responseBody = { ok: false, error: "Content OS service binding unavailable." };
  try {
    const response = await env.CONTENT_OS.fetch(new Request("https://content-os.internal/api/topic-research/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body.payload)
    }));
    status = response.status;
    responseBody = await response.json().catch(() => ({ ok: false, error: "Respons Content OS tidak valid." }));
  } catch (error) {
    responseBody = { ok: false, error: error instanceof Error ? error.message : "Content OS service binding unavailable." };
  }
  if (status >= 200 && status < 300 && responseBody.ok === true) {
    const run = isRecord3(responseBody.run) ? responseBody.run : {};
    const contentOsRunId = text3(run.id, 80);
    try {
      await recordJobState(env, body.correlationId, "success", "ready", {
        attempt: body.attempt,
        maxAttempts: body.maxAttempts,
        responseStatus: status,
        contentOsRunId,
        revenueLearningApplied: body.revenueLearningApplied,
        appliedGuidanceKeywordCount: body.appliedGuidanceKeywordCount
      });
    } catch (error) {
      console.error(JSON.stringify({ message: "research_retry_completion_log_failed", jobId: body.correlationId, error: error instanceof Error ? error.message : "unknown" }));
    }
    message.ack();
    return;
  }
  const retryable = RETRYABLE_STATUSES.has(status);
  const errorMessage = text3(responseBody.error, 240) ?? `Research provider gagal dengan status ${status}.`;
  if (retryable && body.attempt < body.maxAttempts && env.MONETIZATION_QUEUE) {
    const next = { ...body, attempt: body.attempt + 1 };
    await recordJobState(env, body.correlationId, "warning", "waiting_provider", {
      attempt: body.attempt,
      nextAttempt: next.attempt,
      maxAttempts: body.maxAttempts,
      responseStatus: status,
      revenueLearningApplied: body.revenueLearningApplied,
      appliedGuidanceKeywordCount: body.appliedGuidanceKeywordCount
    }, `HTTP_${status}`, errorMessage);
    await env.MONETIZATION_QUEUE.send(next, { delaySeconds: Math.min(300, 30 * body.attempt) });
    message.ack();
    return;
  }
  await recordJobState(env, body.correlationId, "error", "failed", {
    attempt: body.attempt,
    maxAttempts: body.maxAttempts,
    responseStatus: status,
    exhausted: body.attempt >= body.maxAttempts,
    revenueLearningApplied: body.revenueLearningApplied,
    appliedGuidanceKeywordCount: body.appliedGuidanceKeywordCount
  }, `HTTP_${status}`, errorMessage);
  message.ack();
}
__name(processResearchRetry, "processResearchRetry");
async function processLegacyQueue(message, body, env) {
  await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,correlation_id,metadata_json)
    VALUES ('system',?1,'success',?2,?3)`).bind(body.kind === "operational_probe" ? "queue_probe" : "queue_integration_event", body.correlationId, JSON.stringify(body.metadata ?? {})).run();
  message.ack();
}
__name(processLegacyQueue, "processLegacyQueue");
var monetization_worker_v11_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const jobMatch = url.pathname.match(/^\/api\/monetization\/openclaw\/research-jobs\/(research-job-[0-9a-f-]{36})$/i);
    if (request.method === "GET" && jobMatch?.[1]) return readResearchJob(request, env, jobMatch[1]);
    if (request.method === "POST" && url.pathname === "/api/monetization/openclaw/research") {
      const retrySource = request.clone();
      const response = await monetization_worker_v10_default.fetch(request, env, ctx);
      if (response.status === 504) return enqueueTimeoutRetry(retrySource, response, env);
      return response;
    }
    return monetization_worker_v10_default.fetch(request, env, ctx);
  },
  scheduled: monetization_worker_v10_default.scheduled,
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        if (isResearchRetryMessage(message.body)) {
          await processResearchRetry(message, message.body, env);
          continue;
        }
        if (isLegacyQueueMessage(message.body)) {
          await processLegacyQueue(message, message.body, env);
          continue;
        }
        message.ack();
      } catch (error) {
        console.error(JSON.stringify({ message: "monetization_queue_processing_failed", error: error instanceof Error ? error.message : "unknown" }));
        message.retry();
      }
    }
  }
};

// src/monetization-external-acceptance.ts
var MAX_BODY_BYTES3 = 8 * 1024;
var IDENTIFIER_PATTERN = /^[A-Za-z0-9._:@/-]{1,160}$/;
var HASH_PATTERN = /^[A-Fa-f0-9]{32,128}$/;
var TELEGRAM_COMMANDS2 = /* @__PURE__ */ new Set(["/revenue", "/profit", "/offers", "/content", "/health", "/learning"]);
var STAGES = /* @__PURE__ */ new Set(["runtime", "telegram", "hermes"]);
function json12(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}
__name(json12, "json");
function isRecord4(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
__name(isRecord4, "isRecord");
function cleanText(value, max) {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}
__name(cleanText, "cleanText");
function identifier(value) {
  const candidate = cleanText(value, 160);
  return candidate && IDENTIFIER_PATTERN.test(candidate) ? candidate : null;
}
__name(identifier, "identifier");
function hexHash(value) {
  const candidate = cleanText(value, 128);
  return candidate && HASH_PATTERN.test(candidate) ? candidate.toLowerCase() : null;
}
__name(hexHash, "hexHash");
function parseMetadata3(value) {
  try {
    const parsed = JSON.parse(value);
    return isRecord4(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
__name(parseMetadata3, "parseMetadata");
async function readJson2(request) {
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES3) throw new Error("Payload evidence terlalu besar.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES3) throw new Error("Payload evidence terlalu besar.");
  const parsed = JSON.parse(raw);
  if (!isRecord4(parsed)) throw new Error("Payload evidence tidak valid.");
  return parsed;
}
__name(readJson2, "readJson");
async function verifyOpenClaw6(request, env) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  try {
    const response = await env.CONTENT_OS.fetch(new Request("https://content-os.internal/api/internal/openclaw/verify", {
      method: "POST",
      headers: { Authorization: authorization }
    }));
    return response.status === 200;
  } catch {
    return false;
  }
}
__name(verifyOpenClaw6, "verifyOpenClaw");
async function digest(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(digest, "digest");
async function acceptanceContract(request, env) {
  if (!await verifyOpenClaw6(request, env)) return json12({ ok: false, error: "Unauthorized" }, 401);
  return json12({
    ok: true,
    version: "1.0",
    mode: "evidence-only",
    publishing: false,
    piiStored: false,
    identifiersStoredAs: "sha256-prefix",
    stages: {
      runtime: { required: ["stage", "correlationId", "externalRunId"] },
      telegram: {
        required: ["stage", "correlationId", "externalRunId", "telegramCommand", "transportRunId", "deliveryStatus"],
        allowedCommands: [...TELEGRAM_COMMANDS2],
        deliveryStatus: "sent"
      },
      hermes: {
        required: ["stage", "correlationId", "externalRunId", "hermesRunId", "researchBriefHash", "resultHash", "resultAccepted"],
        hashAlgorithm: "SHA-256",
        resultAccepted: true
      }
    }
  });
}
__name(acceptanceContract, "acceptanceContract");
async function submitEvidence(request, env) {
  if (!await verifyOpenClaw6(request, env)) return json12({ ok: false, error: "Unauthorized" }, 401);
  let body;
  try {
    body = await readJson2(request);
  } catch (error) {
    const message = error instanceof SyntaxError ? "Body evidence harus berupa JSON valid." : error instanceof Error ? error.message : "Payload evidence tidak valid.";
    return json12({ ok: false, error: message }, 400);
  }
  const stageValue = cleanText(body.stage, 20)?.toLowerCase();
  if (!stageValue || !STAGES.has(stageValue)) return json12({ ok: false, error: "Stage harus runtime, telegram, atau hermes." }, 400);
  const correlationId = identifier(body.correlationId);
  const externalRunId = identifier(body.externalRunId);
  if (!correlationId || !externalRunId) return json12({ ok: false, error: "correlationId dan externalRunId tidak valid." }, 400);
  const metadata = {
    evidenceVersion: "1.0",
    stage: stageValue,
    externalRunIdHash: `sha256:${(await digest(externalRunId)).slice(0, 32)}`,
    interface: cleanText(request.headers.get("X-OpenClaw-Interface"), 40)?.toLowerCase() ?? null,
    identifiersStoredAs: "sha256-prefix",
    piiStored: false,
    publishing: false,
    recordedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (stageValue === "telegram") {
    const telegramCommand = cleanText(body.telegramCommand, 40)?.toLowerCase();
    const transportRunId = identifier(body.transportRunId);
    if (!telegramCommand || !TELEGRAM_COMMANDS2.has(telegramCommand) || !transportRunId || body.deliveryStatus !== "sent") {
      return json12({ ok: false, error: "Evidence Telegram harus memakai command yang diizinkan, transportRunId valid, dan deliveryStatus sent." }, 400);
    }
    metadata.telegramCommand = telegramCommand;
    metadata.transportRunIdHash = `sha256:${(await digest(transportRunId)).slice(0, 32)}`;
    metadata.deliveryStatus = "sent";
  }
  if (stageValue === "hermes") {
    const hermesRunId = identifier(body.hermesRunId);
    const researchBriefHash = hexHash(body.researchBriefHash);
    const resultHash = hexHash(body.resultHash);
    if (!hermesRunId || !researchBriefHash || !resultHash || body.resultAccepted !== true) {
      return json12({ ok: false, error: "Evidence Hermes membutuhkan hermesRunId, dua hash SHA-256/hex, dan resultAccepted true." }, 400);
    }
    metadata.hermesRunIdHash = `sha256:${(await digest(hermesRunId)).slice(0, 32)}`;
    metadata.researchBriefHash = researchBriefHash;
    metadata.resultHash = resultHash;
    metadata.resultAccepted = true;
  }
  const operation = `external_${stageValue}_acceptance`;
  const correlationHash = `oc-${(await digest(`${stageValue}:${correlationId}`)).slice(0, 32)}`;
  const inserted = await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,error_code,error_message,correlation_id,metadata_json)
    SELECT 'openclaw',?1,'success',NULL,NULL,?2,?3
    WHERE NOT EXISTS (
      SELECT 1 FROM monetization_integration_logs
      WHERE provider='openclaw' AND operation=?1 AND correlation_id=?2
    )`).bind(operation, correlationHash, JSON.stringify(metadata)).run();
  const evidenceRecorded = Number(inserted.meta.changes ?? 0) > 0;
  return json12({
    ok: true,
    stage: stageValue,
    evidenceRecorded,
    duplicate: !evidenceRecorded,
    correlationId: correlationHash,
    privacy: { piiStored: false, identifiersStoredAs: "sha256-prefix" }
  }, evidenceRecorded ? 201 : 200);
}
__name(submitEvidence, "submitEvidence");
async function acceptanceStatus(request, env) {
  if (!env.MONETIZATION_INGEST_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.MONETIZATION_INGEST_TOKEN}`) {
    return json12({ ok: false, error: "Unauthorized" }, 401);
  }
  const result = await env.DB.prepare(`SELECT operation,status,correlation_id,metadata_json,created_at
    FROM monetization_integration_logs
    WHERE provider='openclaw'
      AND operation IN ('external_runtime_acceptance','external_telegram_acceptance','external_hermes_acceptance')
      AND status='success'
    ORDER BY id DESC LIMIT 100`).all();
  const rows = result.results ?? [];
  const latest = {};
  const counts = { runtime: 0, telegram: 0, hermes: 0 };
  for (const row of rows) {
    const metadata = parseMetadata3(row.metadata_json);
    const stage = metadata.stage;
    if (stage !== "runtime" && stage !== "telegram" && stage !== "hermes") continue;
    counts[stage] += 1;
    if (!latest[stage]) {
      latest[stage] = {
        status: row.status,
        correlationId: row.correlation_id,
        createdAt: row.created_at,
        metadata
      };
    }
  }
  const gates = {
    runtime: Boolean(latest.runtime),
    telegram: Boolean(latest.telegram),
    hermes: Boolean(latest.hermes)
  };
  return json12({
    ok: true,
    gates,
    allExternalRuntimeGreen: gates.runtime && gates.telegram && gates.hermes,
    counts,
    latest,
    policy: { piiStored: false, identifiersStoredAs: "sha256-prefix", syntheticEvidenceNotAccepted: true }
  });
}
__name(acceptanceStatus, "acceptanceStatus");
async function handleExternalAcceptanceRoute(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/monetization/openclaw/acceptance/contract") {
    return acceptanceContract(request, env);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/openclaw/acceptance") {
    return submitEvidence(request, env);
  }
  if (request.method === "GET" && url.pathname === "/api/monetization/external-acceptance/status") {
    return acceptanceStatus(request, env);
  }
  return null;
}
__name(handleExternalAcceptanceRoute, "handleExternalAcceptanceRoute");

// src/monetization-worker-v12.ts
var monetization_worker_v12_default = {
  async fetch(request, env, ctx) {
    const acceptance = await handleExternalAcceptanceRoute(request, env);
    if (acceptance) return acceptance;
    return monetization_worker_v11_default.fetch(request, env, ctx);
  },
  scheduled: monetization_worker_v11_default.scheduled,
  queue: monetization_worker_v11_default.queue
};

// src/monetization-bounded-attribution.ts
var BRAND_ID6 = "brand-umkm-naik-kelas";
var WINDOW_MINUTES = 60;
function jsonString2(value) {
  return JSON.stringify(value ?? {});
}
__name(jsonString2, "jsonString");
async function existingAttribution(env, revenueEventId) {
  return env.DB.prepare("SELECT * FROM monetization_attributions WHERE revenue_event_id=?1 AND brand_id=?2").bind(revenueEventId, BRAND_ID6).first();
}
__name(existingAttribution, "existingAttribution");
async function matchingTouches(env, revenue) {
  const quality = await monetizationQualityEnabled(env);
  const qualityScope = verifiedQualityFilter(quality, "event", "e");
  const result = await env.DB.prepare(`SELECT
      e.id,e.event_type,e.content_item_id,e.campaign_id,e.offer_id,e.tracked_link_id,e.platform,
      e.visitor_id,e.session_id,e.occurred_at,
      l.content_item_id link_content_item_id,l.campaign_id link_campaign_id,l.offer_id link_offer_id
    FROM monetization_events e
    JOIN monetization_tracked_links l ON l.id=e.tracked_link_id
    WHERE e.brand_id=?1
      AND l.brand_id=?1
      AND l.status='active'
      AND e.event_type IN ('click','affiliate_click')
      AND e.tracked_link_id IS NOT NULL
      AND e.visitor_id IS NOT NULL
      AND e.session_id IS NOT NULL
      AND (?2 IS NULL OR e.campaign_id=?2)
      AND (?3 IS NULL OR e.offer_id=?3)
      AND (?4 IS NULL OR e.content_item_id=?4)
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
    ORDER BY datetime(e.occurred_at) DESC,e.id DESC
    LIMIT 50`).bind(
    BRAND_ID6,
    revenue.campaign_id ?? null,
    revenue.offer_id ?? null,
    revenue.content_item_id ?? null,
    revenue.created_at,
    `-${WINDOW_MINUTES} minutes`,
    revenue.id
  ).all();

  const rows = result.results ?? [];
  const unique = new Map();
  for (const row of rows) {
    const key = JSON.stringify([
      row.visitor_id ?? null,
      row.session_id ?? null,
      row.campaign_id ?? row.link_campaign_id ?? null,
      row.offer_id ?? row.link_offer_id ?? null,
      row.content_item_id ?? row.link_content_item_id ?? null,
      row.tracked_link_id ?? null
    ]);
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}
__name(matchingTouches, "matchingTouches");

async function recordEvidence(env, revenue, touch, candidateCount, status, extra = {}) {
  await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,error_code,error_message,correlation_id,metadata_json)
    VALUES ('lynk','bounded_attribution',?1,NULL,NULL,?2,?3)`).bind(
    status,
    revenue.transaction_id,
    jsonString2({
      evidenceVersion: "1.3",
      revenueEventId: revenue.id,
      touchEventId: touch?.id ?? null,
      trackedLinkId: touch?.tracked_link_id ?? null,
      candidateCount,
      windowMinutes: WINDOW_MINUTES,
      clockAnchor: "revenue_created_at_utc",
      providerOccurredAt: revenue.occurred_at,
      receiptCreatedAt: revenue.created_at,
      directMappingBefore: {
        contentItemId: revenue.content_item_id ?? null,
        campaignId: revenue.campaign_id ?? null,
        offerId: revenue.offer_id ?? null
      },
      ga4SessionEvidencePresent: Boolean(touch?.visitor_id && touch?.session_id),
      inference: "bounded_unique_tracked_session",
      touchReusePrevented: true,
      piiStored: false,
      ...extra,
      recordedAt: (/* @__PURE__ */ new Date()).toISOString()
    })
  ).run();
}
__name(recordEvidence, "recordEvidence");

async function upgradeBoundedLynkAttribution(revenueEventId, env) {
  const revenue = await env.DB.prepare(`SELECT id,source,transaction_id,content_item_id,campaign_id,offer_id,occurred_at,created_at
    FROM monetization_revenue_events
    WHERE id=?1 AND brand_id=?2`).bind(revenueEventId, BRAND_ID6).first();
  if (!revenue || revenue.source !== "lynk") return null;

  const touches = await matchingTouches(env, revenue);
  if (touches.length !== 1) {
    await recordEvidence(env, revenue, null, touches.length, "warning", {
      reason: touches.length === 0 ? "no_unique_tracked_session_candidate" : "ambiguous_tracked_session_candidates"
    });
    return existingAttribution(env, revenueEventId);
  }

  const touch = touches[0];
  const inferredContent = touch.content_item_id ?? touch.link_content_item_id ?? null;
  const inferredCampaign = touch.campaign_id ?? touch.link_campaign_id ?? null;
  const inferredOffer = touch.offer_id ?? touch.link_offer_id ?? null;

  if (!inferredCampaign || !inferredOffer || !touch.visitor_id || !touch.session_id) {
    await recordEvidence(env, revenue, touch, 1, "warning", { reason: "candidate_missing_required_dimensions_or_ga4_session" });
    return existingAttribution(env, revenueEventId);
  }

  const dimensionUpdate = await env.DB.prepare(`UPDATE monetization_revenue_events SET
      content_item_id=COALESCE(content_item_id,?2),
      campaign_id=COALESCE(campaign_id,?3),
      offer_id=COALESCE(offer_id,?4)
    WHERE id=?1 AND brand_id=?5
      AND (content_item_id IS NULL OR ?2 IS NULL OR content_item_id=?2)
      AND (campaign_id IS NULL OR campaign_id=?3)
      AND (offer_id IS NULL OR offer_id=?4)`).bind(
    revenueEventId,
    inferredContent,
    inferredCampaign,
    inferredOffer,
    BRAND_ID6
  ).run();

  if (Number(dimensionUpdate.meta.changes ?? 0) !== 1) {
    await recordEvidence(env, revenue, touch, 1, "warning", { reason: "revenue_dimension_conflict" });
    return existingAttribution(env, revenueEventId);
  }

  const metadata = {
    evidenceMode: "bounded_unique_tracked_session",
    evidenceVersion: "1.3",
    inference: true,
    exactVisitorMatch: false,
    providerWebhookVisitorMissing: true,
    ga4ClientSessionForwardedFromWebsite: true,
    windowMinutes: WINDOW_MINUTES,
    clockAnchor: "revenue_created_at_utc",
    providerOccurredAt: revenue.occurred_at,
    receiptCreatedAt: revenue.created_at,
    candidateCount: 1,
    touchReusePrevented: true,
    touchEventId: touch.id,
    trackedLinkId: touch.tracked_link_id,
    inferredDimensions: {
      contentItemId: inferredContent,
      campaignId: inferredCampaign,
      offerId: inferredOffer
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
    WHERE revenue_event_id=?1 AND brand_id=?10`).bind(
    revenueEventId,
    touch.visitor_id,
    touch.id,
    inferredContent,
    inferredCampaign,
    inferredOffer,
    touch.platform,
    "Satu tracked session unik dengan campaign/offer yang konsisten ditemukan dalam jendela 60 menit sebelum webhook pembayaran diterima. client_id dan session_id berasal dari sesi GA4 website; webhook Lynk sendiri tidak membawa identifier tersebut.",
    jsonString2(metadata),
    BRAND_ID6
  ).run();

  await recordEvidence(env, revenue, touch, 1, "success", {
    reason: "unique_tracked_session_attributed",
    inferredCampaignId: inferredCampaign,
    inferredOfferId: inferredOffer,
    inferredContentItemId: inferredContent
  });
  return existingAttribution(env, revenueEventId);
}
__name(upgradeBoundedLynkAttribution, "upgradeBoundedLynkAttribution");

// src/monetization-worker-v13.ts
function isRecord5(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
__name(isRecord5, "isRecord");
function json13(data, status, source) {
  const headers = new Headers(source?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}
__name(json13, "json");
function authorized4(request, env) {
  return Boolean(env.MONETIZATION_INGEST_TOKEN) && request.headers.get("Authorization") === `Bearer ${env.MONETIZATION_INGEST_TOKEN}`;
}
__name(authorized4, "authorized");
var monetization_worker_v13_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const reprocess = url.pathname.match(/^\/api\/monetization\/attribution\/reprocess\/([^/]+)$/);
    if (request.method === "POST" && reprocess?.[1]) {
      if (!authorized4(request, env)) return json13({ ok: false, error: "Unauthorized" }, 401);
      const revenueEventId2 = decodeURIComponent(reprocess[1]);
      try {
        const attribution = await upgradeBoundedLynkAttribution(revenueEventId2, env);
        if (!attribution) return json13({ ok: false, error: "Revenue Lynk tidak ditemukan atau tidak eligible." }, 404);
        return json13({ ok: true, revenueEventId: revenueEventId2, attribution }, 200);
      } catch (error) {
        console.error(JSON.stringify({
          message: "bounded_lynk_attribution_reprocess_failed",
          revenueEventId: revenueEventId2,
          error: error instanceof Error ? error.message : "unknown"
        }));
        return json13({ ok: false, error: "Attribution reprocess gagal." }, 500);
      }
    }
    const isLynkWebhook = request.method === "POST" && url.pathname === "/api/monetization/webhooks/lynk";
    const response = await monetization_worker_v12_default.fetch(request, env, ctx);
    if (!isLynkWebhook || !response.ok) return response;
    const parsed = await response.clone().json().catch(() => null);
    if (!isRecord5(parsed) || parsed.ok !== true || parsed.duplicate !== false) return response;
    const revenueEventId = typeof parsed.revenueEventId === "string" ? parsed.revenueEventId.trim() : "";
    if (!revenueEventId) return response;
    try {
      const attribution = await upgradeBoundedLynkAttribution(revenueEventId, env);
      if (!attribution) return response;
      return json13({ ...parsed, attribution }, response.status, response);
    } catch (error) {
      console.error(JSON.stringify({
        message: "bounded_lynk_attribution_failed",
        revenueEventId,
        error: error instanceof Error ? error.message : "unknown"
      }));
      return response;
    }
  },
  scheduled: monetization_worker_v12_default.scheduled,
  queue: monetization_worker_v12_default.queue
};

// src/monetization-worker-v14.ts
var MAX_PUBLIC_INSTALL_BODY_BYTES = 2048;
var APP_INSTANCE_PATTERN = /^[a-f0-9]{64}$/;
var APP_VERSION_PATTERN = /^[0-9A-Za-z._+\-]{1,40}$/;
var REQUIRED_CLIENT_HEADER = "panglima-umkm-android";
var ALLOWED_KEYS = /* @__PURE__ */ new Set(["appInstanceId", "appVersion"]);
function json14(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}
__name(json14, "json");
function isRecord6(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
__name(isRecord6, "isRecord");
async function publicPanglimaInstall(request, env) {
  const contentType = (request.headers.get("Content-Type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) return json14({ ok: false, error: "Content-Type harus application/json." }, 415);
  if (request.headers.get("X-Panglima-Client") !== REQUIRED_CLIENT_HEADER) {
    return json14({ ok: false, error: "Client telemetry tidak dikenali." }, 403);
  }
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_PUBLIC_INSTALL_BODY_BYTES) {
    return json14({ ok: false, error: "Payload terlalu besar." }, 413);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_PUBLIC_INSTALL_BODY_BYTES) {
    return json14({ ok: false, error: "Payload terlalu besar." }, 413);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json14({ ok: false, error: "Body JSON tidak valid." }, 400);
  }
  if (!isRecord6(parsed)) return json14({ ok: false, error: "Body JSON harus object." }, 400);
  if (Object.keys(parsed).some((key) => !ALLOWED_KEYS.has(key))) {
    return json14({ ok: false, error: "Field telemetry tidak diizinkan." }, 400);
  }
  const appInstanceId = typeof parsed.appInstanceId === "string" ? parsed.appInstanceId.trim().toLowerCase() : "";
  const appVersion = typeof parsed.appVersion === "string" ? parsed.appVersion.trim() : "";
  if (!APP_INSTANCE_PATTERN.test(appInstanceId)) {
    return json14({ ok: false, error: "appInstanceId pseudonymous tidak valid." }, 400);
  }
  if (!APP_VERSION_PATTERN.test(appVersion)) {
    return json14({ ok: false, error: "appVersion tidak valid." }, 400);
  }
  const safeRequest = new Request("https://monetization.internal/api/monetization/app/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType: "app_install",
      appInstanceId,
      appVersion,
      devicePlatform: "android",
      idempotencyKey: `panglima-install:${appInstanceId}:${appVersion}`,
      properties: {
        client: "panglima-umkm",
        telemetryVersion: "1.0",
        publicConstrained: true,
        financialFieldsAccepted: false,
        piiExpected: false
      }
    })
  });
  const result = await ingestAppEvent(safeRequest, env);
  const body = isRecord6(result.body) ? result.body : {};
  return json14({
    ok: body.ok === true,
    accepted: true,
    duplicate: body.duplicate === true,
    eventId: typeof body.eventId === "string" ? body.eventId : null,
    eventType: "app_install",
    privacy: { pseudonymous: true, piiStored: false },
    security: { financialFieldsAccepted: false, clientHeaderIsNotAuthentication: true }
  }, result.status);
}
__name(publicPanglimaInstall, "publicPanglimaInstall");
var monetization_worker_v14_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/monetization/app/install") {
      return publicPanglimaInstall(request, env);
    }
    return monetization_worker_v13_default.fetch(request, env, ctx);
  },
  scheduled: monetization_worker_v13_default.scheduled,
  queue: monetization_worker_v13_default.queue
};

// src/monetization-hardening-v15.ts
var BRAND_ID7 = "brand-umkm-naik-kelas";
var TOUCH_TYPES = /* @__PURE__ */ new Set(["impression", "click", "landing_view", "lead", "checkout", "affiliate_click"]);
var APP_RECEIPT_TTL_SECONDS = 24 * 60 * 60;
function isRecord7(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
__name(isRecord7, "isRecord");
var REVENUE_CAS_COLUMNS = [
  "id",
  "transaction_id",
  "event_type",
  "source",
  "brand_id",
  "content_item_id",
  "campaign_id",
  "offer_id",
  "gross_amount",
  "fee_amount",
  "cost_amount",
  "net_amount",
  "margin_amount",
  "currency",
  "status",
  "external_reference",
  "idempotency_key",
  "metadata_json",
  "occurred_at",
  "created_at"
];
function revenueCasGuard(records, source, transactionId, attributionEvidence, startIndex = 11) {
  let parameterIndex = startIndex;
  const values = [];
  const parameter = /* @__PURE__ */ __name((value) => {
    values.push(value ?? null);
    return `?${parameterIndex++}`;
  }, "parameter");
  const predicates = records.map((record) => {
    const fields = REVENUE_CAS_COLUMNS.map((column) => `${column} IS ${parameter(record[column])}`);
    return `EXISTS (SELECT 1 FROM monetization_revenue_events WHERE ${fields.join(" AND ")})`;
  });
  if (source && transactionId) {
    predicates.push(`(SELECT COUNT(*) FROM monetization_revenue_events
      WHERE brand_id=${parameter(BRAND_ID7)} AND source=${parameter(source)} AND transaction_id=${parameter(transactionId)})=${parameter(records.length)}`);
  }
  for (const evidence of attributionEvidence) {
    if (evidence.attributionId) {
      predicates.push(`EXISTS (SELECT 1 FROM monetization_attributions
        WHERE id=${parameter(evidence.attributionId)} AND brand_id=${parameter(BRAND_ID7)}
          AND revenue_event_id=${parameter(evidence.revenueEventId)}
          AND first_event_id IS ${parameter(evidence.firstEventId)} AND last_event_id IS ${parameter(evidence.lastEventId)})`);
    } else {
      predicates.push(`NOT EXISTS (SELECT 1 FROM monetization_attributions
        WHERE brand_id=${parameter(BRAND_ID7)} AND revenue_event_id=${parameter(evidence.revenueEventId)})`);
    }
    for (const quality of evidence.eventQuality) {
      predicates.push(`EXISTS (SELECT 1 FROM monetization_events e
        JOIN monetization_record_quality q ON q.record_type='event' AND q.record_id=e.id
        WHERE e.id=${parameter(quality.record_id)} AND e.brand_id=${parameter(BRAND_ID7)}
          AND q.data_class='production' AND q.verification_status='verified'
          AND q.evidence_ref IS ${parameter(quality.evidence_ref)} AND q.reason IS ${parameter(quality.reason)}
          AND q.metadata_json IS ${parameter(quality.metadata_json)} AND q.updated_at IS ${parameter(quality.updated_at)})`);
    }
  }
  return { sql: predicates.length ? predicates.join(" AND ") : "0=1", values };
}
__name(revenueCasGuard, "revenueCasGuard");
function cleanString(value, max = 180) {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}
__name(cleanString, "cleanString");
function secureEqual2(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
__name(secureEqual2, "secureEqual");
function secretDomainStatus(env) {
  const entries = [env.MONETIZATION_INGEST_TOKEN, env.MONETIZATION_QUALITY_TOKEN, env.APP_RECEIPT_SECRET, env.LYNK_WEBHOOK_SECRET];
  const allPresent = entries.every((value) => Boolean(value));
  const allDistinct = allPresent && entries.every((value, index) => entries.slice(index + 1).every((other) => !secureEqual2(value, other)));
  return {
    ingestTokenConfigured: Boolean(env.MONETIZATION_INGEST_TOKEN),
    qualityTokenIsolated: allDistinct,
    appReceiptSecretIsolated: allDistinct,
    lynkWebhookSecretIsolated: allDistinct,
    allSecretsPresentAndDistinct: allDistinct
  };
}
__name(secretDomainStatus, "secretDomainStatus");
function hardeningAuthorized(request, env) {
  const expected = env.MONETIZATION_INGEST_TOKEN;
  const supplied = request.headers.get("Authorization");
  return Boolean(expected && supplied && secureEqual2(supplied, `Bearer ${expected}`));
}
__name(hardeningAuthorized, "hardeningAuthorized");
function qualityAuthorized(request, env) {
  const expected = env.MONETIZATION_QUALITY_TOKEN;
  if (!expected || !secretDomainStatus(env).qualityTokenIsolated) return false;
  const supplied = request.headers.get("Authorization");
  return Boolean(supplied && secureEqual2(supplied, `Bearer ${expected}`));
}
__name(qualityAuthorized, "qualityAuthorized");
function appReceiptSecret(env) {
  const secret = env.APP_RECEIPT_SECRET;
  return secret && secretDomainStatus(env).appReceiptSecretIsolated ? secret : null;
}
__name(appReceiptSecret, "appReceiptSecret");
async function sha256(value) {
  const digest2 = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest2)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
__name(base64Url, "base64Url");
function decodeBase64Url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
__name(decodeBase64Url, "decodeBase64Url");
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
__name(hmac, "hmac");
async function issueAppInstallReceipt(appInstanceId, appVersion, eventId, env) {
  const secret = appReceiptSecret(env);
  if (!secret) return null;
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    v: 1,
    brandId: BRAND_ID7,
    appInstanceId,
    appVersion,
    eventId,
    exp: Math.floor(Date.now() / 1e3) + APP_RECEIPT_TTL_SECONDS
  })));
  return `v1.${payload}.${await hmac(`v1.${payload}`, secret)}`;
}
__name(issueAppInstallReceipt, "issueAppInstallReceipt");
async function verifyAppInstallReceipt(receipt, env) {
  const secret = appReceiptSecret(env);
  if (!secret) return null;
  const parts = receipt.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) return null;
  const expected = await hmac(`v1.${parts[1]}`, secret);
  if (!secureEqual2(parts[2], expected)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (!isRecord7(parsed) || parsed.v !== 1 || parsed.brandId !== BRAND_ID7 || typeof parsed.appInstanceId !== "string" || typeof parsed.appVersion !== "string" || typeof parsed.eventId !== "string") return null;
    if (typeof parsed.exp !== "number" || parsed.exp < Math.floor(Date.now() / 1e3)) return null;
    return parsed;
  } catch {
    return null;
  }
}
__name(verifyAppInstallReceipt, "verifyAppInstallReceipt");
async function bodyWithinLimit(request, maxBytes) {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) return false;
  return (await request.clone().arrayBuffer()).byteLength <= maxBytes;
}
__name(bodyWithinLimit, "bodyWithinLimit");
async function rateAllowed(request, env, limit) {
  try {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const salt = env.MONETIZATION_INGEST_TOKEN ?? "monetization-v15-rate-scope";
    const path = new URL(request.url).pathname;
    const fingerprint = (await sha256(`${salt}|${ip}`)).slice(0, 32);
    const scope = `${path}:${fingerprint}`;
    const windowStart = (/* @__PURE__ */ new Date()).toISOString().slice(0, 16) + ":00Z";
    const result = await env.DB.prepare(`INSERT INTO monetization_api_rate_limits(scope,window_start,count,expires_at)
      VALUES (?1,?2,1,datetime('now','+2 days'))
      ON CONFLICT(scope,window_start) DO UPDATE SET count=count+1,expires_at=datetime('now','+2 days')
      WHERE monetization_api_rate_limits.count < ?3`).bind(scope, windowStart, limit).run();
    return Number(result.meta.changes ?? 0) > 0;
  } catch (error) {
    console.error(JSON.stringify({ message: "v15_rate_guard_unavailable", error: error instanceof Error ? error.message : "unknown" }));
    return false;
  }
}
__name(rateAllowed, "rateAllowed");
async function recordTouchpoint(eventId, eventType, body, env) {
  if (!TOUCH_TYPES.has(eventType)) return;
  const visitorId = cleanString(body.visitorId, 180);
  if (!visitorId) return;
  const touchType = eventType === "affiliate_click" ? "click" : eventType;
  await env.DB.prepare(`INSERT INTO monetization_touchpoints
    (id,brand_id,visitor_id,session_id,content_item_id,campaign_id,offer_id,platform,touch_type,event_id,occurred_at,metadata_json)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,COALESCE(?11,CURRENT_TIMESTAMP),?12
    WHERE NOT EXISTS (SELECT 1 FROM monetization_touchpoints WHERE event_id=?10)`).bind(
    `tch-${eventId}`,
    BRAND_ID7,
    visitorId,
    cleanString(body.sessionId, 180),
    cleanString(body.contentItemId, 100),
    cleanString(body.campaignId, 100),
    cleanString(body.offerId, 100),
    cleanString(body.platform, 40),
    touchType,
    eventId,
    cleanString(body.occurredAt, 40),
    JSON.stringify({ source: "event_hook_v15", rawIdentifiersStored: false, piiExpected: false })
  ).run();
}
__name(recordTouchpoint, "recordTouchpoint");
async function recordLatestRedirectTouchpoint(slug, request, env) {
  const visitorId = cleanString(request.headers.get("X-Visitor-Id"), 180);
  if (!visitorId) return;
  const event = await env.DB.prepare(`SELECT e.id,e.event_type,e.session_id,e.content_item_id,e.campaign_id,e.offer_id,e.platform,e.occurred_at
    FROM monetization_events e JOIN monetization_tracked_links l ON l.id=e.tracked_link_id
    WHERE l.brand_id=?1 AND l.slug=?2 AND e.visitor_id=?3
    ORDER BY datetime(e.received_at) DESC,e.id DESC LIMIT 1`).bind(BRAND_ID7, slug, visitorId).first();
  if (!event) return;
  await recordTouchpoint(String(event.id), String(event.event_type), {
    visitorId,
    sessionId: event.session_id,
    contentItemId: event.content_item_id,
    campaignId: event.campaign_id,
    offerId: event.offer_id,
    platform: event.platform,
    occurredAt: event.occurred_at
  }, env);
}
__name(recordLatestRedirectTouchpoint, "recordLatestRedirectTouchpoint");
async function qualityReady(env) {
  return Boolean(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='monetization_record_quality'`).first());
}
__name(qualityReady, "qualityReady");
async function materializeDailyAnalytics(env, requestedDays = 35) {
  const days = Math.max(1, Math.min(400, Math.round(Number(requestedDays) || 35)));
  const since = `-${days} days`;
  const scoped = await qualityReady(env);
  const dataScope = scoped ? "verified-production" : "legacy-unclassified";
  const snapshotId = `ana-${crypto.randomUUID()}`;
  const eventScope = scoped ? `AND EXISTS (SELECT 1 FROM monetization_record_quality q WHERE q.record_type='event'
    AND q.record_id=e.id AND q.data_class='production' AND q.verification_status='verified')` : "";
  const revenueScope = verifiedQualityFilter(scoped, "revenue_event", "r");
  const revenueContent = scoped ? "r.content_item_id" : "COALESCE(a.last_content_item_id,a.first_content_item_id,r.content_item_id)";
  const revenueCampaign = scoped ? "r.campaign_id" : "COALESCE(a.last_campaign_id,a.first_campaign_id,r.campaign_id)";
  const revenueOffer = scoped ? "r.offer_id" : "COALESCE(a.last_offer_id,a.first_offer_id,r.offer_id)";
  const revenuePlatform = scoped ? "COALESCE(c.platform,'')" : "COALESCE(a.last_platform,a.first_platform,c.platform,'')";
  await env.DB.prepare(`INSERT INTO monetization_analytics_snapshots(id,brand_id,data_scope,period_days,status)
    VALUES (?1,?2,?3,?4,'preparing')`).bind(snapshotId, BRAND_ID7, dataScope, days).run();
  try {
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
        checkouts=excluded.checkouts,conversion_events=excluded.conversion_events`).bind(snapshotId, BRAND_ID7, since),
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
        confirmed_transactions=excluded.confirmed_transactions,reversals=excluded.reversals`).bind(snapshotId, BRAND_ID7, since)
    ]);
    const totals = await env.DB.prepare(`SELECT COUNT(*) rows,COALESCE(SUM(clicks),0) clicks,
    COALESCE(SUM(conversion_events),0) conversion_events,COALESCE(SUM(confirmed_transactions),0) confirmed_transactions,
    COALESCE(SUM(reversals),0) reversals,COALESCE(SUM(net_revenue),0) net_revenue,
    COALESCE(SUM(contribution_margin),0) contribution_margin
    FROM monetization_daily_analytics_v15 WHERE snapshot_id=?1`).bind(snapshotId).first();
    await env.DB.prepare(`UPDATE monetization_analytics_snapshots SET status='complete',completed_at=CURRENT_TIMESTAMP
      WHERE id=?1 AND status='preparing'`).bind(snapshotId).run();
    return { snapshotId, days, dataScope, statements: results.length, totals: totals ?? {} };
  } catch (error) {
    await env.DB.prepare(`UPDATE monetization_analytics_snapshots SET status='error',error_message=?2,completed_at=CURRENT_TIMESTAMP
      WHERE id=?1 AND status='preparing'`).bind(snapshotId, error instanceof Error ? error.message.slice(0, 500) : "unknown").run().catch(() => {
    });
    throw error;
  }
}
__name(materializeDailyAnalytics, "materializeDailyAnalytics");
async function dailyAnalytics(env, url) {
  const days = Math.max(1, Math.min(400, Math.round(Number(url.searchParams.get("days")) || 30)));
  const since = `-${days} days`;
  const quality = await qualityReady(env);
  const eventScope = quality ? `AND EXISTS (SELECT 1 FROM monetization_record_quality q WHERE q.record_type='event'
    AND q.record_id=e.id AND q.data_class='production' AND q.verification_status='verified')` : "";
  const revenueScope = verifiedQualityFilter(quality, "revenue_event", "r");
  const snapshot = await env.DB.prepare(`SELECT id,data_scope,period_days,completed_at FROM monetization_analytics_snapshots
    WHERE brand_id=?1 AND status='complete' AND period_days>=?2 AND (?3=0 OR data_scope='verified-production')
    ORDER BY datetime(completed_at) DESC,rowid DESC LIMIT 1`).bind(BRAND_ID7, days, quality ? 1 : 0).first();
  if (!snapshot?.id) return { days, snapshot: null, dataScope: null, rows: [], totals: {}, materializationRequired: true };
  const sourceWatermarkSql = quality ? `SELECT MAX(changed_at) source_changed_at FROM (
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
    )` : `SELECT MAX(changed_at) source_changed_at FROM (
      SELECT MAX(received_at) changed_at FROM monetization_events WHERE brand_id=?1
      UNION ALL SELECT MAX(created_at) changed_at FROM monetization_revenue_events WHERE brand_id=?1
    )`;
  const [rows, totals, watermarkResult, liveEventResult, liveRevenueResult] = await env.DB.batch([
    env.DB.prepare(`SELECT day,content_item_id,campaign_id,offer_id,platform,impressions,views,clicks,leads,checkouts,
      conversion_events,confirmed_transactions,reversals,gross_revenue,net_revenue,contribution_margin,created_at
      FROM monetization_daily_analytics_v15 WHERE snapshot_id=?1 AND day>=date('now',?2)
      ORDER BY day ASC,contribution_margin DESC LIMIT 5000`).bind(String(snapshot.id), since),
    env.DB.prepare(`SELECT COALESCE(SUM(impressions),0) impressions,COALESCE(SUM(views),0) views,
      COALESCE(SUM(clicks),0) clicks,COALESCE(SUM(leads),0) leads,COALESCE(SUM(checkouts),0) checkouts,
      COALESCE(SUM(conversion_events),0) conversion_events,COALESCE(SUM(confirmed_transactions),0) confirmed_transactions,
      COALESCE(SUM(reversals),0) reversals,COALESCE(SUM(gross_revenue),0) gross_revenue,
      COALESCE(SUM(net_revenue),0) net_revenue,COALESCE(SUM(contribution_margin),0) contribution_margin
      FROM monetization_daily_analytics_v15 WHERE snapshot_id=?1 AND day>=date('now',?2)`).bind(String(snapshot.id), since),
    env.DB.prepare(sourceWatermarkSql).bind(BRAND_ID7),
    env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN event_type='impression' THEN 1 ELSE 0 END),0) impressions,
      COALESCE(SUM(CASE WHEN event_type IN ('landing_view','app_open','tool_used') THEN 1 ELSE 0 END),0) views,
      COALESCE(SUM(CASE WHEN event_type IN ('click','affiliate_click') THEN 1 ELSE 0 END),0) clicks,
      COALESCE(SUM(CASE WHEN event_type IN ('lead','signup') THEN 1 ELSE 0 END),0) leads,
      COALESCE(SUM(CASE WHEN event_type='checkout' THEN 1 ELSE 0 END),0) checkouts,
      COALESCE(SUM(CASE WHEN event_type IN ('purchase','affiliate_conversion') THEN 1 ELSE 0 END),0) conversion_events
      FROM monetization_events e WHERE brand_id=?1 AND occurred_at>=datetime('now',?2) ${eventScope}`).bind(BRAND_ID7, since),
    env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN event_type IN ('sale','affiliate_commission','subscription','service_conversion') AND status='confirmed' THEN 1 ELSE 0 END),0) confirmed_transactions,
      COALESCE(SUM(CASE WHEN event_type IN ('refund','chargeback') OR status='refunded' THEN 1 ELSE 0 END),0) reversals,
      COALESCE(SUM(gross_amount),0) gross_revenue,COALESCE(SUM(net_amount),0) net_revenue,
      COALESCE(SUM(margin_amount),0) contribution_margin
      FROM monetization_revenue_events r WHERE brand_id=?1 AND occurred_at>=datetime('now',?2)
        AND status IN ('confirmed','refunded') ${revenueScope}`).bind(BRAND_ID7, since)
  ]);
  const normalizeTimestamp = /* @__PURE__ */ __name((value) => {
    if (typeof value !== "string" || !value.trim()) return 0;
    const normalized = /Z$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(" ", "T") + "Z";
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }, "normalizeTimestamp");
  const maxAgeSeconds = 900;
  const snapshotCompletedAt = String(snapshot.completed_at ?? "");
  const sourceChangedAt = String(watermarkResult?.results?.[0]?.source_changed_at ?? "");
  const snapshotMs = normalizeTimestamp(snapshotCompletedAt), sourceMs = normalizeTimestamp(sourceChangedAt);
  const ageSeconds = snapshotMs ? Math.max(0, Math.floor((Date.now() - snapshotMs) / 1e3)) : null;
  const snapshotTotals = totals?.results?.[0] ?? {};
  const liveTotals = { ...liveEventResult?.results?.[0] ?? {}, ...liveRevenueResult?.results?.[0] ?? {} };
  const metricKeys = [
    "impressions",
    "views",
    "clicks",
    "leads",
    "checkouts",
    "conversion_events",
    "confirmed_transactions",
    "reversals",
    "gross_revenue",
    "net_revenue",
    "contribution_margin"
  ];
  const sourceFingerprintMatches = metricKeys.every((key) => Number(snapshotTotals[key] ?? 0) === Number(liveTotals[key] ?? 0));
  const reasons = [];
  if (sourceMs > snapshotMs || !sourceFingerprintMatches) reasons.push("source_changed");
  if (ageSeconds === null || ageSeconds > maxAgeSeconds) reasons.push("max_age_exceeded");
  const stale = reasons.length > 0;
  return {
    days,
    snapshot: { id: snapshot.id, periodDays: snapshot.period_days, completedAt: snapshot.completed_at },
    dataScope: snapshot.data_scope,
    rows: rows?.results ?? [],
    totals: snapshotTotals,
    materializationRequired: stale,
    freshness: {
      stale,
      reasons,
      maxAgeSeconds,
      ageSeconds,
      sourceChangedAt: sourceChangedAt || null,
      sourceFingerprintMatches,
      automaticMaterializationEnabled: env.MONETIZATION_V15_MAINTENANCE_ENABLED === "true"
    }
  };
}
__name(dailyAnalytics, "dailyAnalytics");
async function retentionPreview(env) {
  const [events, touchpoints, revenue, logs, rateRows] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) rows FROM monetization_events WHERE brand_id=?1 AND occurred_at<datetime('now','-90 days')
      AND (visitor_id IS NOT NULL OR session_id IS NOT NULL OR external_event_id IS NOT NULL OR metadata_json<>'{}')`).bind(BRAND_ID7),
    env.DB.prepare(`SELECT COUNT(*) rows FROM monetization_touchpoints WHERE brand_id=?1 AND occurred_at<datetime('now','-90 days')`).bind(BRAND_ID7),
    env.DB.prepare(`SELECT COUNT(*) rows FROM monetization_revenue_events WHERE brand_id=?1 AND occurred_at<datetime('now','-90 days')
      AND metadata_json<>'{}'`).bind(BRAND_ID7),
    env.DB.prepare(`SELECT COUNT(*) rows FROM monetization_integration_logs WHERE created_at<datetime('now','-90 days') AND metadata_json<>'{}'`),
    env.DB.prepare(`SELECT COUNT(*) rows FROM monetization_api_rate_limits WHERE expires_at<datetime('now')`)
  ]);
  return {
    mode: "preview-only",
    retentionDays: 90,
    mutatedRows: 0,
    candidates: {
      events: events?.results[0]?.rows ?? 0,
      touchpoints: touchpoints?.results[0]?.rows ?? 0,
      revenueMetadata: revenue?.results[0]?.rows ?? 0,
      integrationMetadata: logs?.results[0]?.rows ?? 0,
      expiredRateWindows: rateRows?.results[0]?.rows ?? 0
    }
  };
}
__name(retentionPreview, "retentionPreview");
async function recordMaintenance(env, operation, status, correlationId, metadata, errorMessage) {
  await env.DB.prepare(`INSERT INTO monetization_integration_logs(provider,operation,status,error_message,correlation_id,metadata_json)
    VALUES ('system',?1,?2,?3,?4,?5)`).bind(operation, status, errorMessage ?? null, correlationId, JSON.stringify(metadata ?? {})).run();
}
__name(recordMaintenance, "recordMaintenance");
async function qualityReviewQueue(env, url) {
  const limit = Math.max(1, Math.min(100, Math.round(Number(url.searchParams.get("limit")) || 50)));
  const cursorAt = cleanString(url.searchParams.get("cursorAt"), 50);
  const cursorId = cleanString(url.searchParams.get("cursorId"), 100) ?? "";
  const [events, revenue, insights] = await env.DB.batch([
    env.DB.prepare(`SELECT e.id,e.event_type,e.source,e.platform,e.occurred_at,
      COALESCE(q.data_class,'unknown') data_class,COALESCE(q.verification_status,'unverified') verification_status,
      q.reason,COALESCE(q.updated_at,e.received_at) review_at
      FROM monetization_events e LEFT JOIN monetization_record_quality q ON q.record_type='event' AND q.record_id=e.id
      WHERE e.brand_id=?4 AND (q.record_id IS NULL OR q.data_class='unknown' OR q.verification_status='unverified')
      AND (?2 IS NULL OR datetime(COALESCE(q.updated_at,e.received_at))>datetime(?2)
        OR (datetime(COALESCE(q.updated_at,e.received_at))=datetime(?2) AND e.id>?3))
      ORDER BY datetime(COALESCE(q.updated_at,e.received_at)),e.id LIMIT ?1`).bind(limit, cursorAt, cursorId, BRAND_ID7),
    env.DB.prepare(`SELECT r.id,r.transaction_id,r.event_type,r.source,r.gross_amount,r.fee_amount,r.cost_amount,r.net_amount,
      r.margin_amount,r.currency,r.status,r.occurred_at,COALESCE(q.data_class,'unknown') data_class,
      COALESCE(q.verification_status,'unverified') verification_status,q.reason,COALESCE(q.updated_at,r.created_at) review_at
      FROM monetization_revenue_events r LEFT JOIN monetization_record_quality q ON q.record_type='revenue_event' AND q.record_id=r.id
      WHERE r.brand_id=?4 AND (q.record_id IS NULL OR q.data_class='unknown' OR q.verification_status='unverified')
      AND (?2 IS NULL OR datetime(COALESCE(q.updated_at,r.created_at))>datetime(?2)
        OR (datetime(COALESCE(q.updated_at,r.created_at))=datetime(?2) AND r.id>?3))
      ORDER BY datetime(COALESCE(q.updated_at,r.created_at)),r.id LIMIT ?1`).bind(limit, cursorAt, cursorId, BRAND_ID7),
    env.DB.prepare(`SELECT i.id,i.scope,i.statement,i.evidence_json,i.confidence,i.action_recommendation,i.created_at,COALESCE(q.data_class,'unknown') data_class,
      COALESCE(q.verification_status,'unverified') verification_status,q.reason,COALESCE(q.updated_at,i.created_at) review_at
      FROM monetization_learning_insights i LEFT JOIN monetization_record_quality q ON q.record_type='learning_insight' AND q.record_id=i.id
      WHERE i.brand_id=?4 AND (q.record_id IS NULL OR q.data_class='unknown' OR q.verification_status='unverified')
      AND (?2 IS NULL OR datetime(COALESCE(q.updated_at,i.created_at))>datetime(?2)
        OR (datetime(COALESCE(q.updated_at,i.created_at))=datetime(?2) AND i.id>?3))
      ORDER BY datetime(COALESCE(q.updated_at,i.created_at)),i.id LIMIT ?1`).bind(limit, cursorAt, cursorId, BRAND_ID7)
  ]);
  const eventRows = events?.results ?? [], revenueRows = revenue?.results ?? [], insightRows = insights?.results ?? [];
  const next = /* @__PURE__ */ __name((rows) => rows.length === limit ? { cursorAt: rows.at(-1)?.review_at ?? null, cursorId: rows.at(-1)?.id ?? null } : null, "next");
  return {
    dataScope: "unclassified-review-queue",
    limit,
    events: eventRows,
    revenueEvents: revenueRows,
    learningInsights: insightRows,
    next: { events: next(eventRows), revenueEvents: next(revenueRows), learningInsights: next(insightRows) },
    rawMetadataIncluded: false
  };
}
__name(qualityReviewQueue, "qualityReviewQueue");
async function upsertRecordQuality(request, env, recordType, recordId) {
  if (!["event", "revenue_event", "learning_insight"].includes(recordType)) throw new Error("recordType tidak valid.");
  const body = await request.json();
  if (!isRecord7(body)) throw new Error("Body JSON harus object.");
  const dataClass = cleanString(body.dataClass, 30) ?? "unknown";
  const verification = cleanString(body.verificationStatus, 30) ?? "unverified";
  if (!["production", "acceptance", "synthetic", "internal_test", "unknown"].includes(dataClass)) throw new Error("dataClass tidak valid.");
  if (!["verified", "unverified"].includes(verification)) throw new Error("verificationStatus tidak valid.");
  const amountBasis = cleanString(body.amountBasis, 30), evidenceRef = cleanString(body.evidenceRef, 300), reason = cleanString(body.reason, 1e3);
  if (amountBasis && !["provider_reported", "system_derived", "manual", "unknown"].includes(amountBasis)) throw new Error("amountBasis tidak valid.");
  if (verification === "verified" && (!evidenceRef || !reason)) throw new Error("evidenceRef dan reason wajib untuk record terverifikasi.");
  const table = recordType === "event" ? "monetization_events" : recordType === "revenue_event" ? "monetization_revenue_events" : "monetization_learning_insights";
  const record = await env.DB.prepare(`SELECT * FROM ${table} WHERE id=?1 AND brand_id=?2`).bind(recordId, BRAND_ID7).first();
  if (!record) throw new Error("Record tidak ditemukan.");
  const allowedFinancial = ["actual", "estimated", "not_applicable", "unknown"];
  const feeStatus = cleanString(body.feeStatus, 30);
  const costStatus = cleanString(body.costStatus, 30);
  if (feeStatus && !allowedFinancial.includes(feeStatus)) throw new Error("feeStatus tidak valid.");
  if (costStatus && !allowedFinancial.includes(costStatus)) throw new Error("costStatus tidak valid.");
  let projectionIds = [recordId];
  let writeGuardSql = `EXISTS (SELECT 1 FROM ${table} WHERE id=?11 AND brand_id=?12)`;
  let writeGuardValues = [recordId, BRAND_ID7];
  if (recordType === "revenue_event" && dataClass === "production" && verification === "verified") {
    let revenueRecords = [record];
    const attributionEvidence = [];
    const transactionId = cleanString(record.transaction_id, 180), source = cleanString(record.source, 80);
    if (transactionId && source) {
      const group = await env.DB.prepare(`SELECT * FROM monetization_revenue_events
        WHERE brand_id=?1 AND source=?2 AND transaction_id=?3 ORDER BY datetime(created_at),id`).bind(BRAND_ID7, source, transactionId).all();
      revenueRecords = group.results ?? [];
      if (!revenueRecords.some((item) => String(item.id) === recordId)) throw new Error("Quality update conflict; lifecycle berubah. Muat ulang review queue lalu ulangi.");
      projectionIds = revenueRecords.map((item) => String(item.id));
    }
    let originals = 0;
    const sums = { gross: 0, fee: 0, cost: 0, net: 0 };
    let groupDimensions = null;
    for (const revenue of revenueRecords) {
      const gross = Number(revenue.gross_amount), fee = Number(revenue.fee_amount), cost = Number(revenue.cost_amount);
      const net = Number(revenue.net_amount), margin = Number(revenue.margin_amount);
      const amounts = [gross, fee, cost, net, margin];
      if (amounts.some((value) => !Number.isSafeInteger(value))) throw new Error("Revenue lama gagal validasi safe integer.");
      if (net !== gross - fee || margin !== net - cost) throw new Error("Revenue lama gagal validasi gross/net/margin.");
      const eventType = String(revenue.event_type ?? ""), status = String(revenue.status ?? "");
      if (String(revenue.currency ?? "").toUpperCase() !== "IDR") throw new Error("Revenue non-IDR tidak dapat dipromosikan pada Monetization v1.");
      const reversal = eventType === "refund" || eventType === "chargeback";
      if (reversal && (status !== "refunded" || [gross, fee, cost, net].some((value) => value > 0))) throw new Error("Revenue reversal lama memiliki status atau tanda amount yang tidak valid.");
      if (!reversal) {
        originals += 1;
        if (status === "refunded" || gross < 0 || fee < 0 || cost < 0 || net < 0) throw new Error("Revenue non-reversal lama memiliki status atau tanda amount yang tidak valid.");
      }
      sums.gross += gross;
      sums.fee += fee;
      sums.cost += cost;
      sums.net += net;
      const dimensions = JSON.stringify([revenue.currency ?? null, revenue.content_item_id ?? null, revenue.campaign_id ?? null, revenue.offer_id ?? null]);
      groupDimensions ??= dimensions;
      if (dimensions !== groupDimensions) throw new Error("Lifecycle revenue memiliki currency atau dimensi atribusi langsung yang tidak konsisten.");
      const attribution = await env.DB.prepare(`SELECT id,first_event_id,last_event_id FROM monetization_attributions
        WHERE revenue_event_id=?1 AND brand_id=?2`).bind(String(revenue.id), BRAND_ID7).first();
      const eventIds = [attribution?.first_event_id, attribution?.last_event_id].filter((value, index, all) => typeof value === "string" && all.indexOf(value) === index);
      const eventQuality = [];
      for (const eventId of eventIds) {
        const trusted = await env.DB.prepare(`SELECT q.* FROM monetization_events e
          JOIN monetization_record_quality q ON q.record_type='event' AND q.record_id=e.id
          WHERE e.id=?1 AND e.brand_id=?2 AND q.data_class='production' AND q.verification_status='verified'`).bind(eventId, BRAND_ID7).first();
        if (!trusted) throw new Error("Attribution touchpoint wajib production+verified sebelum revenue dipromosikan.");
        if (!cleanString(trusted.evidence_ref, 300) || !cleanString(trusted.reason, 1e3)) {
          throw new Error("Attribution touchpoint terverifikasi wajib memiliki evidenceRef dan reason.");
        }
        eventQuality.push(trusted);
      }
      attributionEvidence.push({
        revenueEventId: String(revenue.id),
        attributionId: cleanString(attribution?.id, 180),
        firstEventId: cleanString(attribution?.first_event_id, 180),
        lastEventId: cleanString(attribution?.last_event_id, 180),
        eventQuality
      });
    }
    if (originals !== 1) throw new Error("Lifecycle revenue harus memiliki tepat satu transaksi asal.");
    if ([sums.gross, sums.fee, sums.cost, sums.net].some((value) => value < 0)) throw new Error("Lifecycle revenue melebihi nilai transaksi asal.");
    const guard = revenueCasGuard(revenueRecords, source, transactionId, attributionEvidence);
    writeGuardSql = guard.sql;
    writeGuardValues = guard.values;
  }
  const correlationId = cleanString(request.headers.get("X-Correlation-Id"), 160) ?? `quality-${crypto.randomUUID()}`;
  const actorPrincipal = env.MONETIZATION_QUALITY_TOKEN ? (await sha256(env.MONETIZATION_QUALITY_TOKEN)).slice(0, 24) : "unavailable";
  const statements = [];
  for (const projectionId of projectionIds) {
    const newMetadata = JSON.stringify(isRecord7(body.metadata) ? body.metadata : {});
    statements.push(env.DB.prepare(`INSERT INTO monetization_record_quality_history
      (id,record_type,record_id,previous_data_class,previous_verification_status,previous_evidence_ref,previous_reason,previous_metadata_json,
       new_data_class,new_verification_status,evidence_ref,reason,new_metadata_json,actor_type,correlation_id,metadata_json)
      SELECT ?1,?2,?3,q.data_class,q.verification_status,q.evidence_ref,q.reason,q.metadata_json,
        ?4,?5,?6,?7,?8,'quality_token_operator',?9,?10
      FROM (SELECT 1) seed LEFT JOIN monetization_record_quality q ON q.record_type=?2 AND q.record_id=?3
      WHERE ${writeGuardSql}`).bind(
      `qhist-${crypto.randomUUID()}`,
      recordType,
      projectionId,
      dataClass,
      verification,
      evidenceRef,
      reason,
      newMetadata,
      correlationId,
      JSON.stringify({ source: "quality_api", actorPrincipal, lifecycleProjectionSize: projectionIds.length }),
      ...writeGuardValues
    ));
    statements.push(env.DB.prepare(`INSERT INTO monetization_record_quality
      (record_type,record_id,data_class,verification_status,amount_basis,fee_status,cost_status,evidence_ref,reason,metadata_json)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10 WHERE ${writeGuardSql}
      ON CONFLICT(record_type,record_id) DO UPDATE SET data_class=excluded.data_class,
        verification_status=excluded.verification_status,amount_basis=excluded.amount_basis,fee_status=excluded.fee_status,
        cost_status=excluded.cost_status,evidence_ref=excluded.evidence_ref,reason=excluded.reason,
        metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(
      recordType,
      projectionId,
      dataClass,
      verification,
      amountBasis,
      feeStatus,
      costStatus,
      evidenceRef,
      reason,
      newMetadata,
      ...writeGuardValues
    ));
  }
  const results = await env.DB.batch(statements);
  if (results.filter((_result, index) => index % 2 === 1).some((result) => Number(result?.meta.changes ?? 0) !== 1)) {
    throw new Error("Quality update conflict; lifecycle berubah. Muat ulang review queue lalu ulangi.");
  }
  return await env.DB.prepare(`SELECT * FROM monetization_record_quality WHERE record_type=?1 AND record_id=?2`).bind(recordType, recordId).first() ?? {};
}
__name(upsertRecordQuality, "upsertRecordQuality");

// src/monetization-worker-v15.ts
var VERSION = "1.3.0-ga4-bounded-session-attribution";
var DASHBOARD_URL = "https://umkm-content-os.ruang-belajar-mandiri01.workers.dev/monetization";
var APP_INSTANCE_PATTERN2 = /^[a-f0-9]{64}$/;
var APP_VERSION_PATTERN2 = /^[0-9A-Za-z._+\-]{1,40}$/;
var APP_CLIENT_HEADER = "panglima-umkm-android";
function isRecord8(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
__name(isRecord8, "isRecord");
function json15(data, status = 200, source, extra) {
  const headers = new Headers(source?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.delete("Content-Length");
  new Headers(extra).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(data), { status, headers });
}
__name(json15, "json");

function ga4ClientId(value) {
  const candidate = cleanString(value, 220);
  if (!candidate) return null;
  return /^\d+\.\d+$/.test(candidate) ? candidate : null;
}
__name(ga4ClientId, "ga4ClientId");

function ga4SessionId(value) {
  const candidate = cleanString(value, 180);
  if (!candidate || !/^\d+$/.test(candidate)) return null;
  return Number(candidate) > 0 ? candidate : null;
}
__name(ga4SessionId, "ga4SessionId");

function withGa4ContextOnTrackedRequest(request, url) {
  const clientId = ga4ClientId(url.searchParams.get("ga_cid"));
  const sessionId = ga4SessionId(url.searchParams.get("ga_sid"));
  if (!clientId || !sessionId) return request;
  const headers = new Headers(request.headers);
  headers.set("X-Visitor-Id", clientId);
  headers.set("X-Session-Id", sessionId);
  return new Request(request, { headers });
}
__name(withGa4ContextOnTrackedRequest, "withGa4ContextOnTrackedRequest");

function ga4LynkPurchase(rawPayload) {
  if (!isRecord8(rawPayload)) return { skipped: true, reason: "payload_invalid" };
  const data = isRecord8(rawPayload.data) ? rawPayload.data : {};
  const messageDataRaw = data.message_data ?? data.messageData;
  const messageData = isRecord8(messageDataRaw) ? messageDataRaw : {};
  const eventName = String(rawPayload.event ?? "").trim().toLowerCase();
  const action = String(data.message_action ?? data.messageAction ?? "").trim().toUpperCase();

  if (eventName !== "payment.received" || action !== "SUCCESS") {
    return { skipped: true, reason: "not_successful_payment_received" };
  }

  const transactionId = cleanString(messageData.refId ?? messageData.ref_id, 180);
  if (!transactionId) return { skipped: true, reason: "transaction_id_missing" };

  const rawItems = Array.isArray(messageData.items) ? messageData.items.filter(isRecord8).slice(0, 50) : [];
  if (!rawItems.length) return { skipped: true, reason: "items_missing" };

  if (rawItems.some((item) => String(item.title ?? "").trim().toLowerCase() === "testing only")) {
    return { skipped: true, reason: "testing_only_excluded", transactionId };
  }

  const items = [];
  for (const item of rawItems) {
    const price = Number(item.price);
    const quantity = Number(item.qty ?? 1);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) {
      return { skipped: true, reason: "item_amount_invalid", transactionId };
    }
    const itemId = cleanString(item.uuid ?? item.id ?? item.pafId ?? item.title, 100);
    const itemName = cleanString(item.title, 100);
    if (!itemId && !itemName) return { skipped: true, reason: "item_identity_missing", transactionId };
    items.push({
      ...(itemId ? { item_id: itemId } : {}),
      ...(itemName ? { item_name: itemName } : {}),
      affiliation: "Lynk",
      price,
      quantity
    });
  }

  const value = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const totals = isRecord8(messageData.totals) ? messageData.totals : {};
  const shippingRaw = Number(totals.totalShipping ?? totals.total_shipping ?? 0);
  const shipping = Number.isFinite(shippingRaw) && shippingRaw >= 0 ? shippingRaw : 0;

  return {
    skipped: false,
    transactionId,
    currency: "IDR",
    value,
    shipping,
    items
  };
}
__name(ga4LynkPurchase, "ga4LynkPurchase");

async function ga4AttributionContext(env, downstream) {
  const attribution = isRecord8(downstream?.attribution) ? downstream.attribution : {};
  const eventId = cleanString(attribution.last_event_id ?? attribution.first_event_id, 180);
  let eventRow = null;

  if (eventId) {
    eventRow = await env.DB.prepare(`SELECT id,visitor_id,session_id,occurred_at
      FROM monetization_events
      WHERE id=?1 AND brand_id='brand-umkm-naik-kelas'
      LIMIT 1`).bind(eventId).first();
  }

  const clientId = ga4ClientId(eventRow?.visitor_id ?? attribution.visitor_id);
  const sessionId = ga4SessionId(eventRow?.session_id);

  return {
    clientId,
    sessionId,
    touchEventId: eventId,
    attributionStatus: cleanString(attribution.attribution_status, 40),
    attributionModel: cleanString(attribution.model, 40)
  };
}
__name(ga4AttributionContext, "ga4AttributionContext");

async function recordGa4PurchaseIntegration(env, status, transactionId, metadata, errorMessage) {
  try {
    await env.DB.prepare(`INSERT INTO monetization_integration_logs
      (provider,operation,status,error_message,correlation_id,metadata_json)
      VALUES ('ga4','purchase_send',?1,?2,?3,?4)`)
      .bind(
        status,
        errorMessage ?? null,
        transactionId ?? null,
        JSON.stringify({
          piiStored: false,
          ...metadata,
          recordedAt: new Date().toISOString()
        })
      ).run();
  } catch (error) {
    console.error(JSON.stringify({
      message: "ga4_purchase_log_failed",
      error: error instanceof Error ? error.message : "unknown"
    }));
  }
}
__name(recordGa4PurchaseIntegration, "recordGa4PurchaseIntegration");

async function sendGa4PurchaseProduction(env, rawPayload, downstream) {
  const purchase = ga4LynkPurchase(rawPayload);
  if (purchase.skipped) return purchase;

  if (downstream?.duplicate !== false) {
    return { skipped: true, reason: "duplicate_or_existing", transactionId: purchase.transactionId };
  }

  if (env.GA4_PURCHASE_ENABLED !== "true") {
    await recordGa4PurchaseIntegration(env, "warning", purchase.transactionId, {
      reason: "ga4_purchase_disabled",
      revenueEventId: cleanString(downstream?.revenueEventId, 180),
      value: purchase.value,
      shipping: purchase.shipping,
      itemCount: purchase.items.length
    });
    return { skipped: true, reason: "ga4_purchase_disabled", transactionId: purchase.transactionId };
  }

  if (!env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) {
    await recordGa4PurchaseIntegration(env, "error", purchase.transactionId, {
      reason: "ga4_config_missing",
      revenueEventId: cleanString(downstream?.revenueEventId, 180)
    }, "GA4_MEASUREMENT_ID atau GA4_API_SECRET belum tersedia.");
    return { skipped: true, reason: "ga4_config_missing", transactionId: purchase.transactionId };
  }

  const context = await ga4AttributionContext(env, downstream);
  if (!context.clientId || !context.sessionId) {
    await recordGa4PurchaseIntegration(env, "warning", purchase.transactionId, {
      reason: "ga4_session_context_missing",
      revenueEventId: cleanString(downstream?.revenueEventId, 180),
      attributionStatus: context.attributionStatus,
      touchEventIdPresent: Boolean(context.touchEventId),
      clientIdPresent: Boolean(context.clientId),
      sessionIdPresent: Boolean(context.sessionId),
      value: purchase.value,
      shipping: purchase.shipping,
      itemCount: purchase.items.length
    });
    return { skipped: true, reason: "ga4_session_context_missing", transactionId: purchase.transactionId };
  }

  const endpoint = "https://www.google-analytics.com/mp/collect"
    + `?measurement_id=${encodeURIComponent(env.GA4_MEASUREMENT_ID)}`
    + `&api_secret=${encodeURIComponent(env.GA4_API_SECRET)}`;

  const payload = {
    client_id: context.clientId,
    events: [{
      name: "purchase",
      params: {
        transaction_id: purchase.transactionId,
        currency: purchase.currency,
        value: purchase.value,
        shipping: purchase.shipping,
        session_id: context.sessionId,
        items: purchase.items
      }
    }]
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    await recordGa4PurchaseIntegration(
      env,
      response.ok ? "success" : "error",
      purchase.transactionId,
      {
        httpStatus: response.status,
        revenueEventId: cleanString(downstream?.revenueEventId, 180),
        attributionStatus: context.attributionStatus,
        attributionModel: context.attributionModel,
        sessionLinked: true,
        value: purchase.value,
        shipping: purchase.shipping,
        itemCount: purchase.items.length
      },
      response.ok ? null : `GA4 Measurement Protocol HTTP ${response.status}`
    );

    return {
      skipped: false,
      ok: response.ok,
      httpStatus: response.status,
      transactionId: purchase.transactionId
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ga4_purchase_request_failed";
    await recordGa4PurchaseIntegration(env, "error", purchase.transactionId, {
      revenueEventId: cleanString(downstream?.revenueEventId, 180),
      attributionStatus: context.attributionStatus,
      sessionLinked: true,
      value: purchase.value,
      shipping: purchase.shipping,
      itemCount: purchase.items.length
    }, message);
    return { skipped: false, ok: false, error: message, transactionId: purchase.transactionId };
  }
}
__name(sendGa4PurchaseProduction, "sendGa4PurchaseProduction");


function hostname(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
__name(hostname, "hostname");
function recognizedHint(url) {
  const raw = (url.searchParams.get("src") ?? url.searchParams.get("utm_source") ?? "").trim().toLowerCase();
  if (raw === "website" || raw === "instagram" || raw === "threads" || raw === "tiktok") return raw;
  return null;
}
__name(recognizedHint, "recognizedHint");
function classifyOrigin(request, url) {
  const ref = hostname(request.headers.get("Referer"));
  const ua = (request.headers.get("User-Agent") ?? "").toLowerCase();
  const hint = recognizedHint(url);
  let refOrigin = null;
  if (ref === "umkmnaikkelas.id") refOrigin = "website";
  else if (ref === "instagram.com" || ref === "l.instagram.com") refOrigin = "instagram";
  else if (ref === "threads.net" || ref === "threads.com") refOrigin = "threads";
  else if (ref === "tiktok.com" || ref === "vm.tiktok.com" || ref === "vt.tiktok.com") refOrigin = "tiktok";
  let uaOrigin = null;
  if (/\binstagram\b/.test(ua)) uaOrigin = "instagram";
  else if (/\bthreads\b/.test(ua)) uaOrigin = "threads";
  else if (/\btiktok\b|musical_ly|bytedance/.test(ua)) uaOrigin = "tiktok";
  return { origin: refOrigin ?? uaOrigin ?? hint ?? "direct_or_unknown", referrerRecognized: Boolean(refOrigin), userAgentRecognized: Boolean(uaOrigin), sourceHint: hint };
}
__name(classifyOrigin, "classifyOrigin");
async function recordTrackedOrigin(request, url, env, slug) {
  const link = await env.DB.prepare(`SELECT l.id,l.slug,l.platform,l.content_item_id,l.campaign_id,COALESCE(l.offer_id,c.offer_id) offer_id
    FROM monetization_tracked_links l LEFT JOIN monetization_campaigns c ON c.id=l.campaign_id AND c.brand_id=l.brand_id
    WHERE l.brand_id='brand-umkm-naik-kelas' AND l.slug=?1 AND l.status='active'`).bind(slug).first();
  if (!link) return;
  const evidence = classifyOrigin(request, url);
  await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,error_code,error_message,correlation_id,metadata_json)
    VALUES ('tracking','tracked_origin',?1,NULL,NULL,?2,?3)`).bind(
    evidence.origin === "direct_or_unknown" ? "warning" : "success",
    link.id,
    JSON.stringify({
      evidenceVersion: "1.1",
      trackedLinkId: link.id,
      slug: link.slug,
      configuredPlatform: link.platform,
      contentItemId: link.content_item_id,
      campaignId: link.campaign_id,
      offerId: link.offer_id,
      detectedOrigin: evidence.origin,
      referrerRecognized: evidence.referrerRecognized,
      userAgentRecognized: evidence.userAgentRecognized,
      sourceHint: evidence.sourceHint,
      rawReferrerStored: false,
      rawUserAgentStored: false,
      piiStored: false,
      recordedAt: (/* @__PURE__ */ new Date()).toISOString()
    })
  ).run();
}
__name(recordTrackedOrigin, "recordTrackedOrigin");
async function parsedJsonClone(request) {
  try {
    const parsed = await request.clone().json();
    return isRecord8(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
__name(parsedJsonClone, "parsedJsonClone");
async function publicAppHandoff(request, env) {
  const contentType = (request.headers.get("Content-Type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) return json15({ ok: false, error: "Content-Type harus application/json." }, 415);
  if (request.headers.get("X-Panglima-Client") !== APP_CLIENT_HEADER) return json15({ ok: false, error: "Client handoff tidak dikenali." }, 403);
  if (!await bodyWithinLimit(request, 2048)) return json15({ ok: false, error: "Payload terlalu besar." }, 413);
  if (!await rateAllowed(request, env, 60)) return json15({ ok: false, error: "Rate limit terlampaui." }, 429, void 0, { "Retry-After": "60" });
  const body = await parsedJsonClone(request);
  if (!body) return json15({ ok: false, error: "Body JSON harus object." }, 400);
  const allowed = /* @__PURE__ */ new Set(["appInstanceId", "appVersion", "offerId", "installReceipt"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return json15({ ok: false, error: "Field handoff tidak diizinkan." }, 400);
  const appInstanceId = cleanString(body.appInstanceId, 180)?.toLowerCase() ?? "";
  const appVersion = cleanString(body.appVersion, 40) ?? "";
  const offerId = cleanString(body.offerId, 100) ?? "";
  const receipt = cleanString(body.installReceipt, 2e3) ?? "";
  if (!APP_INSTANCE_PATTERN2.test(appInstanceId) || !APP_VERSION_PATTERN2.test(appVersion) || !offerId || !receipt) {
    return json15({ ok: false, error: "Kontrak handoff tidak valid." }, 400);
  }
  const proof = await verifyAppInstallReceipt(receipt, env);
  if (!proof || proof.appInstanceId !== appInstanceId || proof.appVersion !== appVersion) return json15({ ok: false, error: "Install receipt tidak valid atau kedaluwarsa." }, 401);
  const install = await env.DB.prepare(`SELECT id FROM monetization_events WHERE id=?1 AND brand_id='brand-umkm-naik-kelas'
    AND event_type='app_install' AND source='apk' AND platform='app' AND visitor_id=?2
    AND json_extract(metadata_json,'$.appVersion')=?3`).bind(String(proof.eventId), appInstanceId, appVersion).first();
  if (!install) return json15({ ok: false, error: "Install evidence tidak cocok." }, 401);
  const safeRequest = new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    appInstanceId,
    appVersion,
    offerId,
    idempotencyKey: `apk-handoff:${proof.eventId}:${offerId}`
  }) });
  const result = await createAppHandoff(safeRequest, env);
  const resultBody = isRecord8(result.body) ? result.body : {};
  if (result.status < 300 && typeof resultBody.eventId === "string" && typeof resultBody.eventType === "string") {
    await recordTouchpoint(resultBody.eventId, resultBody.eventType, { visitorId: appInstanceId, offerId, platform: "app" }, env).catch((error) => {
      console.error(JSON.stringify({ message: "v15_app_handoff_touchpoint_failed", eventId: resultBody.eventId, error: error instanceof Error ? error.message : "unknown" }));
    });
  }
  return json15(result.body, result.status);
}
__name(publicAppHandoff, "publicAppHandoff");
async function maintenanceAggregate(request, env) {
  if (!hardeningAuthorized(request, env)) return json15({ ok: false, error: "Unauthorized" }, 401);
  if (!await bodyWithinLimit(request, 4096)) return json15({ ok: false, error: "Payload terlalu besar." }, 413);
  const body = await parsedJsonClone(request) ?? {};
  const correlationId = cleanString(body.correlationId, 160) ?? `aggregate-${crypto.randomUUID()}`;
  try {
    const result = await materializeDailyAnalytics(env, Number(body.days));
    await recordMaintenance(env, "daily_analytics_materialize", "success", correlationId, result).catch((error) => {
      console.error(JSON.stringify({ message: "v15_maintenance_log_failed", correlationId, error: error instanceof Error ? error.message : "unknown" }));
    });
    return json15({ ok: true, correlationId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await recordMaintenance(env, "daily_analytics_materialize", "error", correlationId, {}, message).catch(() => {
    });
    return json15({ ok: false, error: "Materialisasi analytics gagal.", correlationId }, 500);
  }
}
__name(maintenanceAggregate, "maintenanceAggregate");
var monetization_worker_v15_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/dashboard" || url.pathname === "/monetization")) {
      return new Response(null, { status: 302, headers: { Location: DASHBOARD_URL, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    }
    if (request.method === "GET" && url.pathname === "/api/monetization/version") {
      return json15({
        ok: true,
        version: VERSION,
        mode: "additive-only",
        runtimeVersion: env.CF_VERSION_METADATA ?? null,
        retentionMode: "preview-only",
        dashboardMode: "access-protected-server-rendered",
        securityConfiguration: secretDomainStatus(env)
      });
    }
    if (request.method === "GET" && url.pathname === "/api/monetization/daily-analytics") {
      if (!hardeningAuthorized(request, env)) return json15({ ok: false, error: "Unauthorized" }, 401);
      try {
        const data = await dailyAnalytics(env, url);
        return json15({
          ok: true,
          periodDays: data.days,
          snapshot: data.snapshot,
          dataScope: data.dataScope,
          materializationRequired: data.materializationRequired,
          freshness: data.freshness,
          rows: data.rows,
          totals: data.totals,
          accountingProfit: null
        });
      } catch {
        return json15({ ok: false, error: "Analytics hardening belum siap; migration 0006 wajib diterapkan." }, 503);
      }
    }
    if (request.method === "GET" && url.pathname === "/api/monetization/learning/dataset") {
      if (!hardeningAuthorized(request, env)) return json15({ ok: false, error: "Unauthorized" }, 401);
      const days = Math.max(7, Math.min(365, Math.round(Number(url.searchParams.get("days")) || 30)));
      try {
        return json15({ ok: true, dataset: await aggregatedDataset(env, days) });
      } catch {
        return json15({ ok: false, error: "Dataset learning belum dapat dihitung." }, 503);
      }
    }
    if (request.method === "GET" && url.pathname === "/api/monetization/quality/review") {
      if (!qualityAuthorized(request, env)) return json15({ ok: false, error: "Unauthorized" }, 401);
      try {
        return json15({ ok: true, ...await qualityReviewQueue(env, url) });
      } catch {
        return json15({ ok: false, error: "Quality review queue belum siap; migration 0007 dan 0008 wajib diterapkan." }, 503);
      }
    }
    if (request.method === "POST" && url.pathname === "/api/monetization/app/handoff") return publicAppHandoff(request, env);
    if (request.method === "POST" && url.pathname === "/api/monetization/maintenance/aggregate") return maintenanceAggregate(request, env);
    if (request.method === "POST" && url.pathname === "/api/monetization/maintenance/retention/preview") {
      if (!hardeningAuthorized(request, env)) return json15({ ok: false, error: "Unauthorized" }, 401);
      try {
        return json15({ ok: true, ...await retentionPreview(env) });
      } catch {
        return json15({ ok: false, error: "Retention preview belum siap." }, 503);
      }
    }
    const qualityMatch = url.pathname.match(/^\/api\/monetization\/quality\/(event|revenue_event|learning_insight)\/([^/]+)$/);
    if (request.method === "PUT" && qualityMatch?.[1] && qualityMatch[2]) {
      if (!qualityAuthorized(request, env)) return json15({ ok: false, error: "Unauthorized" }, 401);
      if (!await bodyWithinLimit(request, 8192)) return json15({ ok: false, error: "Payload terlalu besar." }, 413);
      try {
        return json15({ ok: true, quality: await upsertRecordQuality(request, env, qualityMatch[1], decodeURIComponent(qualityMatch[2])) });
      } catch (error) {
        return json15({ ok: false, error: error instanceof Error ? error.message : "Quality update gagal." }, 400);
      }
    }
    const guardedPosts = request.method === "POST" && [
      "/api/monetization/events",
      "/api/monetization/revenue",
      "/api/monetization/webhooks/lynk",
      "/api/monetization/affiliate/conversions",
      "/api/monetization/app/install"
    ].includes(url.pathname);
    if (request.method === "POST" && url.pathname === "/api/monetization/webhooks/lynk" && !secretDomainStatus(env).lynkWebhookSecretIsolated) {
      return json15({ ok: false, error: "Konfigurasi secret webhook belum terisolasi." }, 503);
    }
    if (guardedPosts) {
      const maxBytes = url.pathname === "/api/monetization/app/install" ? 2048 : 32768;
      if (!await bodyWithinLimit(request, maxBytes)) return json15({ ok: false, error: "Payload terlalu besar." }, 413);
      if ((url.pathname === "/api/monetization/app/install" || url.pathname === "/api/monetization/webhooks/lynk") && !await rateAllowed(request, env, url.pathname === "/api/monetization/app/install" ? 60 : 300)) {
        return json15({ ok: false, error: "Rate limit terlampaui." }, 429, void 0, { "Retry-After": "60" });
      }
    }
    const eventBody = request.method === "POST" && url.pathname === "/api/monetization/events" ? await parsedJsonClone(request) : null;
    const installBody = request.method === "POST" && url.pathname === "/api/monetization/app/install" ? await parsedJsonClone(request) : null;
    const lynkPurchaseBody = request.method === "POST" && url.pathname === "/api/monetization/webhooks/lynk" ? await parsedJsonClone(request) : null;
    const goMatch = url.pathname.match(/^\/go\/([a-z0-9_-]{4,80})$/i);
    const downstreamRequest = request.method === "GET" && goMatch?.[1]
      ? withGa4ContextOnTrackedRequest(request, url)
      : request;
    const response = await monetization_worker_v14_default.fetch(downstreamRequest, env, ctx);

    if (lynkPurchaseBody && response.ok) {
      const downstream = await response.clone().json().catch(() => null);
      if (isRecord8(downstream) && downstream.ok === true && downstream.duplicate === false) {
        ctx.waitUntil(sendGa4PurchaseProduction(env, lynkPurchaseBody, downstream).catch((error) => {
          console.error(JSON.stringify({
            message: "ga4_purchase_waituntil_failed",
            revenueEventId: typeof downstream.revenueEventId === "string" ? downstream.revenueEventId : null,
            error: error instanceof Error ? error.message : "unknown"
          }));
        }));
      }
    }
    if (eventBody && response.ok) {
      const parsed = await response.clone().json().catch(() => null);
      if (isRecord8(parsed) && parsed.ok === true && parsed.duplicate === false && typeof parsed.eventId === "string" && typeof eventBody.eventType === "string") {
        ctx.waitUntil(recordTouchpoint(parsed.eventId, eventBody.eventType, eventBody, env).catch((error) => {
          console.error(JSON.stringify({ message: "v15_touchpoint_write_failed", eventId: parsed.eventId, error: error instanceof Error ? error.message : "unknown" }));
        }));
      }
    }
    if (request.method === "GET" && goMatch?.[1] && response.status === 302) {
      const slug = goMatch[1].toLowerCase();
      ctx.waitUntil(Promise.all([
        recordTrackedOrigin(downstreamRequest, url, env, slug),
        recordLatestRedirectTouchpoint(slug, downstreamRequest, env)
      ]).then(() => void 0).catch((error) => {
        console.error(JSON.stringify({ message: "v15_tracked_evidence_failed", slug, error: error instanceof Error ? error.message : "unknown" }));
      }));
    }
    if (installBody && response.ok && typeof installBody.appInstanceId === "string" && typeof installBody.appVersion === "string") {
      const parsed = await response.clone().json().catch(() => null);
      if (isRecord8(parsed) && parsed.ok === true && typeof parsed.eventId === "string") {
        const normalizedInstance = cleanString(installBody.appInstanceId, 180)?.toLowerCase() ?? "";
        const normalizedVersion = cleanString(installBody.appVersion, 40) ?? "";
        const receipt = APP_INSTANCE_PATTERN2.test(normalizedInstance) && APP_VERSION_PATTERN2.test(normalizedVersion) ? await issueAppInstallReceipt(normalizedInstance, normalizedVersion, parsed.eventId, env) : null;
        return json15({ ...parsed, handoffAvailable: Boolean(receipt), installReceipt: receipt, installReceiptTtlSeconds: receipt ? 86400 : 0 }, response.status, response);
      }
    }
    return response;
  },
  async scheduled(controller, env, ctx) {
    await monetization_worker_v14_default.scheduled(controller, env, ctx);
    if (env.MONETIZATION_V15_MAINTENANCE_ENABLED !== "true") return;
    ctx.waitUntil((async () => {
      const correlationId = `cron-v15-${(/* @__PURE__ */ new Date()).toISOString()}`;
      try {
        const analytics = await materializeDailyAnalytics(env, 35);
        const retention = await retentionPreview(env);
        await recordMaintenance(env, "daily_hardening", "success", correlationId, { analytics, retention, cron: controller.cron });
      } catch (error) {
        await recordMaintenance(env, "daily_hardening", "error", correlationId, { cron: controller.cron }, error instanceof Error ? error.message : "unknown").catch(() => {
        });
      }
    })());
  },
  queue: monetization_worker_v14_default.queue
};
export {
  monetization_worker_v15_default as default
};
//# sourceMappingURL=monetization-worker-v15.js.map
