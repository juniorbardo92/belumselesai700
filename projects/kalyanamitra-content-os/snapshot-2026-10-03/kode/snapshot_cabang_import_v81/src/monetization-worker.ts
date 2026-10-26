import { guardedInvalidationHistoryStatement, guardedInvalidationStatement, monetizationQualityEnabled, unknownQualityStatement, verifiedQualityFilter } from './monetization-quality';

type MonetizationEnv = {
  DB: D1Database;
  MONETIZATION_INGEST_TOKEN?: string;
};

type ApiResult = { status: number; body: unknown };

const BRAND_ID = "brand-umkm-naik-kelas";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const SECURITY_HEADERS: Record<string, string> = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

function withSecurity(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) result.set(key, value);
  return result;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: withSecurity(JSON_HEADERS) });
}

function redirect(url: string, status = 302): Response {
  return new Response(null, { status, headers: withSecurity({ Location: url, "Cache-Control": "no-store" }) });
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function revenueMetadata(body: Record<string, unknown>,extra:Record<string,unknown>={}): string {
  const metadata = { ...recordValue(body.metadata),...extra };
  metadata.financialCompleteness = {
    fee: body.feeAmount === undefined ? "unknown" : "reported",
    cost: body.costAmount === undefined ? "unknown" : "reported"
  };
  return safeJson(metadata);
}

async function parseJsonObject(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.json<unknown>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Body JSON harus berupa object.");
  return raw as Record<string, unknown>;
}

function stringValue(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function integerValue(value: unknown, fallback = 0): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number);
}

type IntegerField={valid:boolean;present:boolean;value:number};
function strictIntegerField(body:Record<string,unknown>,key:string,fallback=0):IntegerField{
  if(body[key]===undefined)return {valid:true,present:false,value:fallback};
  const raw=body[key];
  const value=typeof raw==='number'?raw:typeof raw==='string'&&/^-?(0|[1-9]\d*)$/.test(raw.trim())?Number(raw):Number.NaN;
  return {valid:Number.isSafeInteger(value),present:true,value:Number.isSafeInteger(value)?value:fallback};
}

