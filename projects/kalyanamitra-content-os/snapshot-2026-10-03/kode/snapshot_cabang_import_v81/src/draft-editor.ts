import { resolveContentSlides, type ContentSlide } from "./design-engine";

type JsonRecord = Record<string, unknown>;

type ContentRow = {
  id: string;
  title: string;
  status: string;
  body_json: string;
  format: string;
  platform: string;
  version: number;
  updated_at: string;
};

type DraftSourceKind = "threads" | "carousel";

export type DraftEditSlide = ContentSlide & {
  headlineEditable: boolean;
};

export type EditableDraft = {
  id: string;
  title: string;
  status: string;
  format: string;
  platform: string;
  version: number;
  updatedAt: string;
  sourceKind: DraftSourceKind;
  slides: DraftEditSlide[];
  limits: {
    title: number;
    headline: number;
    body: number;
  };
};

export type DraftEditResult = {
  status: number;
  body: unknown;
};

type DraftEditInput = {
  expectedVersion: number;
  title: string;
  slides: Array<{ number: number; headline: string; body: string }>;
};

export class DraftEditError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
    readonly code: string
  ) {
    super(publicMessage);
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_TITLE_LENGTH = 240;
const MAX_HEADLINE_LENGTH = 240;
const MAX_THREAD_BODY_LENGTH = 500;
const MAX_CAROUSEL_BODY_LENGTH = 2_000;
const KALYANAMITRA_NAMESPACE = "ruang-kalyanamitra";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBody(bodyJson: string): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(bodyJson);
  } catch {
    throw new DraftEditError(422, "JSON draft tidak valid.", "invalid-draft-json");
  }
  if (!isRecord(value)) {
    throw new DraftEditError(422, "Struktur draft tidak valid.", "invalid-draft-structure");
  }
  return value;
}

function canonicalText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") {
    throw new DraftEditError(400, label + " wajib berupa teks.", "invalid-edit-payload");
  }
  const result = value.normalize("NFC").trim();
  if (result.length < 1 || result.length > maximum) {
    throw new DraftEditError(
      400,
      label + " harus 1–" + maximum + " karakter.",
      "invalid-edit-payload"
    );
  }
  return result;
}

function sourceKind(body: JsonRecord): DraftSourceKind {
  if (isRecord(body.carousel) && Array.isArray(body.carousel.slides)) return "carousel";
  if (Array.isArray(body.threadsPosts)) return "threads";
  throw new DraftEditError(422, "Draft ini belum mendukung editor isi.", "unsupported-draft-format");
}

function isKalyanamitra(body: JsonRecord): boolean {
  const metadata = isRecord(body.metadata) ? body.metadata : {};
  return metadata.namespace === KALYANAMITRA_NAMESPACE || body.namespace === KALYANAMITRA_NAMESPACE;
}

function assertKalyanamitraSafety(body: JsonRecord): void {
  if (!isKalyanamitra(body)) return;
  const flags = Array.isArray(body.riskFlags) ? body.riskFlags : [];
  if (
    body.contentStatus !== "draft" ||
    body.publisherMode !== "draft-only" ||
    body.automaticPublish !== false ||
    body.humanApprovalRequired !== true ||
    !flags.includes("do-not-publish")
  ) {
    throw new DraftEditError(
      409,
      "Guard keselamatan draft Kalyanamitra tidak lengkap.",
      "draft-safety-guard-failed"
    );
  }
}

function editableSlides(body: JsonRecord): { kind: DraftSourceKind; slides: DraftEditSlide[] } {
  assertKalyanamitraSafety(body);
  const kind = sourceKind(body);
  const slides = resolveContentSlides(body);
  if (slides.length < 5 || slides.length > 9) {
    throw new DraftEditError(422, "Draft harus berisi 5–9 slide.", "invalid-slide-count");
  }
  if (kind === "threads" && isKalyanamitra(body) && (slides.length < 6 || slides.length > 8)) {
    throw new DraftEditError(422, "Draft Kalyanamitra harus berisi 6–8 post.", "invalid-thread-count");
  }
  return {
    kind,
    slides: slides.map((slide) => ({ ...slide, headlineEditable: kind === "carousel" }))
  };
}

