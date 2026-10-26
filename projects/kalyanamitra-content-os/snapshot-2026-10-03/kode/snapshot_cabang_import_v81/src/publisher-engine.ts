type JsonRecord = Record<string, unknown>;

type PublisherPlatform = "instagram" | "tiktok" | "threads";

type PublisherAccount = {
  id: string;
  name: string;
  username: string;
  type: string;
  isConnected: boolean;
};

type PublisherContentRow = {
  id: string;
  title: string;
  status: string;
  body_json: string;
};

type PublisherAssetRow = {
  platform: string;
  public_url: string | null;
  r2_key: string;
};

type PublisherActivityRow = {
  entity_id: string | null;
  status: string;
  message: string;
  metadata_json: string;
  created_at: string;
};

export type PublisherRuntimeStatus = {
  configured: boolean;
  provider: "Repliz";
  mode: "draft-only";
  endpoint: string;
  supportedPlatforms: PublisherPlatform[];
};

export type PublisherResult = {
  status: number;
  body: unknown;
};

class PublisherError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string
  ) {
    super(publicMessage);
  }
}

const REPLIZ_API_BASE = "https://api.repliz.com";
const REPLIZ_ACCESS_KEY = "REPLIZ_ACCESS_KEY";
const REPLIZ_SECRET_KEY = "REPLIZ_SECRET_KEY";
const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_REPLIZ_BYTES = 256 * 1024;
const MAX_TEXT_BYTES = 24 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SUPPORTED_PLATFORMS = new Set<PublisherPlatform>(["instagram", "tiktok", "threads"]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBinding(env: Env, name: string): string | undefined {
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function limitedText(value: string, maxBytes = MAX_TEXT_BYTES): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maxBytes) return value;
  return new TextDecoder().decode(bytes.slice(0, maxBytes));
}

function limitedCharacters(value: string, maxCharacters: number): string {
  return Array.from(value).slice(0, maxCharacters).join("").trimEnd();
}