function numberValue(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function allowedValue<T extends string>(value: unknown, allowed: readonly T[], fallback?: T): T | null {
  if (typeof value !== "string") return fallback ?? null;
  return allowed.includes(value as T) ? (value as T) : fallback ?? null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function requireIngestToken(request: Request, env: MonetizationEnv): Response | null {
  if (!env.MONETIZATION_INGEST_TOKEN) return null;
  const supplied = request.headers.get("Authorization");
  if (supplied === `Bearer ${env.MONETIZATION_INGEST_TOKEN}`) return null;
  return json({ ok: false, error: "Unauthorized" }, 401);
}

const OFFER_TYPES = ["own_product", "affiliate", "lead_generation", "service", "app_install", "free_lead_magnet"] as const;
const OFFER_STATUSES = ["draft", "active", "paused", "archived"] as const;
const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed", "archived"] as const;
const LINK_STATUSES = ["active", "paused", "archived"] as const;
const GOALS = ["none", "awareness", "traffic", "lead", "affiliate", "own_product", "app_install", "service"] as const;
const EVENT_TYPES = ["impression", "click", "landing_view", "lead", "checkout", "purchase", "refund", "affiliate_click", "affiliate_conversion", "app_install", "app_open", "signup", "tool_used"] as const;
const REVENUE_TYPES = ["sale", "affiliate_commission", "subscription", "refund", "chargeback", "lead_value", "service_conversion"] as const;
const REVENUE_STATUSES = ["pending", "confirmed", "refunded", "rejected"] as const;

async function listOffers(env: MonetizationEnv, url: URL): Promise<ApiResult> {
  const status = stringValue(url.searchParams.get("status"), 20);
  const type = stringValue(url.searchParams.get("type"), 40);
  let sql = "SELECT * FROM monetization_offers WHERE brand_id = ?1";
  const binds: unknown[] = [BRAND_ID];
  if (status) { sql += ` AND status = ?${binds.length + 1}`; binds.push(status); }
  if (type) { sql += ` AND type = ?${binds.length + 1}`; binds.push(type); }
  sql += " ORDER BY updated_at DESC, created_at DESC LIMIT 250";
  const result = await env.DB.prepare(sql).bind(...binds).all();
  return { status: 200, body: { ok: true, offers: result.results ?? [] } };
}

async function createOffer(request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const body = await parseJsonObject(request);
  const name = stringValue(body.name, 160);
  const type = allowedValue(body.type, OFFER_TYPES);
  if (!name || !type) return { status: 400, body: { ok: false, error: "name dan type offer wajib valid." } };
  const destinationUrl = stringValue(body.destinationUrl, 2000);
  if (destinationUrl && !isHttpUrl(destinationUrl)) return { status: 400, body: { ok: false, error: "destinationUrl tidak valid." } };
  const id = stringValue(body.id, 100) ?? uid("off");
  const status = allowedValue(body.status, OFFER_STATUSES, "draft")!;
  await env.DB.prepare(`INSERT INTO monetization_offers (
    id, brand_id, name, type, category, description, destination_url, price_amount, currency,
    commission_type, commission_value, estimated_margin_amount, audience, problem_solved, status, metadata_json
  ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)`)
    .bind(
      id, BRAND_ID, name, type, stringValue(body.category, 120), stringValue(body.description, 3000), destinationUrl,
      integerValue(body.priceAmount), stringValue(body.currency, 8) ?? "IDR", allowedValue(body.commissionType, ["percent", "fixed"] as const),
      numberValue(body.commissionValue), integerValue(body.estimatedMarginAmount), stringValue(body.audience, 500), stringValue(body.problemSolved, 1000), status,
      safeJson(body.metadata)
    ).run();
  const offer = await env.DB.prepare("SELECT * FROM monetization_offers WHERE id = ?1").bind(id).first();
  return { status: 201, body: { ok: true, offer } };
}

async function updateOffer(id: string, request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const current = await env.DB.prepare("SELECT * FROM monetization_offers WHERE id = ?1 AND brand_id = ?2").bind(id, BRAND_ID).first<Record<string, unknown>>();
  if (!current) return { status: 404, body: { ok: false, error: "Offer tidak ditemukan." } };
  const body = await parseJsonObject(request);
  const name = stringValue(body.name, 160) ?? String(current.name);
  const type = allowedValue(body.type, OFFER_TYPES) ?? (String(current.type) as typeof OFFER_TYPES[number]);
  const status = allowedValue(body.status, OFFER_STATUSES) ?? (String(current.status) as typeof OFFER_STATUSES[number]);
  const destinationUrl = body.destinationUrl === null ? null : stringValue(body.destinationUrl, 2000) ?? (current.destination_url as string | null);
  if (destinationUrl && !isHttpUrl(destinationUrl)) return { status: 400, body: { ok: false, error: "destinationUrl tidak valid." } };
  await env.DB.prepare(`UPDATE monetization_offers SET
    name=?2,type=?3,category=?4,description=?5,destination_url=?6,price_amount=?7,currency=?8,
    commission_type=?9,commission_value=?10,estimated_margin_amount=?11,audience=?12,problem_solved=?13,status=?14,
    metadata_json=?15,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND brand_id=?16`)
    .bind(
      id, name, type,
      body.category === null ? null : stringValue(body.category, 120) ?? current.category,
      body.description === null ? null : stringValue(body.description, 3000) ?? current.description,
      destinationUrl,
      body.priceAmount === undefined ? current.price_amount : integerValue(body.priceAmount),
      stringValue(body.currency, 8) ?? String(current.currency ?? "IDR"),
      body.commissionType === null ? null : allowedValue(body.commissionType, ["percent", "fixed"] as const) ?? current.commission_type,
      body.commissionValue === undefined ? current.commission_value : numberValue(body.commissionValue),
      body.estimatedMarginAmount === undefined ? current.estimated_margin_amount : integerValue(body.estimatedMarginAmount),
      body.audience === null ? null : stringValue(body.audience, 500) ?? current.audience,
      body.problemSolved === null ? null : stringValue(body.problemSolved, 1000) ?? current.problem_solved,
      status,
      body.metadata === undefined ? String(current.metadata_json ?? "{}") : safeJson(body.metadata),
      BRAND_ID
    ).run();
  const offer = await env.DB.prepare("SELECT * FROM monetization_offers WHERE id = ?1").bind(id).first();
  return { status: 200, body: { ok: true, offer } };
}

async function listCampaigns(env: MonetizationEnv): Promise<ApiResult> {
  const result = await env.DB.prepare("SELECT * FROM monetization_campaigns WHERE brand_id=?1 ORDER BY updated_at DESC LIMIT 250").bind(BRAND_ID).all();
  return { status: 200, body: { ok: true, campaigns: result.results ?? [] } };
}

async function createCampaign(request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const body = await parseJsonObject(request);
  const name = stringValue(body.name, 160);
  const objective = stringValue(body.objective, 80);
  if (!name || !objective) return { status: 400, body: { ok: false, error: "name dan objective campaign wajib." } };
  const id = stringValue(body.id, 100) ?? uid("cam");
  const status = allowedValue(body.status, CAMPAIGN_STATUSES, "draft")!;
  const offerId = stringValue(body.offerId, 100);
  if (offerId) {
    const offer = await env.DB.prepare("SELECT id FROM monetization_offers WHERE id=?1 AND brand_id=?2").bind(offerId, BRAND_ID).first();
    if (!offer) return { status: 400, body: { ok: false, error: "offerId campaign tidak valid untuk brand ini." } };
  }
  await env.DB.prepare(`INSERT INTO monetization_campaigns (id,brand_id,name,objective,offer_id,status,starts_at,ends_at,metadata_json)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`)
    .bind(id, BRAND_ID, name, objective, offerId, status, stringValue(body.startsAt, 40), stringValue(body.endsAt, 40), safeJson(body.metadata)).run();
  const campaign = await env.DB.prepare("SELECT * FROM monetization_campaigns WHERE id=?1").bind(id).first();
  return { status: 201, body: { ok: true, campaign } };
}

async function updateCampaign(id: string, request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const current = await env.DB.prepare("SELECT * FROM monetization_campaigns WHERE id=?1 AND brand_id=?2").bind(id, BRAND_ID).first<Record<string, unknown>>();
  if (!current) return { status: 404, body: { ok: false, error: "Campaign tidak ditemukan." } };
  const body = await parseJsonObject(request);
  const offerId = body.offerId === null ? null : stringValue(body.offerId, 100) ?? current.offer_id as string | null;
  if (offerId) {
    const offer = await env.DB.prepare("SELECT id FROM monetization_offers WHERE id=?1 AND brand_id=?2").bind(offerId, BRAND_ID).first();
    if (!offer) return { status: 400, body: { ok: false, error: "offerId campaign tidak valid untuk brand ini." } };
  }
  const status = allowedValue(body.status, CAMPAIGN_STATUSES) ?? String(current.status) as typeof CAMPAIGN_STATUSES[number];
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
      body.metadata === undefined ? String(current.metadata_json ?? "{}") : safeJson(body.metadata),
      BRAND_ID
    ).run();
  return { status: 200, body: { ok: true, campaign: await env.DB.prepare("SELECT * FROM monetization_campaigns WHERE id=?1").bind(id).first() } };
}

async function validateLinkReferences(env: MonetizationEnv, contentId: string | null, campaignId: string | null, offerId: string | null): Promise<string | null> {
  const statements: D1PreparedStatement[] = [];
  if (contentId) statements.push(env.DB.prepare("SELECT id FROM content_items WHERE id=?1 AND brand_id=?2").bind(contentId, BRAND_ID));
  if (campaignId) statements.push(env.DB.prepare("SELECT id,offer_id FROM monetization_campaigns WHERE id=?1 AND brand_id=?2").bind(campaignId, BRAND_ID));
  if (offerId) statements.push(env.DB.prepare("SELECT id FROM monetization_offers WHERE id=?1 AND brand_id=?2").bind(offerId, BRAND_ID));
  const results = statements.length ? await env.DB.batch<Record<string, unknown>>(statements) : [];
  let index = 0;
  if (contentId && !results[index++]?.results[0]) return "contentItemId tidak valid untuk brand ini.";
  const campaign = campaignId ? results[index++]?.results[0] : null;
  if (campaignId && !campaign) return "campaignId tidak valid untuk brand ini.";
  if (offerId && !results[index++]?.results[0]) return "offerId tidak valid untuk brand ini.";
  if (campaign && offerId && campaign.offer_id && String(campaign.offer_id) !== offerId) return "offerId tidak sama dengan offer milik campaign.";
  return null;
}

async function validateLinkGraph(env:MonetizationEnv,contentId:string|null,campaignId:string|null,offerId:string|null,requireActive:boolean):Promise<{error:string|null;effectiveOfferId:string|null}>{
  const basic=await validateLinkReferences(env,contentId,campaignId,offerId);
  if(basic)return {error:basic,effectiveOfferId:offerId};
  const campaign=campaignId?await env.DB.prepare(`SELECT id,offer_id,status FROM monetization_campaigns WHERE id=?1 AND brand_id=?2`).bind(campaignId,BRAND_ID).first<Record<string,unknown>>():null;
  const campaignOffer=campaign?.offer_id?String(campaign.offer_id):null;
  const effectiveOfferId=offerId??campaignOffer;
  if(offerId&&campaignOffer&&offerId!==campaignOffer)return {error:'offerId tidak sama dengan offer milik campaign.',effectiveOfferId};
  const offer=effectiveOfferId?await env.DB.prepare(`SELECT id,status FROM monetization_offers WHERE id=?1 AND brand_id=?2`).bind(effectiveOfferId,BRAND_ID).first<Record<string,unknown>>():null;
  if(effectiveOfferId&&!offer)return {error:'offer efektif tidak valid untuk brand ini.',effectiveOfferId};
  if(requireActive){
    if(campaignId&&campaign?.status!=='active')return {error:'Campaign harus active sebelum tracked link diaktifkan.',effectiveOfferId};
    if(effectiveOfferId&&offer?.status!=='active')return {error:'Offer harus active sebelum tracked link diaktifkan.',effectiveOfferId};
    if(contentId){
      const mapping=await env.DB.prepare(`SELECT campaign_id,offer_id FROM content_monetization WHERE content_item_id=?1`).bind(contentId).first<Record<string,unknown>>();
      if(!mapping)return {error:'Mapping monetisasi content wajib ada sebelum tracked link diaktifkan.',effectiveOfferId};
      if((mapping.campaign_id?String(mapping.campaign_id):null)!==campaignId)return {error:'Campaign tracked link tidak sama dengan mapping content.',effectiveOfferId};
      if((mapping.offer_id?String(mapping.offer_id):null)!==effectiveOfferId)return {error:'Offer tracked link tidak sama dengan mapping content.',effectiveOfferId};
    }
  }
  return {error:null,effectiveOfferId};
}

async function getContentMonetization(contentId: string, env: MonetizationEnv): Promise<ApiResult> {
  const content = await env.DB.prepare("SELECT id,title,status,platform FROM content_items WHERE id=?1 AND brand_id=?2").bind(contentId, BRAND_ID).first();
  if (!content) return { status: 404, body: { ok: false, error: "Content tidak ditemukan." } };
  const monetization = await env.DB.prepare("SELECT * FROM content_monetization WHERE content_item_id=?1").bind(contentId).first();
  return { status: 200, body: { ok: true, content, monetization: monetization ?? { content_item_id: contentId, monetization_goal: "none", commercial_score: 0 } } };
}

async function saveContentMonetization(contentId: string, request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const content = await env.DB.prepare("SELECT id FROM content_items WHERE id=?1 AND brand_id=?2").bind(contentId, BRAND_ID).first();
  if (!content) return { status: 404, body: { ok: false, error: "Content tidak ditemukan." } };
  const body = await parseJsonObject(request);
  const goal = allowedValue(body.monetizationGoal, GOALS, "none")!;
  const destinationUrl = stringValue(body.destinationUrl, 2000);
  if (destinationUrl && !isHttpUrl(destinationUrl)) return { status: 400, body: { ok: false, error: "destinationUrl tidak valid." } };
  const offerId = stringValue(body.offerId, 100);
  const campaignId = stringValue(body.campaignId, 100);
  const relation=await validateLinkGraph(env,contentId,campaignId,offerId,false);
  if(relation.error)return {status:400,body:{ok:false,error:relation.error}};
  await env.DB.prepare(`INSERT INTO content_monetization (
    content_item_id,monetization_goal,offer_id,campaign_id,cta_id,cta_text,commercial_score,destination_url,metadata_json
  ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
  ON CONFLICT(content_item_id) DO UPDATE SET
    monetization_goal=excluded.monetization_goal,offer_id=excluded.offer_id,campaign_id=excluded.campaign_id,
    cta_id=excluded.cta_id,cta_text=excluded.cta_text,commercial_score=excluded.commercial_score,
    destination_url=excluded.destination_url,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(contentId, goal, relation.effectiveOfferId, campaignId, stringValue(body.ctaId, 100), stringValue(body.ctaText, 800), Math.max(0, Math.min(100, numberValue(body.commercialScore))), destinationUrl, safeJson(body.metadata)).run();
  return getContentMonetization(contentId, env);
}

async function createTrackedLink(request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const body = await parseJsonObject(request);
  const destinationUrl = stringValue(body.destinationUrl, 2000);
  if (!destinationUrl || !isHttpUrl(destinationUrl)) return { status: 400, body: { ok: false, error: "destinationUrl wajib berupa http/https URL." } };
  const slug = (stringValue(body.slug, 80) ?? crypto.randomUUID().replaceAll("-", "").slice(0, 10)).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{3,79}$/.test(slug)) return { status: 400, body: { ok: false, error: "slug tidak valid." } };
  const contentId = stringValue(body.contentItemId, 100);
  const campaignId = stringValue(body.campaignId, 100);
  const offerId = stringValue(body.offerId, 100);
  const status = allowedValue(body.status, LINK_STATUSES, "active")!;
  const relation=await validateLinkGraph(env,contentId,campaignId,offerId,status==='active');
  if(relation.error)return {status:409,body:{ok:false,error:relation.error}};
  const id = uid("lnk");
  try {
    await env.DB.prepare(`INSERT INTO monetization_tracked_links (
      id,slug,brand_id,content_item_id,campaign_id,offer_id,cta_id,platform,destination_url,status,metadata_json
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`)
      .bind(id, slug, BRAND_ID, contentId, campaignId, relation.effectiveOfferId, stringValue(body.ctaId, 100), stringValue(body.platform, 40), destinationUrl, status, safeJson(body.metadata)).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Link gagal dibuat.";
    if (message.toLowerCase().includes("unique")) return { status: 409, body: { ok: false, error: "slug sudah digunakan." } };
    throw error;
  }
  const link = await env.DB.prepare("SELECT * FROM monetization_tracked_links WHERE id=?1").bind(id).first();
  return { status: 201, body: { ok: true, link } };
}

async function updateTrackedLink(id: string, request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const current = await env.DB.prepare("SELECT * FROM monetization_tracked_links WHERE id=?1 AND brand_id=?2").bind(id, BRAND_ID).first<Record<string, unknown>>();
  if (!current) return { status: 404, body: { ok: false, error: "Tracked link tidak ditemukan." } };
  const body = await parseJsonObject(request);
  if (body.slug !== undefined && stringValue(body.slug, 80)?.toLowerCase() !== String(current.slug)) {
    return { status: 400, body: { ok: false, error: "Slug tracked link bersifat immutable." } };
  }
  const destination = body.destinationUrl === undefined ? String(current.destination_url) : stringValue(body.destinationUrl, 2000);
  if (!destination || !isHttpUrl(destination)) return { status: 400, body: { ok: false, error: "destinationUrl tidak valid." } };
  if (destination !== String(current.destination_url) && String(current.status) !== "paused") {
    return { status: 409, body: { ok: false, error: "Pause tracked link sebelum mengubah destinationUrl." } };
  }
  const relationKeys=['contentItemId','campaignId','offerId','ctaId','platform'] as const;
  if(String(current.status)!=='paused'&&relationKeys.some((key)=>body[key]!==undefined)){
    return {status:409,body:{ok:false,error:'Pause tracked link sebelum mengubah relasi atau platform.'}};
  }
  const contentId = body.contentItemId === null ? null : stringValue(body.contentItemId, 100) ?? current.content_item_id as string | null;
  const campaignId = body.campaignId === null ? null : stringValue(body.campaignId, 100) ?? current.campaign_id as string | null;
  const offerId = body.offerId === null ? null : stringValue(body.offerId, 100) ?? current.offer_id as string | null;
  const status = allowedValue(body.status, LINK_STATUSES) ?? String(current.status) as typeof LINK_STATUSES[number];
  const relation=await validateLinkGraph(env,contentId,campaignId,offerId,status==='active');
  if(relation.error)return {status:409,body:{ok:false,error:relation.error}};
  await env.DB.prepare(`UPDATE monetization_tracked_links SET
    content_item_id=?2,campaign_id=?3,offer_id=?4,cta_id=?5,platform=?6,destination_url=?7,status=?8,
    metadata_json=?9,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND brand_id=?10`).bind(
      id,contentId,campaignId,relation.effectiveOfferId,
      body.ctaId === null ? null : stringValue(body.ctaId, 100) ?? current.cta_id,
      body.platform === null ? null : stringValue(body.platform, 40) ?? current.platform,
      destination,status,body.metadata === undefined ? String(current.metadata_json ?? "{}") : safeJson(body.metadata),BRAND_ID
    ).run();
  return { status: 200, body: { ok: true, link: await env.DB.prepare("SELECT * FROM monetization_tracked_links WHERE id=?1").bind(id).first() } };
}

async function listTrackedLinks(env: MonetizationEnv): Promise<ApiResult> {
  const result = await env.DB.prepare("SELECT * FROM monetization_tracked_links WHERE brand_id=?1 ORDER BY created_at DESC LIMIT 250").bind(BRAND_ID).all();
  return { status: 200, body: { ok: true, links: result.results ?? [] } };
}

async function recordEvent(body: Record<string, unknown>, env: MonetizationEnv): Promise<{ duplicate: boolean; id: string }> {
  const eventType = allowedValue(body.eventType, EVENT_TYPES);
  if (!eventType) throw new Error("eventType tidak valid.");
  const valueField=strictIntegerField(body,'valueAmount');
  if(!valueField.valid)throw new Error('valueAmount harus safe integer.');
  const id = stringValue(body.id, 100) ?? uid("evt");
  const idempotencyKey = stringValue(body.idempotencyKey, 180);
  try {
    const insert=env.DB.prepare(`INSERT INTO monetization_events (
      id,event_type,brand_id,content_item_id,campaign_id,offer_id,tracked_link_id,source,platform,
      visitor_id,session_id,external_event_id,idempotency_key,value_amount,currency,metadata_json,occurred_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,COALESCE(?17,CURRENT_TIMESTAMP))`)
      .bind(
        id, eventType, BRAND_ID, stringValue(body.contentItemId,100), stringValue(body.campaignId,100), stringValue(body.offerId,100), stringValue(body.trackedLinkId,100),
        stringValue(body.source,80), stringValue(body.platform,40), stringValue(body.visitorId,180), stringValue(body.sessionId,180), stringValue(body.externalEventId,180),
        idempotencyKey, valueField.value, stringValue(body.currency,8) ?? "IDR", safeJson(body.metadata), stringValue(body.occurredAt,40)
      );
    if(await monetizationQualityEnabled(env))await env.DB.batch([insert,unknownQualityStatement(env,'event',id,'New event awaits provenance verification.')]);
    else await insert.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Event gagal.";
    if (idempotencyKey && message.toLowerCase().includes("unique")) {
      const existing=await env.DB.prepare(`SELECT id FROM monetization_events WHERE brand_id=?1 AND idempotency_key=?2`).bind(BRAND_ID,idempotencyKey).first<{id:string}>();
      return { duplicate: true, id:existing?.id??id };
    }
    throw error;
  }
  return { duplicate: false, id };
}

async function ingestEvent(request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const auth = requireIngestToken(request, env);
  if (auth) return { status: auth.status, body: { ok: false, error: "Unauthorized" } };
  const body = await parseJsonObject(request);
  try {
    const result = await recordEvent(body, env);
    return { status: result.duplicate ? 200 : 201, body: { ok: true, duplicate: result.duplicate, eventId: result.id } };
  } catch (error) {
    return { status: 400, body: { ok: false, error: error instanceof Error ? error.message : "Event tidak valid." } };
  }
}

async function ingestRevenue(request: Request, env: MonetizationEnv): Promise<ApiResult> {
  const auth = requireIngestToken(request, env);
  if (auth) return { status: auth.status, body: { ok: false, error: "Unauthorized" } };
  const body = await parseJsonObject(request);
  const eventType = allowedValue(body.eventType, REVENUE_TYPES);
  const source = stringValue(body.source, 80);
  if (!eventType || !source) return { status: 400, body: { ok: false, error: "eventType revenue dan source wajib valid." } };
  const grossField=strictIntegerField(body,'grossAmount'),feeField=strictIntegerField(body,'feeAmount'),costField=strictIntegerField(body,'costAmount');
  if(!grossField.valid||!feeField.valid||!costField.valid)return {status:400,body:{ok:false,error:'grossAmount, feeAmount, dan costAmount harus safe integer.'}};
  const gross=grossField.value,fee=feeField.value,cost=costField.value;
  const netField=strictIntegerField(body,'netAmount',gross-fee),marginField=strictIntegerField(body,'marginAmount',(netField.present?netField.value:gross-fee)-cost);
  if(!netField.valid||!marginField.valid)return {status:400,body:{ok:false,error:'netAmount dan marginAmount harus safe integer.'}};
  const net=netField.value,margin=marginField.value;
  if (netField.present && net !== gross - fee) {
    return { status: 400, body: { ok: false, error: "netAmount harus sama dengan grossAmount - feeAmount." } };
  }
  if (marginField.present && margin !== net - cost) {
    return { status: 400, body: { ok: false, error: "marginAmount harus sama dengan netAmount - costAmount." } };
  }
  const reversal=eventType==='refund'||eventType==='chargeback';
  const id=reversal?uid('rev'):stringValue(body.id,100)??uid('rev');
  if(reversal&&[gross,fee,cost,net].some((value)=>value>0))return {status:400,body:{ok:false,error:'Refund/chargeback harus menggunakan gross, fee, cost, dan net nol atau negatif.'}};
  if(!reversal&&(gross<0||fee<0||cost<0||net<0))return {status:400,body:{ok:false,error:'Sale/commission harus memiliki gross, fee, cost, dan net nol atau positif.'}};
  const status=body.status===undefined
    ?(reversal?'refunded':'confirmed')
    :allowedValue(body.status,REVENUE_STATUSES);
  if(!status)return {status:400,body:{ok:false,error:'status revenue tidak valid.'}};
  if(reversal&&status!=='refunded')return {status:400,body:{ok:false,error:'Refund/chargeback wajib berstatus refunded.'}};
  if(!reversal&&status==='refunded')return {status:400,body:{ok:false,error:'Gunakan eventType refund/chargeback untuk reversal.'}};
  const idempotencyKey = stringValue(body.idempotencyKey, 180);
  const transactionId=stringValue(body.transactionId,180);
  let reversedOriginal:Record<string,unknown>|null=null;
  if(reversal){
    if(!idempotencyKey)return {status:400,body:{ok:false,error:'idempotencyKey wajib untuk refund/chargeback.'}};
    if(!transactionId)return {status:400,body:{ok:false,error:'transactionId wajib untuk refund/chargeback.'}};
    const duplicate=await env.DB.prepare(`SELECT id FROM monetization_revenue_events
      WHERE brand_id=?1 AND idempotency_key=?2`).bind(BRAND_ID,idempotencyKey).first<{id:string}>();
    if(duplicate)return {status:200,body:{ok:true,duplicate:true,revenueEventId:duplicate.id}};
    const originals=await env.DB.prepare(`SELECT id,gross_amount,fee_amount,cost_amount,net_amount,currency,
      content_item_id,campaign_id,offer_id
      FROM monetization_revenue_events WHERE brand_id=?1 AND source=?2 AND transaction_id=?3
      AND event_type NOT IN ('refund','chargeback') AND status='confirmed' ORDER BY datetime(created_at) DESC LIMIT 2`)
      .bind(BRAND_ID,source,transactionId).all<Record<string,unknown>>();
    if((originals.results??[]).length!==1)return {status:409,body:{ok:false,error:'Reversal memerlukan tepat satu transaksi confirmed yang cocok.'}};
    reversedOriginal=originals.results![0]!;
    if(Math.abs(gross)>Number(reversedOriginal.gross_amount)||Math.abs(fee)>Number(reversedOriginal.fee_amount)||
      Math.abs(cost)>Number(reversedOriginal.cost_amount)||Math.abs(net)>Number(reversedOriginal.net_amount)){
      return {status:400,body:{ok:false,error:'Nilai reversal melebihi transaksi asal.'}};
    }
    const suppliedDimensions:[string,string][]=[
      ['contentItemId','content_item_id'],['campaignId','campaign_id'],['offerId','offer_id'],['currency','currency']
    ];
    for(const [inputKey,rowKey] of suppliedDimensions){
      const supplied=stringValue(body[inputKey],100),expected=stringValue(reversedOriginal[rowKey],100);
      if(supplied&&supplied!==expected)return {status:409,body:{ok:false,error:`${inputKey} reversal tidak sama dengan transaksi asal.`}};
    }
  }
  const contentItemId=reversedOriginal?stringValue(reversedOriginal.content_item_id,100):stringValue(body.contentItemId,100);
  const campaignId=reversedOriginal?stringValue(reversedOriginal.campaign_id,100):stringValue(body.campaignId,100);
  const offerId=reversedOriginal?stringValue(reversedOriginal.offer_id,100):stringValue(body.offerId,100);
  const currency=reversedOriginal?stringValue(reversedOriginal.currency,8)??'IDR':stringValue(body.currency,8)??'IDR';
  if(currency.toUpperCase()!=='IDR')return {status:400,body:{ok:false,error:'Monetization v1 hanya menerima currency IDR.'}};
  const reversedOriginalId=reversedOriginal?String(reversedOriginal.id):null;
  try {
    const insertColumns=`(id,transaction_id,event_type,source,brand_id,content_item_id,campaign_id,offer_id,source_event_id,
      gross_amount,fee_amount,cost_amount,net_amount,margin_amount,currency,status,external_reference,idempotency_key,metadata_json,occurred_at)`;
    const insertValues=`?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,COALESCE(?20,CURRENT_TIMESTAMP)`;
    const insertSql=reversal
      ?`INSERT OR IGNORE INTO monetization_revenue_events ${insertColumns}
        SELECT ${insertValues} WHERE NOT EXISTS (SELECT 1 FROM monetization_revenue_events
          WHERE brand_id=?5 AND source=?4 AND transaction_id=?2 AND event_type IN ('refund','chargeback'))`
      :`INSERT INTO monetization_revenue_events ${insertColumns} VALUES (${insertValues})`;
    const insert=env.DB.prepare(insertSql)
      .bind(
        id, transactionId, eventType, source, BRAND_ID, contentItemId, campaignId, offerId, stringValue(body.sourceEventId,100),
        gross, fee, cost, net, margin, currency, status, stringValue(body.externalReference,180), idempotencyKey,
        revenueMetadata(body,reversedOriginalId?{reversesRevenueEventId:reversedOriginalId,lifecycleGroup:`${source}:${transactionId}`}:{oneWayLedger:true}),stringValue(body.occurredAt,40)
      );
    let insertResult:D1Result;
    if(await monetizationQualityEnabled(env)){
      const invalidationReason='Manual reversal recorded; original and reversal require joint re-verification.';
      const results=await env.DB.batch([
        insert,
        unknownQualityStatement(env,'revenue_event',id,'New revenue event awaits provenance verification.'),
        ...(reversedOriginalId?[
          guardedInvalidationHistoryStatement(env,'revenue_event',reversedOriginalId,invalidationReason,idempotencyKey??id,id),
          guardedInvalidationStatement(env,'revenue_event',reversedOriginalId,invalidationReason,id)
        ]:[])
      ]);
      insertResult=results[0]!;
    } else insertResult=await insert.run();
    if(Number(insertResult.meta.changes??0)===0){
      const duplicate=idempotencyKey?await env.DB.prepare(`SELECT id FROM monetization_revenue_events
        WHERE brand_id=?1 AND idempotency_key=?2`).bind(BRAND_ID,idempotencyKey).first<{id:string}>():null;
      if(duplicate)return {status:200,body:{ok:true,duplicate:true,revenueEventId:duplicate.id}};
      return {status:409,body:{ok:false,error:'Transaksi ini sudah memiliki refund/chargeback.'}};
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
      feeStatus: body.feeAmount === undefined ? "unknown" : "reported",
      costStatus: body.costAmount === undefined ? "unknown" : "reported",
      completeness: body.feeAmount !== undefined && body.costAmount !== undefined ? "complete" : "incomplete"
    }
  } };
}

async function redirectTrackedLink(slug: string, request: Request, env: MonetizationEnv): Promise<Response> {
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
      AND (l.offer_id IS NULL OR c.offer_id IS NULL OR l.offer_id=c.offer_id)`).bind(slug, BRAND_ID).first<Record<string, unknown>>();
  if (!link) return json({ ok: false, error: "Tracked link tidak ditemukan." }, 404);
  const destination = String(link.destination_url ?? "");
  if (!isHttpUrl(destination)) return json({ ok: false, error: "Destination tracked link tidak valid." }, 500);
  const visitorId = request.headers.get("X-Visitor-Id") ?? undefined;
  const sessionId = request.headers.get("X-Session-Id") ?? undefined;
  try {
    await recordEvent({
      eventType: link.offer_type === "affiliate" ? "affiliate_click" : "click",
      contentItemId: link.content_item_id,
      campaignId: link.campaign_id,
      offerId: link.effective_offer_id,
      trackedLinkId: link.id,
      source: "tracked_link",
      platform: link.platform,
      visitorId,
      sessionId,
      metadata: { privacy: { rawUserAgentStored: false, rawReferrerStored: false } }
    }, env);
  } catch (error) {
    console.error(JSON.stringify({ message: "tracked_link_event_failed", slug, error: error instanceof Error ? error.message : "unknown" }));
  }
  return redirect(destination, 302);
}

async function monetizationSummary(env: MonetizationEnv, url: URL): Promise<ApiResult> {
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const days = Math.max(1, Math.min(365, Number.isFinite(daysRaw) ? Math.round(daysRaw) : 30));
  const since = `-${days} days`;
  const quality=await monetizationQualityEnabled(env);
  const eventScope=verifiedQualityFilter(quality,'event','e'),revenueScope=verifiedQualityFilter(quality,'revenue_event','r');
  const feeCompleteSql=quality?`CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q WHERE q.record_type='revenue_event'
    AND q.record_id=r.id AND q.fee_status IN ('actual','not_applicable')) OR json_extract(r.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END`
    :`CASE WHEN json_extract(r.metadata_json,'$.financialCompleteness.fee') IN ('reported','configured') THEN 1 ELSE 0 END`;
  const costCompleteSql=quality?`CASE WHEN EXISTS (SELECT 1 FROM monetization_record_quality q WHERE q.record_type='revenue_event'
    AND q.record_id=r.id AND q.cost_status IN ('actual','not_applicable')) OR json_extract(r.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END`
    :`CASE WHEN json_extract(r.metadata_json,'$.financialCompleteness.cost') IN ('reported','configured') THEN 1 ELSE 0 END`;
  const [events, revenue, offers] = await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN event_type IN ('click','affiliate_click') THEN 1 ELSE 0 END) clicks,
      SUM(CASE WHEN event_type='lead' THEN 1 ELSE 0 END) leads,
      SUM(CASE WHEN event_type='checkout' THEN 1 ELSE 0 END) checkouts,
      SUM(CASE WHEN event_type IN ('purchase','affiliate_conversion') THEN 1 ELSE 0 END) conversions
      FROM monetization_events e WHERE brand_id=?1 AND occurred_at >= datetime('now', ?2) ${eventScope}`).bind(BRAND_ID, since).first<Record<string, number>>(),
    env.DB.prepare(`SELECT
      COUNT(*) revenue_events,
      COALESCE(SUM(gross_amount),0) gross_revenue,
      COALESCE(SUM(net_amount),0) net_revenue,
      COALESCE(SUM(margin_amount),0) contribution_profit,
      SUM(${feeCompleteSql}) fee_complete_events,SUM(${costCompleteSql}) cost_complete_events
      FROM monetization_revenue_events r WHERE brand_id=?1 AND occurred_at >= datetime('now', ?2) AND status IN ('confirmed','refunded') ${revenueScope}`).bind(BRAND_ID, since).first<Record<string, number>>(),
    env.DB.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active FROM monetization_offers WHERE brand_id=?1").bind(BRAND_ID).first<Record<string, number>>()
  ]);
  return {
    status: 200,
    body: {
      ok: true,
      periodDays: days,
      dataScope: quality ? "verified-production" : "legacy-unclassified",
      offers: { total: Number(offers?.total ?? 0), active: Number(offers?.active ?? 0) },
      funnel: {
        clicks: Number(events?.clicks ?? 0), leads: Number(events?.leads ?? 0), checkouts: Number(events?.checkouts ?? 0), conversions: Number(events?.conversions ?? 0)
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

async function routeApi(request: Request, env: MonetizationEnv, url: URL): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/api/monetization/status") {
    return json({ ok: true, service: "UMKM Monetization Engine", version: "1.0.0", mode: "additive-only", brandId: BRAND_ID });
  }
  if (request.method === "GET" && url.pathname === "/api/monetization/offers") {
    const result = await listOffers(env, url); return json(result.body, result.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/offers") {
    const result = await createOffer(request, env); return json(result.body, result.status);
  }
  const offerMatch = url.pathname.match(/^\/api\/monetization\/offers\/([^/]+)$/);
  if (request.method === "PATCH" && offerMatch?.[1]) {
    const result = await updateOffer(decodeURIComponent(offerMatch[1]), request, env); return json(result.body, result.status);
  }
  if (request.method === "GET" && url.pathname === "/api/monetization/campaigns") {
    const result = await listCampaigns(env); return json(result.body, result.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/campaigns") {
    const result = await createCampaign(request, env); return json(result.body, result.status);
  }
  const campaignMatch = url.pathname.match(/^\/api\/monetization\/campaigns\/([^/]+)$/);
  if (request.method === "PATCH" && campaignMatch?.[1]) {
    const result = await updateCampaign(decodeURIComponent(campaignMatch[1]), request, env); return json(result.body, result.status);
  }
  const contentMatch = url.pathname.match(/^\/api\/monetization\/content\/([^/]+)$/);
  if (request.method === "GET" && contentMatch?.[1]) {
    const result = await getContentMonetization(decodeURIComponent(contentMatch[1]), env); return json(result.body, result.status);
  }
  if (request.method === "PUT" && contentMatch?.[1]) {
    const result = await saveContentMonetization(decodeURIComponent(contentMatch[1]), request, env); return json(result.body, result.status);
  }
  if (request.method === "GET" && url.pathname === "/api/monetization/links") {
    const result = await listTrackedLinks(env); return json(result.body, result.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/links") {
    const result = await createTrackedLink(request, env); return json(result.body, result.status);
  }
  const linkMatch = url.pathname.match(/^\/api\/monetization\/links\/([^/]+)$/);
  if (request.method === "PATCH" && linkMatch?.[1]) {
    const result = await updateTrackedLink(decodeURIComponent(linkMatch[1]), request, env); return json(result.body, result.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/events") {
    const result = await ingestEvent(request, env); return json(result.body, result.status);
  }
  if (request.method === "POST" && url.pathname === "/api/monetization/revenue") {
    const result = await ingestRevenue(request, env); return json(result.body, result.status);
  }
  if (request.method === "GET" && url.pathname === "/api/monetization/summary") {
    const result = await monetizationSummary(env, url); return json(result.body, result.status);
  }
  return null;
}

export default {
  async fetch(request: Request, env: MonetizationEnv): Promise<Response> {
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
} satisfies ExportedHandler<MonetizationEnv>;