function toEditableDraft(row: ContentRow): EditableDraft {
  const body = parseBody(row.body_json);
  const resolved = editableSlides(body);
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    format: row.format,
    platform: row.platform,
    version: Number(row.version),
    updatedAt: row.updated_at,
    sourceKind: resolved.kind,
    slides: resolved.slides,
    limits: {
      title: MAX_TITLE_LENGTH,
      headline: MAX_HEADLINE_LENGTH,
      body: resolved.kind === "threads" ? MAX_THREAD_BODY_LENGTH : MAX_CAROUSEL_BODY_LENGTH
    }
  };
}

function validateInput(value: unknown, current: EditableDraft): DraftEditInput {
  if (!isRecord(value)) {
    throw new DraftEditError(400, "Body edit harus berupa object JSON.", "invalid-edit-payload");
  }
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "expectedVersion,slides,title") {
    throw new DraftEditError(400, "Field edit tidak valid.", "invalid-edit-payload");
  }
  if (
    typeof value.expectedVersion !== "number" ||
    !Number.isInteger(value.expectedVersion) ||
    value.expectedVersion < 1
  ) {
    throw new DraftEditError(400, "Versi draft tidak valid.", "invalid-edit-payload");
  }
  if (!Array.isArray(value.slides) || value.slides.length !== current.slides.length) {
    throw new DraftEditError(
      400,
      "Jumlah slide tidak boleh diubah melalui editor isi.",
      "invalid-edit-payload"
    );
  }

  const title = canonicalText(value.title, "Judul konten", MAX_TITLE_LENGTH);
  const bodyMaximum = current.limits.body;
  const slides = value.slides.map((rawSlide, index) => {
    if (!isRecord(rawSlide)) {
      throw new DraftEditError(400, "Data slide tidak valid.", "invalid-edit-payload");
    }
    const slideKeys = Object.keys(rawSlide).sort().join(",");
    if (slideKeys !== "body,headline,number" || rawSlide.number !== index + 1) {
      throw new DraftEditError(400, "Urutan atau field slide tidak valid.", "invalid-edit-payload");
    }
    const currentSlide = current.slides[index];
    if (!currentSlide) {
      throw new DraftEditError(400, "Slide tidak ditemukan.", "invalid-edit-payload");
    }
    const headline = currentSlide.headlineEditable
      ? canonicalText(rawSlide.headline, "Judul slide " + (index + 1), MAX_HEADLINE_LENGTH)
      : currentSlide.headline;
    if (!currentSlide.headlineEditable && rawSlide.headline !== currentSlide.headline) {
      throw new DraftEditError(
        400,
        "Judul struktur utas tidak dapat diubah.",
        "thread-headline-read-only"
      );
    }
    return {
      number: index + 1,
      headline,
      body: canonicalText(rawSlide.body, "Isi slide " + (index + 1), bodyMaximum)
    };
  });
  return { expectedVersion: Number(value.expectedVersion), title, slides };
}

function readExpectedVersion(value: unknown): number {
  if (
    !isRecord(value) ||
    typeof value.expectedVersion !== "number" ||
    !Number.isInteger(value.expectedVersion) ||
    value.expectedVersion < 1
  ) {
    throw new DraftEditError(400, "Versi draft tidak valid.", "invalid-edit-payload");
  }
  return value.expectedVersion;
}

