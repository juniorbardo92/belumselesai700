type ResearchRecord = Record<string, unknown>;

type ResearchAccount = {
  id: string;
  type: string;
  isConnected: boolean;
};

type ResearchStatistic = {
  followers: number | null;
  likes: number | null;
  quotes: number | null;
  replies: number | null;
  reposts: number | null;
  views: number | null;
};

type ResearchProfile = {
  name: string | null;
  username: string;
  verified: boolean | null;
  statistic: ResearchStatistic;
};

type ResearchContent = {
  id: string | null;
  title: string | null;
  description: string | null;
  type: string | null;
  url: string | null;
  createdAt: string | null;
};

export type ResearchRuntimeStatus = {
  configured: boolean;
  mode: "read-only";
  provider: "Repliz Research API";
  supportedPlatforms: ["threads"];
  unavailablePlatforms: ["instagram", "tiktok"];
  tier: "Gold+";
};

export type ResearchResult = {
  status: number;
  body: unknown;
};

class ResearchError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
    readonly code = "research_error"
  ) {
    super(publicMessage);
  }
}

const REPLIZ_API_BASE = "https://api.repliz.com";
const MAX_REPLIZ_BYTES = 512 * 1024;
const MAX_REPLIZ_CONTENT_BYTES = 2 * 1024 * 1024;
const REPLIZ_TIMEOUT_MS = 20_000;
const MAX_USERNAME_LENGTH = 64;
const MAX_CONTENT_ITEMS = 10;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function isRecord(value: unknown): value is ResearchRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function limitedText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function numberValue(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function readBinding(env: Env, name: string): string | undefined {
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function authorizationHeader(env: Env): string | null {
  const accessKey = readBinding(env, "REPLIZ_ACCESS_KEY");
  const secretKey = readBinding(env, "REPLIZ_SECRET_KEY");
  if (!accessKey || !secretKey) return null;
  return `Basic ${btoa(`${accessKey}:${secretKey}`)}`;
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
        throw new ResearchError(502, "Respons Research Repliz terlalu besar.", "response_too_large");
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    reader.releaseLock();
  }
}

async function replizGet(env: Env, path: string, maxBytes = MAX_REPLIZ_BYTES): Promise<unknown> {
  const authorization = authorizationHeader(env);
  if (!authorization) throw new ResearchError(503, "Credential Repliz belum dikonfigurasi.");

  let response: Response;
  try {
    response = await fetch(`${REPLIZ_API_BASE}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: authorization,
        "User-Agent": "umkm-content-os-research"
      },
      signal: AbortSignal.timeout(REPLIZ_TIMEOUT_MS)
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new ResearchError(504, "Research Repliz melewati batas waktu. Silakan coba lagi.", "timeout");
    }
    throw new ResearchError(502, "Research Repliz tidak dapat dihubungi.", "connection_failed");
  }
  const responseText = await readLimitedText(response.body, maxBytes);
  if (!response.ok) {
    if (response.status === 400 || response.status === 422) {
      throw new ResearchError(400, "Parameter Research ditolak Repliz. Pastikan username publik Threads valid.");
    }
    if (response.status === 401) throw new ResearchError(502, "Research Repliz menolak credential.");
    if (response.status === 402 || response.status === 403) throw new ResearchError(409, "Research Threads memerlukan akses Repliz Gold+.");
    if (response.status === 404) throw new ResearchError(404, "Akun atau profil Threads tidak ditemukan.");
    if (response.status === 408 || response.status === 429) {
      throw new ResearchError(429, "Research Repliz sedang membatasi permintaan. Tunggu sebentar lalu coba lagi.");
    }
    if (response.status >= 500) throw new ResearchError(502, `Research Repliz sedang mengalami gangguan (status ${response.status}).`);
    throw new ResearchError(502, `Research Repliz menolak permintaan (status ${response.status}).`);
  }

  if (!responseText) return {};
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new ResearchError(502, "Respons Research Repliz tidak valid.");
  }
}

function parseResearchAccount(value: unknown): ResearchAccount | null {
  if (!isRecord(value)) return null;
  const rawId = value.id ?? value._id;
  if (typeof rawId !== "string" && typeof rawId !== "number") return null;
  return {
    id: String(rawId),
    type: textValue(value.type).toLowerCase(),
    isConnected: value.isConnected === true
  };
}

async function findThreadsAccount(env: Env): Promise<ResearchAccount> {
  const value = await replizGet(env, "/public/account?page=1&limit=50");
  if (!isRecord(value) || !Array.isArray(value.docs)) {
    throw new ResearchError(502, "Daftar akun Repliz tidak lengkap.");
  }

  const account = value.docs
    .map(parseResearchAccount)
    .find((candidate): candidate is ResearchAccount => candidate !== null && candidate.type === "threads" && candidate.isConnected);
  if (!account || !ACCOUNT_ID_PATTERN.test(account.id)) {
    throw new ResearchError(409, "Belum ada akun Threads Repliz yang terhubung untuk Research.");
  }
  return account;
}

function parseStatistic(value: unknown): ResearchStatistic {
  const statistic = isRecord(value) ? value : {};
  return {
    followers: numberValue(statistic.follower),
    likes: numberValue(statistic.like),
    quotes: numberValue(statistic.quotes),
    replies: numberValue(statistic.replies),
    reposts: numberValue(statistic.repost),
    views: numberValue(statistic.views)
  };
}

function parseProfile(value: unknown, fallbackUsername: string): ResearchProfile {
  const profile = isRecord(value) ? value : {};
  return {
    name: textValue(profile.name) || null,
    username: textValue(profile.username, fallbackUsername),
    verified: typeof profile.isVerified === "boolean" ? profile.isVerified : null,
    statistic: parseStatistic(profile.statistic)
  };
}

function parseContent(value: unknown): ResearchContent[] {
  if (!isRecord(value) || !Array.isArray(value.docs)) return [];
  return value.docs.slice(0, MAX_CONTENT_ITEMS).flatMap((item): ResearchContent[] => {
    if (!isRecord(item)) return [];
    const rawUrl = textValue(item.url);
    return [{
      id: textValue(item.id) || null,
      title: limitedText(textValue(item.title) || textValue(item.description), 180) || null,
      description: limitedText(textValue(item.description), 280) || null,
      type: textValue(item.type) || null,
      url: rawUrl.startsWith("https://") ? rawUrl : null,
      createdAt: textValue(item.createdAt) || null
    }];
  });
}

export function getResearchRuntimeStatus(env: Env): ResearchRuntimeStatus {
  return {
    configured: Boolean(authorizationHeader(env)),
    mode: "read-only",
    provider: "Repliz Research API",
    supportedPlatforms: ["threads"],
    unavailablePlatforms: ["instagram", "tiktok"],
    tier: "Gold+"
  };
}

export async function auditThreadsUser(request: Request, env: Env): Promise<ResearchResult> {
  try {
    if (!authorizationHeader(env)) throw new ResearchError(503, "Credential Repliz belum dikonfigurasi.");

    const url = new URL(request.url);
    const platform = textValue(url.searchParams.get("platform"), "threads").toLowerCase();
    if (platform !== "threads") throw new ResearchError(400, "Audit saat ini hanya tersedia untuk Threads.");

    const username = textValue(url.searchParams.get("username")).replace(/^@+/, "");
    if (!username || username.length > MAX_USERNAME_LENGTH || !USERNAME_PATTERN.test(username)) {
      throw new ResearchError(400, "Masukkan username Threads yang valid tanpa spasi.");
    }

    const account = await findThreadsAccount(env);
    const encodedAccountId = encodeURIComponent(account.id);
    const encodedUsername = encodeURIComponent(username);
    const profileValue = await replizGet(env, `/public/research/threads/user?accountId=${encodedAccountId}&username=${encodedUsername}`);

    let recentContent: ResearchContent[] = [];
    let contentStatus: "available" | "unavailable" | "too_large" = "available";
    try {
      const contentValue = await replizGet(
        env,
        `/public/research/threads/content/user?accountId=${encodedAccountId}&username=${encodedUsername}`,
        MAX_REPLIZ_CONTENT_BYTES
      );
      recentContent = parseContent(contentValue);
    } catch (error) {
      if (error instanceof ResearchError && error.code === "response_too_large") contentStatus = "too_large";
      else if (error instanceof ResearchError && (error.status === 403 || error.status === 409)) contentStatus = "unavailable";
      else throw error;
    }

    return {
      status: 200,
      body: {
        ok: true,
        mode: "read-only",
        platform: "threads",
        username,
        profile: parseProfile(profileValue, username),
        recentContent,
        contentStatus,
        notes: [
          "Data berasal dari profil dan konten publik yang dikembalikan Research API.",
          contentStatus === "too_large" ? "Profil berhasil dibaca, tetapi halaman konten Repliz melewati batas aman 2 MB." : null,
          "Data yang tidak tersedia ditampilkan sebagai N/A; tidak ditebak.",
          "Hasil ini belum mengirim komentar, like, DM, atau tindakan engagement apa pun."
        ].filter((note): note is string => note !== null)
      }
    };
  } catch (error) {
    const status = error instanceof ResearchError ? error.status : 500;
    const message = error instanceof ResearchError ? error.publicMessage : "Audit Threads gagal dijalankan.";
    const internalMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(JSON.stringify({ message: "research_threads_audit_failed", status, error: internalMessage }));
    return { status, body: { ok: false, error: message } };
  }
}
