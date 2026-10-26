type JsonRecord = Record<string, unknown>;

type ContentDesignRow = {
  content_item_id: string;
  preset: string;
  background_color: string;
  primary_color: string;
  accent_color: string;
  text_color: string;
  heading_font: string;
  body_font: string;
  logo_asset_id: string | null;
  logo_position: string;
  logo_size: string;
  slide_assets_json: string;
  updated_at: string;
};

type DesignAssetRow = {
  id: string;
  content_item_id: string;
  kind: "logo" | "slide_image";
  slide_number: number | null;
  r2_key: string;
  mime_type: string;
  size_bytes: number;
};

type ContentRow = { id: string; title: string; status: string; body_json: string };

export type DesignResult = { status: number; body: unknown };

export type RenderDesign = {
  preset: string;
  colors: { background: string; primary: string; accent: string; text: string };
  fonts: { heading: string; body: string };
  logo: { url: string | null; position: string; size: string };
  slides: Record<string, { imageUrl: string | null; layout: string }>;
};

class DesignError extends Error {
  constructor(readonly status: number, readonly publicMessage: string) {
    super(publicMessage);
  }
}

const PUBLIC_MEDIA_BASE = "https://media.umkmnaikkelas.id";
const MAX_JSON_BYTES = 32 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const PRESETS = new Set(["brand", "minimalist", "elegant", "bold", "editorial"]);
const HEADING_FONTS = new Set(["classic", "modern", "editorial", "rounded"]);
const BODY_FONTS = new Set(["sans", "classic", "modern"]);
const LOGO_POSITIONS = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
const LOGO_SIZES = new Set(["small", "medium", "large"]);
const IMAGE_LAYOUTS = new Set(["right", "background"]);

