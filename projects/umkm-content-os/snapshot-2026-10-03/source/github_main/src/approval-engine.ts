import { ensureDesignSchema } from "./design-engine";

type ApprovalAction = "approve" | "revoke";

type ContentApprovalRow = {
  id: string;
  title: string;
  status: string;
};

type PlatformAssetCounts = {
  instagram_count: number;
  tiktok_count: number;
};

export type ApprovalResult = {
  status: number;
  body: unknown;
};

class ApprovalError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string
  ) {
    super(publicMessage);
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BYTES = 4 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readLimitedText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return "";

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let output = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel("payload_too_large");
        throw new ApprovalError(413, "Payload persetujuan terlalu besar.");
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    reader.releaseLock();
  }
}

function parseAction(value: unknown): ApprovalAction {
  if (!isRecord(value) || (value.action !== "approve" && value.action !== "revoke")) {
    throw new ApprovalError(400, "Aksi persetujuan tidak valid.");
  }
  return value.action;
}

async function getLatestCompletedAssetCounts(env: Env, contentItemId: string): Promise<PlatformAssetCounts> {
  const row = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN a.platform = 'instagram' THEN 1 ELSE 0 END) AS instagram_count,
       SUM(CASE WHEN a.platform = 'tiktok' THEN 1 ELSE 0 END) AS tiktok_count
     FROM assets a
     WHERE a.render_job_id = (
       SELECT id
       FROM render_jobs
       WHERE content_item_id = ? AND status = 'completed'
         AND updated_at >= COALESCE(
           (SELECT updated_at FROM content_designs WHERE content_item_id = ?),
           (SELECT created_at FROM content_items WHERE id = ?)
         )
       ORDER BY updated_at DESC
       LIMIT 1
     )`
  ).bind(contentItemId, contentItemId, contentItemId).first<PlatformAssetCounts>();

  return {
    instagram_count: Number(row?.instagram_count ?? 0),
    tiktok_count: Number(row?.tiktok_count ?? 0)
  };
}

function hasCompleteCarousel(counts: PlatformAssetCounts): boolean {
  return (
    counts.instagram_count >= 5 &&
    counts.instagram_count <= 9 &&
    counts.tiktok_count === counts.instagram_count
  );
}

export async function updateContentApproval(
  request: Request,
  env: Env,
  contentItemId: string
): Promise<ApprovalResult> {
  const requestId = crypto.randomUUID();

  try {
    await ensureDesignSchema(env);
    if (!UUID_PATTERN.test(contentItemId)) throw new ApprovalError(400, "Content item tidak valid.");

    const contentLength = Number(request.headers.get("Content-Length") ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) throw new ApprovalError(413, "Payload persetujuan terlalu besar.");

    const requestText = await readLimitedText(request.body);
    let requestValue: unknown;
    try {
      requestValue = JSON.parse(requestText);
    } catch {
      throw new ApprovalError(400, "Body harus berupa JSON valid.");
    }
    const action = parseAction(requestValue);

    const content = await env.DB.prepare(
      `SELECT id, title, status FROM content_items WHERE id = ? LIMIT 1`
    ).bind(contentItemId).first<ContentApprovalRow>();
    if (!content) throw new ApprovalError(404, "Konten tidak ditemukan.");

    if (action === "approve") {
      if (content.status === "approved") {
        return { status: 200, body: { ok: true, requestId, contentItemId, status: "approved", unchanged: true } };
      }
      if (content.status !== "draft" && content.status !== "review") {
        throw new ApprovalError(409, "Status konten tidak dapat disetujui.");
      }

      const counts = await getLatestCompletedAssetCounts(env, contentItemId);
      if (!hasCompleteCarousel(counts)) {
        throw new ApprovalError(409, "Carousel Instagram dan TikTok harus selesai sebelum konten disetujui.");
      }

      await env.DB.batch([
        env.DB.prepare(
          `UPDATE content_items SET status = 'approved', updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status IN ('draft', 'review')`
        ).bind(contentItemId),
        env.DB.prepare(
          `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
           VALUES ('content.approved', 'content_item', ?, 'success', 'Konten disetujui untuk tahap Publisher.', ?)`
        ).bind(contentItemId, JSON.stringify({ title: content.title, assets: counts }))
      ]);

      return { status: 200, body: { ok: true, requestId, contentItemId, status: "approved" } };
    }

    if (content.status === "draft") {
      return { status: 200, body: { ok: true, requestId, contentItemId, status: "draft", unchanged: true } };
    }
    if (content.status !== "approved") {
      throw new ApprovalError(409, "Persetujuan hanya dapat ditarik dari konten berstatus approved.");
    }

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE content_items SET status = 'draft', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'approved'`
      ).bind(contentItemId),
      env.DB.prepare(
        `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message)
         VALUES ('content.approval_revoked', 'content_item', ?, 'success', 'Persetujuan konten ditarik kembali.')`
      ).bind(contentItemId)
    ]);

    return { status: 200, body: { ok: true, requestId, contentItemId, status: "draft" } };
  } catch (error) {
    const status = error instanceof ApprovalError ? error.status : 500;
    const publicMessage = error instanceof ApprovalError ? error.publicMessage : "Persetujuan konten gagal diproses.";
    const internalMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(JSON.stringify({ message: "content_approval_failed", requestId, contentItemId, status, error: internalMessage }));
    return { status, body: { ok: false, requestId, error: publicMessage } };
  }
}