export function applyDraftContentEdit(
  bodyJson: string,
  title: string,
  slides: Array<{ number: number; headline: string; body: string }>
): string {
  const body = parseBody(bodyJson);
  const resolved = editableSlides(body);
  if (slides.length !== resolved.slides.length) {
    throw new DraftEditError(400, "Jumlah slide tidak boleh berubah.", "invalid-edit-payload");
  }

  const updated: JsonRecord = { ...body, title };
  if (resolved.kind === "carousel") {
    const carousel = body.carousel as JsonRecord;
    const rawSlides = carousel.slides as unknown[];
    const nextSlides = rawSlides.map((rawSlide, index) => {
      if (!isRecord(rawSlide)) {
        throw new DraftEditError(422, "Struktur slide asli tidak valid.", "invalid-draft-structure");
      }
      const editedSlide = slides[index];
      if (!editedSlide) {
        throw new DraftEditError(400, "Slide tidak ditemukan.", "invalid-edit-payload");
      }
      return { ...rawSlide, headline: editedSlide.headline, body: editedSlide.body };
    });
    updated.carousel = { ...carousel, slides: nextSlides };
    return JSON.stringify(updated);
  }

  const postTexts = slides.map((slide) => slide.body);
  updated.threadsPosts = postTexts;
  updated.hook = postTexts[0];

  if (isRecord(body.canonicalDraft)) {
    const canonicalDraft = body.canonicalDraft;
    const canonicalPosts = Array.isArray(canonicalDraft.posts) ? canonicalDraft.posts : [];
    if (isKalyanamitra(body) && canonicalPosts.length !== postTexts.length) {
      throw new DraftEditError(
        422,
        "Canonical draft tidak sinkron dengan jumlah post.",
        "canonical-draft-mismatch"
      );
    }
    const nextCanonicalPosts = canonicalPosts.map((post, index) =>
      isRecord(post) ? { ...post, text: postTexts[index] } : post
    );
    updated.canonicalDraft = {
      ...canonicalDraft,
      title,
      selected_hook: postTexts[0],
      posts: nextCanonicalPosts
    };
    const ctaIndex = nextCanonicalPosts.findIndex((post) => isRecord(post) && post.role === "cta");
    if (ctaIndex >= 0) updated.cta = postTexts[ctaIndex];
  }
  return JSON.stringify(updated);
}

async function readLimitedText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let output = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel("payload_too_large");
        throw new DraftEditError(413, "Payload edit terlalu besar.", "payload-too-large");
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } catch (error) {
    if (error instanceof DraftEditError) throw error;
    throw new DraftEditError(400, "Payload edit bukan UTF-8 valid.", "invalid-encoding");
  } finally {
    reader.releaseLock();
  }
}

async function getContentRow(env: Env, contentItemId: string): Promise<ContentRow> {
  if (!UUID_PATTERN.test(contentItemId)) {
    throw new DraftEditError(400, "Content item tidak valid.", "invalid-content-id");
  }
  const row = await env.DB.prepare(
    [
      "SELECT id, title, status, body_json, format, platform, version, updated_at",
      "FROM content_items WHERE id = ? LIMIT 1"
    ].join(" ")
  ).bind(contentItemId).first<ContentRow>();
  if (!row) throw new DraftEditError(404, "Draft konten tidak ditemukan.", "content-not-found");
  return row;
}

function publicFailure(error: unknown, requestId: string): DraftEditResult {
  const status = error instanceof DraftEditError ? error.status : 500;
  const message = error instanceof DraftEditError ? error.publicMessage : "Editor isi mengalami kesalahan.";
  const code = error instanceof DraftEditError ? error.code : "internal-error";
  const internal = error instanceof Error ? error.message : "Unknown error";
  console.error(JSON.stringify({ message: "draft_edit_failed", requestId, status, code, error: internal }));
  return {
    status,
    body: {
      ok: false,
      request_id: requestId,
      code,
      error: message,
      publisher_mode: "draft-only",
      automatic_publish: false,
      human_approval_required: true
    }
  };
}

export async function getDraftContent(env: Env, contentItemId: string): Promise<DraftEditResult> {
  const requestId = crypto.randomUUID();
  try {
    const row = await getContentRow(env, contentItemId);
    const content = toEditableDraft(row);
    return {
      status: 200,
      body: {
        ok: true,
        request_id: requestId,
        content,
        editable: content.status === "draft" || content.status === "review",
        requires_render_after_edit: true,
        publisher_mode: "draft-only",
        automatic_publish: false,
        human_approval_required: true
      }
    };
  } catch (error) {
    return publicFailure(error, requestId);
  }
}