const DEFAULT_DESIGN: RenderDesign = {
  preset: "brand",
  colors: { background: "#fffaf0", primary: "#9e1b13", accent: "#c69a3d", text: "#1b1612" },
  fonts: { heading: "classic", body: "sans" },
  logo: { url: null, position: "top-right", size: "medium" },
  slides: {}
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mediaUrl(key: string): string {
  return `${PUBLIC_MEDIA_BASE}/${key}`;
}

export async function ensureDesignSchema(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS design_assets (
      id TEXT PRIMARY KEY, content_item_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('logo','slide_image')), slide_number INTEGER,
      r2_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_design_assets_content
      ON design_assets(content_item_id, kind, created_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS content_designs (
      content_item_id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1,
      preset TEXT NOT NULL DEFAULT 'brand', background_color TEXT NOT NULL DEFAULT '#fffaf0',
      primary_color TEXT NOT NULL DEFAULT '#9e1b13', accent_color TEXT NOT NULL DEFAULT '#c69a3d',
      text_color TEXT NOT NULL DEFAULT '#1b1612', heading_font TEXT NOT NULL DEFAULT 'classic',
      body_font TEXT NOT NULL DEFAULT 'sans', logo_asset_id TEXT,
      logo_position TEXT NOT NULL DEFAULT 'top-right', logo_size TEXT NOT NULL DEFAULT 'medium',
      slide_assets_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
      FOREIGN KEY (logo_asset_id) REFERENCES design_assets(id) ON DELETE SET NULL)`)
  ]);
}

async function readLimitedBytes(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("payload_too_large");
        throw new DesignError(413, "Gambar maksimal 5 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_JSON_BYTES) throw new DesignError(413, "Konfigurasi desain terlalu besar.");
  const bytes = await readLimitedBytes(request.body, MAX_JSON_BYTES);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new DesignError(400, "Body harus berupa JSON valid."); }
}

function parseSlides(bodyJson: string): Array<{ number: number; type: string; headline: string; body: string }> {
  try {
    const value: unknown = JSON.parse(bodyJson);
    if (!isRecord(value) || !isRecord(value.carousel) || !Array.isArray(value.carousel.slides)) return [];
    return value.carousel.slides.flatMap((slide) => {
      if (!isRecord(slide) || typeof slide.number !== "number" || typeof slide.type !== "string" || typeof slide.headline !== "string" || typeof slide.body !== "string") return [];
      return [{ number: slide.number, type: slide.type, headline: slide.headline, body: slide.body }];
    });
  } catch { return []; }
}

async function getContent(env: Env, contentItemId: string): Promise<ContentRow> {
  if (!UUID_PATTERN.test(contentItemId)) throw new DesignError(400, "Content item tidak valid.");
  const content = await env.DB.prepare(
    `SELECT id, title, status, body_json FROM content_items WHERE id = ? LIMIT 1`
  ).bind(contentItemId).first<ContentRow>();
  if (!content) throw new DesignError(404, "Konten tidak ditemukan.");
  return content;
}

function assertEditable(content: ContentRow): void {
  if (content.status === "approved") throw new DesignError(409, "Tarik persetujuan sebelum mengubah desain.");
  if (content.status !== "draft" && content.status !== "review") throw new DesignError(409, "Status konten tidak dapat diedit desainnya.");
}

function parseSlideRefs(value: unknown, slideCount: number): Record<string, { assetId: string | null; layout: string }> {
  if (!isRecord(value)) throw new DesignError(400, "Konfigurasi gambar slide tidak valid.");
  const result: Record<string, { assetId: string | null; layout: string }> = {};
  for (const [key, raw] of Object.entries(value)) {
    const number = Number(key);
    if (!Number.isInteger(number) || number < 1 || number > slideCount || !isRecord(raw)) throw new DesignError(400, "Nomor slide tidak valid.");
    const assetId = raw.assetId === null || raw.assetId === undefined ? null : raw.assetId;
    const layout = raw.layout ?? "right";
    if (assetId !== null && (typeof assetId !== "string" || !UUID_PATTERN.test(assetId))) throw new DesignError(400, "Aset slide tidak valid.");
    if (typeof layout !== "string" || !IMAGE_LAYOUTS.has(layout)) throw new DesignError(400, "Layout gambar tidak valid.");
    result[String(number)] = { assetId, layout };
  }
  return result;
}

async function validateOwnedAssets(env: Env, contentItemId: string, logoAssetId: string | null, slides: Record<string, { assetId: string | null; layout: string }>): Promise<void> {
  const ids = [logoAssetId, ...Object.values(slides).map((item) => item.assetId)].filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;
  const unique = [...new Set(ids)];
  const placeholders = unique.map(() => "?").join(",");
  const query = await env.DB.prepare(
    `SELECT id, kind FROM design_assets WHERE content_item_id = ? AND id IN (${placeholders})`
  ).bind(contentItemId, ...unique).all<{ id: string; kind: string }>();
  if (query.results.length !== unique.length) throw new DesignError(400, "Aset desain bukan milik konten ini.");
  if (logoAssetId && query.results.find((item) => item.id === logoAssetId)?.kind !== "logo") throw new DesignError(400, "Aset logo tidak valid.");
  for (const item of Object.values(slides)) {
    if (item.assetId && query.results.find((row) => row.id === item.assetId)?.kind !== "slide_image") throw new DesignError(400, "Aset gambar slide tidak valid.");
  }
}

function parseDesignInput(value: unknown, slideCount: number) {
  if (!isRecord(value) || !isRecord(value.colors) || !isRecord(value.fonts) || !isRecord(value.logo)) throw new DesignError(400, "Konfigurasi desain tidak valid.");
  const preset = value.preset;
  const background = value.colors.background;
  const primary = value.colors.primary;
  const accent = value.colors.accent;
  const text = value.colors.text;
  const heading = value.fonts.heading;
  const body = value.fonts.body;
  const logoAssetId = value.logo.assetId === null || value.logo.assetId === undefined ? null : value.logo.assetId;
  const logoPosition = value.logo.position;
  const logoSize = value.logo.size;
  if (typeof preset !== "string" || !PRESETS.has(preset)) throw new DesignError(400, "Preset desain tidak valid.");
  for (const color of [background, primary, accent, text]) if (typeof color !== "string" || !HEX_PATTERN.test(color)) throw new DesignError(400, "Warna harus memakai format hex.");
  if (typeof heading !== "string" || !HEADING_FONTS.has(heading) || typeof body !== "string" || !BODY_FONTS.has(body)) throw new DesignError(400, "Pilihan huruf tidak valid.");
  if (logoAssetId !== null && (typeof logoAssetId !== "string" || !UUID_PATTERN.test(logoAssetId))) throw new DesignError(400, "Logo tidak valid.");
  if (typeof logoPosition !== "string" || !LOGO_POSITIONS.has(logoPosition) || typeof logoSize !== "string" || !LOGO_SIZES.has(logoSize)) throw new DesignError(400, "Posisi atau ukuran logo tidak valid.");
  const slides = parseSlideRefs(value.slides ?? {}, slideCount);
  return { preset, background, primary, accent, text, heading, body, logoAssetId, logoPosition, logoSize, slides };
}

async function loadResolvedDesign(env: Env, contentItemId: string): Promise<RenderDesign & { logoAssetId: string | null; slideRefs: Record<string, { assetId: string | null; layout: string }> }> {
  const row = await env.DB.prepare(`SELECT * FROM content_designs WHERE content_item_id = ? LIMIT 1`).bind(contentItemId).first<ContentDesignRow>();
  if (!row) return { ...DEFAULT_DESIGN, colors: { ...DEFAULT_DESIGN.colors }, fonts: { ...DEFAULT_DESIGN.fonts }, logo: { ...DEFAULT_DESIGN.logo }, slides: {}, logoAssetId: null, slideRefs: {} };
  let slideRefs: Record<string, { assetId: string | null; layout: string }> = {};
  try { const raw: unknown = JSON.parse(row.slide_assets_json); if (isRecord(raw)) slideRefs = raw as Record<string, { assetId: string | null; layout: string }>; } catch { slideRefs = {}; }
  const ids = [row.logo_asset_id, ...Object.values(slideRefs).map((item) => item?.assetId)].filter((id): id is string => typeof id === "string");
  const assets = new Map<string, DesignAssetRow>();
  if (ids.length > 0) {
    const unique = [...new Set(ids)];
    const placeholders = unique.map(() => "?").join(",");
    const query = await env.DB.prepare(`SELECT id, content_item_id, kind, slide_number, r2_key, mime_type, size_bytes FROM design_assets WHERE content_item_id = ? AND id IN (${placeholders})`).bind(contentItemId, ...unique).all<DesignAssetRow>();
    for (const asset of query.results) assets.set(asset.id, asset);
  }
  const slides: Record<string, { imageUrl: string | null; layout: string }> = {};
  for (const [number, ref] of Object.entries(slideRefs)) slides[number] = { imageUrl: ref.assetId && assets.get(ref.assetId) ? mediaUrl(assets.get(ref.assetId)!.r2_key) : null, layout: IMAGE_LAYOUTS.has(ref.layout) ? ref.layout : "right" };
  const logoAsset = row.logo_asset_id ? assets.get(row.logo_asset_id) : undefined;
  return {
    preset: PRESETS.has(row.preset) ? row.preset : DEFAULT_DESIGN.preset,
    colors: { background: row.background_color, primary: row.primary_color, accent: row.accent_color, text: row.text_color },
    fonts: { heading: row.heading_font, body: row.body_font },
    logo: { url: logoAsset ? mediaUrl(logoAsset.r2_key) : null, position: row.logo_position, size: row.logo_size },
    slides, logoAssetId: row.logo_asset_id, slideRefs
  };
}

export async function getRenderDesign(env: Env, contentItemId: string): Promise<RenderDesign> {
  await ensureDesignSchema(env);
  const design = await loadResolvedDesign(env, contentItemId);
  return { preset: design.preset, colors: design.colors, fonts: design.fonts, logo: design.logo, slides: design.slides };
}

export async function getContentDesign(env: Env, contentItemId: string): Promise<DesignResult> {
  try {
    await ensureDesignSchema(env);
    const content = await getContent(env, contentItemId);
    const design = await loadResolvedDesign(env, contentItemId);
    return { status: 200, body: { ok: true, content: { id: content.id, title: content.title, status: content.status, slides: parseSlides(content.body_json) }, design: { ...design, logo: { ...design.logo, assetId: design.logoAssetId }, slides: Object.fromEntries(Object.entries(design.slides).map(([number, item]) => [number, { ...item, assetId: design.slideRefs[number]?.assetId ?? null }])) }, options: { presets: [...PRESETS], headingFonts: [...HEADING_FONTS], bodyFonts: [...BODY_FONTS], logoPositions: [...LOGO_POSITIONS], logoSizes: [...LOGO_SIZES], imageLayouts: [...IMAGE_LAYOUTS] } } };
  } catch (error) {
    const status = error instanceof DesignError ? error.status : 500;
    const message = error instanceof DesignError ? error.publicMessage : "Desain gagal dimuat.";
    console.error(JSON.stringify({ message: "design_read_failed", contentItemId, error: error instanceof Error ? error.message : "Unknown" }));
    return { status, body: { ok: false, error: message } };
  }
}

export async function saveContentDesign(request: Request, env: Env, contentItemId: string): Promise<DesignResult> {
  const requestId = crypto.randomUUID();
  try {
    await ensureDesignSchema(env);
    const content = await getContent(env, contentItemId);
    assertEditable(content);
    const parsed = parseDesignInput(await readJson(request), parseSlides(content.body_json).length);
    await validateOwnedAssets(env, contentItemId, parsed.logoAssetId, parsed.slides);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO content_designs
        (content_item_id, preset, background_color, primary_color, accent_color, text_color, heading_font, body_font, logo_asset_id, logo_position, logo_size, slide_assets_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(content_item_id) DO UPDATE SET version = version + 1, preset = excluded.preset,
        background_color = excluded.background_color, primary_color = excluded.primary_color,
        accent_color = excluded.accent_color, text_color = excluded.text_color,
        heading_font = excluded.heading_font, body_font = excluded.body_font,
        logo_asset_id = excluded.logo_asset_id, logo_position = excluded.logo_position,
        logo_size = excluded.logo_size, slide_assets_json = excluded.slide_assets_json,
        updated_at = CURRENT_TIMESTAMP`).bind(contentItemId, parsed.preset, parsed.background, parsed.primary, parsed.accent, parsed.text, parsed.heading, parsed.body, parsed.logoAssetId, parsed.logoPosition, parsed.logoSize, JSON.stringify(parsed.slides)),
      env.DB.prepare(`INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
        VALUES ('design.saved', 'content_item', ?, 'success', 'Konfigurasi Design Studio disimpan; render ulang diwajibkan.', ?)`)
        .bind(contentItemId, JSON.stringify({ preset: parsed.preset, requestId }))
    ]);
    return { status: 200, body: { ok: true, requestId, contentItemId, requiresRender: true } };
  } catch (error) {
    const status = error instanceof DesignError ? error.status : 500;
    const message = error instanceof DesignError ? error.publicMessage : "Desain gagal disimpan.";
    console.error(JSON.stringify({ message: "design_save_failed", requestId, contentItemId, status, error: error instanceof Error ? error.message : "Unknown" }));
    return { status, body: { ok: false, requestId, error: message } };
  }
}