async function readLimitedText(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string> {
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
      if (size > maxBytes) {
        await reader.cancel("payload_too_large");
        throw new PublisherError(502, "Respons Repliz terlalu besar.");
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    reader.releaseLock();
  }
}

function getPublisherCredentials(env: Env): { authorization: string } | null {
  const accessKey = readBinding(env, REPLIZ_ACCESS_KEY);
  const secretKey = readBinding(env, REPLIZ_SECRET_KEY);
  if (!accessKey || !secretKey) return null;

  return { authorization: `Basic ${btoa(`${accessKey}:${secretKey}`)}` };
}

export function getPublisherRuntimeStatus(env: Env): PublisherRuntimeStatus {
  return {
    configured: Boolean(getPublisherCredentials(env)),
    provider: "Repliz",
    mode: "draft-only",
    endpoint: `${REPLIZ_API_BASE}/public/schedule`,
    supportedPlatforms: ["instagram", "tiktok", "threads"]
  };
}

async function replizRequest(env: Env, path: string, init: RequestInit = {}): Promise<unknown> {
  const credentials = getPublisherCredentials(env);
  if (!credentials) throw new PublisherError(503, "Credential Repliz belum dikonfigurasi.");

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", credentials.authorization);
  headers.set("User-Agent", "umkm-content-os-publisher");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${REPLIZ_API_BASE}${path}`, { ...init, headers });
  const responseText = await readLimitedText(response.body, MAX_REPLIZ_BYTES);
  if (!response.ok) {
    console.error(JSON.stringify({ message: "repliz_request_failed", path, status: response.status }));
    throw new PublisherError(502, "Repliz menolak permintaan Publisher.");
  }

  if (!responseText) return {};
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new PublisherError(502, "Respons Repliz tidak valid.");
  }
}

function parseAccount(value: unknown): PublisherAccount | null {
  if (!isRecord(value)) return null;
  const rawId = value.id ?? value._id;
  if (typeof rawId !== "string" && typeof rawId !== "number") return null;

  return {
    id: String(rawId),
    name: textValue(value.name, "Tanpa nama"),
    username: textValue(value.username),
    type: textValue(value.type).toLowerCase(),
    isConnected: value.isConnected === true
  };
}

async function listReplizAccounts(env: Env): Promise<PublisherAccount[]> {
  const value = await replizRequest(env, "/public/account?page=1&limit=50");
  if (!isRecord(value) || !Array.isArray(value.docs)) {
    throw new PublisherError(502, "Daftar akun Repliz tidak lengkap.");
  }

  return value.docs.map(parseAccount).filter((account): account is PublisherAccount => account !== null);
}

export async function listPublisherAccounts(env: Env): Promise<PublisherResult> {
  try {
    if (!getPublisherCredentials(env)) {
      return {
        status: 503,
        body: { ok: false, configured: false, error: "Credential Repliz belum dikonfigurasi." }
      };
    }

    const accounts = await listReplizAccounts(env);
    return {
      status: 200,
      body: {
        ok: true,
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          username: account.username,
          type: account.type,
          isConnected: account.isConnected,
          supported: SUPPORTED_PLATFORMS.has(account.type as PublisherPlatform)
        }))
      }
    };
  } catch (error) {
    const status = error instanceof PublisherError ? error.status : 500;
    const message = error instanceof PublisherError ? error.publicMessage : "Akun Repliz gagal dibaca.";
    return { status, body: { ok: false, error: message } };
  }
}

function parsePublisherInput(value: unknown): { contentItemId: string; accountId: string; scheduleAt: string } {
  if (!isRecord(value)) throw new PublisherError(400, "Format Publisher tidak valid.");

  const contentItemId = textValue(value.contentItemId);
  const accountId = textValue(value.accountId);
  const scheduleAt = textValue(value.scheduleAt);
  if (!UUID_PATTERN.test(contentItemId)) throw new PublisherError(400, "Content item tidak valid.");
  if (!ACCOUNT_ID_PATTERN.test(accountId)) throw new PublisherError(400, "Account Repliz tidak valid.");

  const parsedDate = new Date(scheduleAt);
  if (!scheduleAt || Number.isNaN(parsedDate.getTime())) {
    throw new PublisherError(400, "Waktu draft harus berupa ISO datetime yang valid.");
  }
  if (parsedDate.getTime() < Date.now() + 5 * 60 * 1000) {
    throw new PublisherError(400, "Waktu draft harus minimal 5 menit dari sekarang.");
  }

  return { contentItemId, accountId, scheduleAt: parsedDate.toISOString() };
}

function parseContentBody(value: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new PublisherError(422, "Draft konten bukan JSON yang valid.");
  }
  if (!isRecord(parsed)) throw new PublisherError(422, "Draft konten tidak valid.");
  return parsed;
}

function parseMetadata(value: string): JsonRecord {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function publicationSafetyIssues(body: JsonRecord): string[] {
  const serialized = JSON.stringify(body);
  const issues: string[] = [];
  if (/(?:\b(?:rp\.?\s*[\d.,]+|[\d.,]+\s*(?:juta|ribu|rb|jt|miliar|triliun|persen|%))\b)/i.test(serialized)) {
    issues.push("nominal atau angka finansial tanpa sumber");
  }
  if (/(?:@(?:namaakun|username|akunanda|yourusername)|\b(?:namaakun|usernameanda|your\s+brand|insert\s+here|placeholder|todo)\b)/i.test(serialized)) {
    issues.push("placeholder akun atau brand");
  }
  return issues;
}

async function getApprovedContent(env: Env, contentItemId: string): Promise<{ row: PublisherContentRow; body: JsonRecord }> {
  const row = await env.DB.prepare(
    `SELECT id, title, status, body_json
     FROM content_items
     WHERE id = ?
     LIMIT 1`
  ).bind(contentItemId).first<PublisherContentRow>();

  if (!row) throw new PublisherError(404, "Konten tidak ditemukan.");
  if (row.status !== "approved") {
    throw new PublisherError(409, "Konten harus berstatus approved sebelum masuk Publisher.");
  }

  const body = parseContentBody(row.body_json);
  const safetyIssues = publicationSafetyIssues(body);
  if (safetyIssues.length > 0) {
    throw new PublisherError(422, `Konten diblokir sebelum Publisher: ${safetyIssues.join(", ")}.`);
  }
  return { row, body };
}

async function getLatestAssets(env: Env, contentItemId: string, platform: PublisherPlatform): Promise<PublisherAssetRow[]> {
  const job = await env.DB.prepare(
    `SELECT id
     FROM render_jobs
     WHERE content_item_id = ? AND status = 'completed'
     ORDER BY updated_at DESC
     LIMIT 1`
  ).bind(contentItemId).first<{ id: string }>();
  if (!job) throw new PublisherError(409, "Carousel selesai render belum tersedia.");

  const query = await env.DB.prepare(
    `SELECT platform, public_url, r2_key
     FROM assets
     WHERE render_job_id = ? AND platform = ?
     ORDER BY r2_key ASC`
  ).bind(job.id, platform).all<PublisherAssetRow>();

  const assets = query.results.filter((asset) => typeof asset.public_url === "string" && asset.public_url.startsWith("https://"));
  if (platform !== "threads" && (assets.length < 5 || assets.length > 9)) {
    throw new PublisherError(409, `Aset ${platform} harus berjumlah 5–9 gambar.`);
  }
  return assets;
}

function descriptionForPlatform(body: JsonRecord, platform: PublisherPlatform): string {
  const value = platform === "instagram"
    ? body.instagramCaption
    : platform === "tiktok"
      ? body.tiktokCaption
      : readStringArray(body.threadsPosts)[0];
  const description = limitedText(textValue(value));
  if (!description) throw new PublisherError(422, `Caption ${platform} belum tersedia.`);
  return description;
}

function buildSchedulePayload(
  content: PublisherContentRow,
  body: JsonRecord,
  account: PublisherAccount,
  assets: PublisherAssetRow[],
  scheduleAt: string
): JsonRecord {
  const platform = account.type as PublisherPlatform;
  const description = descriptionForPlatform(body, platform);
  const isText = platform === "threads";
  const medias = isText
    ? []
    : assets.map((asset, index) => ({
        alt: `${content.title} — slide ${index + 1}`,
        type: "image",
        url: asset.public_url
      }));

  return {
    title: limitedText(content.title, 400),
    description,
    topic: limitedCharacters(content.title, 50),
    type: isText ? "text" : "album",
    medias,
    additionalInfo: {
      isAiGenerated: true,
      isDraft: true,
      isAutoAddMusic: false,
      collaborators: [],
      mentions: [],
      tags: [],
      targetCountries: []
    },
    replies: [],
    accountId: account.id,
    scheduleAt
  };
}

export async function createPublisherDraft(request: Request, env: Env): Promise<PublisherResult> {
  const requestId = crypto.randomUUID();
  const publisherJobId = crypto.randomUUID();

  try {
    if (!getPublisherCredentials(env)) throw new PublisherError(503, "Credential Repliz belum dikonfigurasi.");

    const contentLength = Number(request.headers.get("Content-Length") ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) throw new PublisherError(413, "Payload Publisher terlalu besar.");

    const requestText = await readLimitedText(request.body, MAX_REQUEST_BYTES);
    let requestValue: unknown;
    try {
      requestValue = JSON.parse(requestText);
    } catch {
      throw new PublisherError(400, "Body Publisher harus berupa JSON valid.");
    }
    const input = parsePublisherInput(requestValue);
    const { row, body } = await getApprovedContent(env, input.contentItemId);

    const accounts = await listReplizAccounts(env);
    const account = accounts.find((item) => item.id === input.accountId);
    if (!account || !account.isConnected) throw new PublisherError(409, "Akun Repliz tidak ditemukan atau belum terhubung.");
    if (!SUPPORTED_PLATFORMS.has(account.type as PublisherPlatform)) {
      throw new PublisherError(409, "Platform akun ini belum masuk Publisher draft-only.");
    }

    const recent = await env.DB.prepare(
      `SELECT entity_id, status, message, metadata_json, created_at
       FROM activity_logs
       WHERE event_type = 'publisher.draft_submitted' AND entity_type = 'publisher_job'
       ORDER BY created_at DESC
       LIMIT 300`
    ).all<PublisherActivityRow>();
    const existing = recent.results.find((entry) => {
      const metadata = parseMetadata(entry.metadata_json);
      return (
        metadata.contentItemId === input.contentItemId &&
        metadata.accountId === account.id &&
        metadata.scheduleAt === input.scheduleAt
      );
    });
    if (existing?.entity_id) {
      const metadata = parseMetadata(existing.metadata_json);
      return {
        status: 200,
        body: {
          ok: true,
          requestId,
          publisherJobId: existing.entity_id,
          replizScheduleId: typeof metadata.replizScheduleId === "string" ? metadata.replizScheduleId : null,
          status: existing.status,
          isDraft: true,
          unchanged: true
        }
      };
    }

    const assets = await getLatestAssets(env, input.contentItemId, account.type as PublisherPlatform);
    const payload = buildSchedulePayload(row, body, account, assets, input.scheduleAt);
    const replizValue = await replizRequest(env, "/public/schedule", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const replizRecord = isRecord(replizValue) ? replizValue : {};
    const rawScheduleId = replizRecord.id ?? replizRecord._id;
    const replizScheduleId = typeof rawScheduleId === "string" || typeof rawScheduleId === "number" ? String(rawScheduleId) : null;

    await env.DB.prepare(
      `INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
       VALUES ('publisher.draft_submitted', 'publisher_job', ?, 'success', 'Draft dikirim ke Repliz tanpa publikasi otomatis.', ?)`
    ).bind(
      publisherJobId,
      JSON.stringify({
        contentItemId: row.id,
        title: row.title,
        accountId: account.id,
        platform: account.type,
        scheduleAt: input.scheduleAt,
        replizScheduleId,
        isDraft: true
      })
    ).run();

    return {
      status: 202,
      body: {
        ok: true,
        requestId,
        publisherJobId,
        replizScheduleId,
        status: "draft_submitted",
        isDraft: true,
        contentStatus: "approved"
      }
    };
  } catch (error) {
    const status = error instanceof PublisherError ? error.status : 500;
    const message = error instanceof PublisherError ? error.publicMessage : "Publisher mengalami kesalahan.";
    const internalMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(JSON.stringify({ message: "publisher_draft_failed", requestId, publisherJobId, status, error: internalMessage }));
    return { status, body: { ok: false, requestId, error: message } };
  }
}

export async function listPublisherJobs(env: Env): Promise<PublisherResult> {
  try {
    const query = await env.DB.prepare(
      `SELECT entity_id, status, message, metadata_json, created_at
       FROM activity_logs
       WHERE event_type = 'publisher.draft_submitted' AND entity_type = 'publisher_job'
       ORDER BY created_at DESC
       LIMIT 30`
    ).all<PublisherActivityRow>();

    return {
      status: 200,
      body: {
        ok: true,
        jobs: query.results.map((entry) => {
          const metadata = parseMetadata(entry.metadata_json);
          return {
            id: entry.entity_id,
            contentItemId: textValue(metadata.contentItemId),
            title: textValue(metadata.title, "Draft Publisher"),
            accountId: textValue(metadata.accountId),
            platform: textValue(metadata.platform),
            replizScheduleId: textValue(metadata.replizScheduleId) || null,
            status: entry.status === "success" ? "draft_submitted" : entry.status,
            scheduleAt: textValue(metadata.scheduleAt),
            error: entry.status === "success" ? null : entry.message,
            createdAt: entry.created_at,
            updatedAt: entry.created_at
          };
        })
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publisher jobs gagal dibaca.";
    console.error(JSON.stringify({ message: "publisher_jobs_read_failed", error: message }));
    return { status: 500, body: { ok: false, error: "Riwayat Publisher belum tersedia." } };
  }
}