export async function updateDraftContent(
  request: Request,
  env: Env,
  contentItemId: string
): Promise<DraftEditResult> {
  const requestId = crypto.randomUUID();
  try {
    const declared = Number(request.headers.get("Content-Length") ?? 0);
    if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
      throw new DraftEditError(413, "Payload edit terlalu besar.", "payload-too-large");
    }

    const row = await getContentRow(env, contentItemId);
    if (row.status === "approved") {
      throw new DraftEditError(
        409,
        "Tarik persetujuan sebelum mengubah isi.",
        "approval-must-be-revoked"
      );
    }
    if (row.status !== "draft" && row.status !== "review") {
      throw new DraftEditError(409, "Status konten tidak dapat diedit.", "content-not-editable");
    }

    const raw = await readLimitedText(request.body);
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new DraftEditError(400, "Body harus berupa JSON valid.", "invalid-json");
    }

    const current = toEditableDraft(row);
    const expectedVersion = readExpectedVersion(value);
    if (expectedVersion !== current.version) {
      throw new DraftEditError(
        409,
        "Draft sudah berubah. Muat ulang editor sebelum menyimpan.",
        "version-conflict"
      );
    }
    const input = validateInput(value, current);

    const unchanged =
      input.title === current.title &&
      input.slides.every((slide, index) => {
        const currentSlide = current.slides[index];
        return Boolean(
          currentSlide &&
          slide.headline === currentSlide.headline &&
          slide.body === currentSlide.body
        );
      });
    if (unchanged) {
      return {
        status: 200,
        body: {
          ok: true,
          request_id: requestId,
          unchanged: true,
          content: current,
          render_invalidated: 0,
          publisher_mode: "draft-only",
          automatic_publish: false,
          human_approval_required: true
        }
      };
    }

    const nextVersion = current.version + 1;
    const editedAt = new Date().toISOString();
    const editedBody = parseBody(applyDraftContentEdit(row.body_json, input.title, input.slides));
    editedBody._contentEditor = {
      requestId,
      editedAt,
      previousVersion: current.version,
      version: nextVersion,
      requiresRender: true
    };
    const bodyJson = JSON.stringify(editedBody);
    const audit = JSON.stringify({
      previousVersion: current.version,
      version: nextVersion,
      slideCount: input.slides.length,
      sourceKind: current.sourceKind,
      renderInvalidated: true,
      publisherMode: "draft-only",
      automaticPublish: false,
      humanApprovalRequired: true
    });

    const results = await env.DB.batch([
      env.DB.prepare(
        [
          "UPDATE content_items SET title = ?, body_json = ?, status = 'draft',",
          "version = version + 1, updated_at = CURRENT_TIMESTAMP",
          "WHERE id = ? AND version = ? AND status IN ('draft', 'review')"
        ].join(" ")
      ).bind(input.title, bodyJson, contentItemId, current.version),
      env.DB.prepare(
        [
          "UPDATE render_jobs",
          "SET status = 'cancelled',",
          "error_message = 'Dibatalkan otomatis karena isi draft diedit.',",
          "updated_at = CURRENT_TIMESTAMP",
          "WHERE content_item_id = ?",
          "AND status IN ('queued', 'running', 'completed')",
          "AND EXISTS (SELECT 1 FROM content_items",
          "WHERE id = ? AND version = ?",
          "AND json_extract(body_json, '$._contentEditor.requestId') = ?)"
        ].join(" ")
      ).bind(contentItemId, contentItemId, nextVersion, requestId),
      env.DB.prepare(
        [
          "INSERT INTO activity_logs",
          "(event_type, entity_type, entity_id, status, message, metadata_json)",
          "SELECT 'content.edited', 'content_item', ?, 'success',",
          "'Isi draft diperbarui; render lama dibatalkan dan persetujuan manusia tetap wajib.', ?",
          "WHERE EXISTS (SELECT 1 FROM content_items",
          "WHERE id = ? AND version = ?",
          "AND json_extract(body_json, '$._contentEditor.requestId') = ?)"
        ].join(" ")
      ).bind(contentItemId, audit, contentItemId, nextVersion, requestId)
    ]);

    const updated = Number(results[0]?.meta?.changes ?? 0);
    if (updated !== 1) {
      throw new DraftEditError(
        409,
        "Draft berubah saat disimpan. Muat ulang editor.",
        "version-conflict"
      );
    }

    const content = toEditableDraft({
      ...row,
      title: input.title,
      body_json: bodyJson,
      status: "draft",
      version: nextVersion,
      updated_at: editedAt
    });
    return {
      status: 200,
      body: {
        ok: true,
        request_id: requestId,
        unchanged: false,
        content,
        render_invalidated: Number(results[1]?.meta?.changes ?? 0),
        requires_render_after_edit: true,
        publisher_mode: "draft-only",
        automatic_publish: false,
        human_approval_required: true
      }
    };
  } catch (error) {
    return publicFailure(error, requestId);
  }
}