function detectImage(bytes: Uint8Array, declared: string): { mime: string; extension: string } {
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (png && declared === "image/png") return { mime: declared, extension: "png" };
  if (jpeg && declared === "image/jpeg") return { mime: declared, extension: "jpg" };
  if (webp && declared === "image/webp") return { mime: declared, extension: "webp" };
  throw new DesignError(415, "File harus PNG, JPG, atau WebP yang valid.");
}

export async function uploadDesignAsset(request: Request, env: Env, contentItemId: string): Promise<DesignResult> {
  const requestId = crypto.randomUUID();
  try {
    await ensureDesignSchema(env);
    const content = await getContent(env, contentItemId);
    assertEditable(content);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const slideNumber = Number(url.searchParams.get("slide") ?? 0);
    const slideCount = parseSlides(content.body_json).length;
    if (kind !== "logo" && kind !== "slide_image") throw new DesignError(400, "Jenis aset tidak valid.");
    if (kind === "slide_image" && (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > slideCount)) throw new DesignError(400, "Nomor slide tidak valid.");
    const declaredSize = Number(request.headers.get("Content-Length") ?? 0);
    if (declaredSize > MAX_IMAGE_BYTES) throw new DesignError(413, "Gambar maksimal 5 MB.");
    const bytes = await readLimitedBytes(request.body, MAX_IMAGE_BYTES);
    if (bytes.byteLength === 0) throw new DesignError(400, "File gambar kosong.");
    const file = detectImage(bytes, (request.headers.get("Content-Type") ?? "").split(";")[0]!.toLowerCase());
    const assetId = crypto.randomUUID();
    const key = `design-assets/${contentItemId}/${kind}/${assetId}.${file.extension}`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: file.mime, cacheControl: "public,max-age=31536000,immutable" }, customMetadata: { contentItemId, kind, requestId } });
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO design_assets (id, content_item_id, kind, slide_number, r2_key, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(assetId, contentItemId, kind, kind === "slide_image" ? slideNumber : null, key, file.mime, bytes.byteLength),
        env.DB.prepare(`INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
          VALUES ('design.asset_uploaded', 'content_item', ?, 'success', 'Aset Design Studio diunggah ke R2.', ?)`)
          .bind(contentItemId, JSON.stringify({ assetId, kind, slideNumber: kind === "slide_image" ? slideNumber : null, size: bytes.byteLength }))
      ]);
    } catch (databaseError) {
      await env.MEDIA.delete(key);
      throw databaseError;
    }
    return { status: 201, body: { ok: true, requestId, asset: { id: assetId, kind, slideNumber: kind === "slide_image" ? slideNumber : null, url: mediaUrl(key), mimeType: file.mime, sizeBytes: bytes.byteLength }, requiresRender: true } };
  } catch (error) {
    const status = error instanceof DesignError ? error.status : 500;
    const message = error instanceof DesignError ? error.publicMessage : "Gambar gagal diunggah.";
    console.error(JSON.stringify({ message: "design_upload_failed", requestId, contentItemId, status, error: error instanceof Error ? error.message : "Unknown" }));
    return { status, body: { ok: false, requestId, error: message } };
  }
}
