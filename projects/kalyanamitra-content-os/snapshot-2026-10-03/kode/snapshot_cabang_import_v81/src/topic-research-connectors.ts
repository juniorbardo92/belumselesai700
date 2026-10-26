type ConnectorRecord = Record<string, unknown>;

export type TopicResearchPlatform = "threads" | "x" | "instagram";
export type TopicResearchProviderId = "repliz_threads" | "x_api" | "instagram_api";

export type TopicResearchProviderStatus = {
  id: TopicResearchProviderId;
  platform: TopicResearchPlatform;
  label: string;
  state: "not_configured" | "ready";
  enabled: boolean;
  message: string;
};

export type TopicResearchConnectorInput = {
  topic: string;
  keywords: string[];
  platform: TopicResearchPlatform;
  lookbackDays: number;
  providerId: TopicResearchProviderId;
};

export type TopicResearchAccountMetrics = {
  likes: number | null;
  quotes: number | null;
  replies: number | null;
  reposts: number | null;
  views: number | null;
};

export type NormalizedTopicResearchAccount = {
  id: string;
  platform: TopicResearchPlatform;
  username: string;
  displayName: string | null;
  profileUrl: string | null;
  followers: number | null;
  verified: boolean | null;
  metrics: TopicResearchAccountMetrics;
  evidence: string[];
};

export type NormalizedTopicResearchPost = {
  id: string;
  platform: TopicResearchPlatform;
  username: string;
  displayName?: string | null;
  profileUrl?: string | null;
  url?: string | null;
  text: string;
  createdAt?: string | null;
  followers?: number | null;
  likes?: number | null;
  replies?: number | null;
  reposts?: number | null;
  quotes?: number | null;
  views?: number | null;
};

export type TopicResearchCollection = {
  providerId: TopicResearchProviderId;
  accounts: NormalizedTopicResearchAccount[];
  posts: NormalizedTopicResearchPost[];
  searches: string[];
  warnings: string[];
};

export type TopicResearchConnector = {
  id: TopicResearchProviderId;
  platform: TopicResearchPlatform;
  label: string;
  getStatus(env: Env): TopicResearchProviderStatus;
  collect(input: TopicResearchConnectorInput, env: Env): Promise<TopicResearchCollection>;
};

export class TopicResearchConnectorError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string
  ) {
    super(publicMessage);
  }
}

const REPLIZ_API_BASE = "https://api.repliz.com";
const MAX_REPLIZ_BYTES = 256 * 1024;
const MAX_SEARCHES = 4;
const MAX_POSTS = 40;
const MAX_ACCOUNTS = 8;
const MAX_TEXT_LENGTH = 2_000;
const REQUEST_TIMEOUT_MS = 15_000;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function isRecord(value: unknown): value is ConnectorRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function numberValue(value: unknown): number | null {
  const result = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function limitedText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function readBinding(env: Env, name: string): string | undefined {
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function replizAuthorization(env: Env): string | null {
  const accessKey = readBinding(env, "REPLIZ_ACCESS_KEY");
  const secretKey = readBinding(env, "REPLIZ_SECRET_KEY");
  if (!accessKey || !secretKey) return null;
  return `Basic ${btoa(`${accessKey}:${secretKey}`)}`;
}

async function readLimitedResponse(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REPLIZ_BYTES) {
        await reader.cancel("response_too_large");
        throw new TopicResearchConnectorError(502, "Respons Repliz terlalu besar untuk diproses dengan aman.");
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function replizGet(env: Env, path: string): Promise<unknown> {
  const authorization = replizAuthorization(env);
  if (!authorization) throw new TopicResearchConnectorError(503, "Credential Repliz belum dikonfigurasi.");

  let response: Response;
  try {
    response = await fetch(`${REPLIZ_API_BASE}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: authorization,
        "User-Agent": "umkm-content-os-topic-research"
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new TopicResearchConnectorError(504, "Research Repliz melewati batas waktu. Silakan coba lagi.");
    }
    throw new TopicResearchConnectorError(502, "Research Repliz tidak dapat dihubungi.");
  }

  const responseText = await readLimitedResponse(response);
  if (!response.ok) {
    if (response.status === 400 || response.status === 422) {
      throw new TopicResearchConnectorError(400, "Parameter pencarian ditolak Repliz.");
    }
    if (response.status === 401) throw new TopicResearchConnectorError(502, "Repliz menolak credential yang tersimpan.");
    if (response.status === 402 || response.status === 403) {
      throw new TopicResearchConnectorError(409, "Akses Repliz Research Gold+ belum dikenali oleh API.");
    }
    if (response.status === 404) throw new TopicResearchConnectorError(404, "Data Threads yang diminta tidak ditemukan.");
    if (response.status === 408 || response.status === 429) {
      throw new TopicResearchConnectorError(429, "Repliz sedang membatasi permintaan. Tunggu sebentar lalu coba lagi.");
    }
    if (response.status >= 500) {
      throw new TopicResearchConnectorError(502, `Research Repliz sedang mengalami gangguan (status ${response.status}).`);
    }
    throw new TopicResearchConnectorError(502, `Research Repliz menolak permintaan (status ${response.status}).`);
  }

  if (!responseText) return {};
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new TopicResearchConnectorError(502, "Respons Research Repliz tidak valid.");
  }
}

function parseThreadsUsername(urlValue: string): string | null {
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || !/(^|\.)threads\.(com|net)$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/^\/@([^/]+)/);
    const username = match?.[1] ? decodeURIComponent(match[1]).replace(/^@+/, "") : "";
    return USERNAME_PATTERN.test(username) ? username : null;
  } catch {
    return null;
  }
}

function safeThreadsUrl(value: unknown): string | null {
  const rawUrl = textValue(value);
  return parseThreadsUsername(rawUrl) ? rawUrl : null;
}

function parseAccountMetrics(value: unknown): TopicResearchAccountMetrics {
  const statistic = isRecord(value) ? value : {};
  return {
    likes: numberValue(statistic.like),
    quotes: numberValue(statistic.quotes),
    replies: numberValue(statistic.replies),
    reposts: numberValue(statistic.repost),
    views: numberValue(statistic.views)
  };
}

function parsePostMetrics(value: unknown): Pick<NormalizedTopicResearchPost, "likes" | "quotes" | "replies" | "reposts" | "views"> {
  const statistic = isRecord(value) ? value : {};
  return {
    likes: numberValue(statistic.like ?? statistic.likes),
    quotes: numberValue(statistic.quotes),
    replies: numberValue(statistic.replies ?? statistic.reply),
    reposts: numberValue(statistic.repost ?? statistic.reposts),
    views: numberValue(statistic.views ?? statistic.view)
  };
}

function parseSearchDocs(value: unknown, cutoffMs: number): NormalizedTopicResearchPost[] {
  if (!isRecord(value) || !Array.isArray(value.docs)) return [];

  return value.docs.slice(0, MAX_POSTS).flatMap((item): NormalizedTopicResearchPost[] => {
    if (!isRecord(item)) return [];
    const url = safeThreadsUrl(item.url);
    const username = url ? parseThreadsUsername(url) : null;
    const text = limitedText(textValue(item.description) || textValue(item.title), MAX_TEXT_LENGTH);
    const rawId = item.id;
    const id = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : url;
    const createdAt = textValue(item.createdAt) || null;
    const createdMs = createdAt ? Date.parse(createdAt) : NaN;
    if (!id || !url || !username || !text) return [];
    if (!Number.isFinite(createdMs) || createdMs < cutoffMs || createdMs > Date.now() + 300_000) return [];
    const owner = isRecord(item.owner) ? item.owner : {};

    return [{
      id,
      platform: "threads",
      username,
      displayName: textValue(owner.name) || null,
      profileUrl: `https://www.threads.com/@${username}`,
      url,
      text,
      createdAt,
      ...parsePostMetrics(item.statistic)
    }];
  });
}

async function findConnectedThreadsAccount(env: Env): Promise<string> {
  const value = await replizGet(env, "/public/account?page=1&limit=50&types%5B0%5D=threads");
  if (!isRecord(value) || !Array.isArray(value.docs)) {
    throw new TopicResearchConnectorError(502, "Daftar akun Repliz tidak lengkap.");
  }

  for (const item of value.docs) {
    if (!isRecord(item)) continue;
    const candidateIds = [item.id, item._id]
      .map((rawId) => typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : "")
      .filter((id) => id.length >= 24 && ACCOUNT_ID_PATTERN.test(id));
    if (textValue(item.type).toLowerCase() === "threads" && item.isConnected === true && candidateIds.length > 0) return candidateIds[0]!;
  }
  throw new TopicResearchConnectorError(409, "Belum ada akun Threads yang terhubung di Repliz.");
}

async function fetchThreadsProfile(env: Env, accountId: string, username: string): Promise<NormalizedTopicResearchAccount> {
  const value = await replizGet(
    env,
    `/public/research/threads/user?accountId=${encodeURIComponent(accountId)}&username=${encodeURIComponent(username)}`
  );
  const profile = isRecord(value) ? value : {};
  const returnedUsername = textValue(profile.username, username).replace(/^@+/, "");
  const safeUsername = USERNAME_PATTERN.test(returnedUsername) ? returnedUsername : username;
  const metrics = parseAccountMetrics(profile.statistic);
  const followers = numberValue(isRecord(profile.statistic) ? profile.statistic.follower : null);
  const evidence = [
    "Akun ditemukan dari hasil pencarian konten publik Threads.",
    followers === null ? "Jumlah followers tidak tersedia." : `Snapshot profil: ${followers.toLocaleString("id-ID")} followers.`
  ];
  if (metrics.views !== null) evidence.push(`Snapshot profil Repliz mencatat ${metrics.views.toLocaleString("id-ID")} views; angka ini bukan metrik per posting.`);

  return {
    id: safeUsername.toLowerCase(),
    platform: "threads",
    username: safeUsername,
    displayName: textValue(profile.name) || null,
    profileUrl: `https://www.threads.com/@${safeUsername}`,
    followers,
    verified: typeof profile.isVerified === "boolean" ? profile.isVerified : null,
    metrics,
    evidence
  };
}

async function collectReplizThreads(input: TopicResearchConnectorInput, env: Env): Promise<TopicResearchCollection> {
  const accountId = await findConnectedThreadsAccount(env);
  const searches = [...new Set(input.keywords.map((keyword) => keyword.trim()).filter(Boolean))].slice(0, MAX_SEARCHES);
  const cutoffMs = Date.now() - input.lookbackDays * 86_400_000;
  const searchResults = await Promise.all(
    searches.map((search) => replizGet(
      env,
      `/public/research/threads/content/search?accountId=${encodeURIComponent(accountId)}&search=${encodeURIComponent(search)}`
    ))
  );

  const uniquePosts = new Map<string, NormalizedTopicResearchPost>();
  for (const result of searchResults) {
    for (const post of parseSearchDocs(result, cutoffMs)) uniquePosts.set(post.id || post.url || crypto.randomUUID(), post);
  }
  const posts = [...uniquePosts.values()].slice(0, MAX_POSTS);
  const usernames = [...new Set(posts.map((post) => post.username.toLowerCase()))].slice(0, MAX_ACCOUNTS);
  const selected = new Set(usernames);
  const boundedPosts = posts.filter((post) => selected.has(post.username.toLowerCase()));

  const accounts: NormalizedTopicResearchAccount[] = [];
  const warnings: string[] = [];
  for (let index = 0; index < usernames.length; index += 4) {
    const batch = usernames.slice(index, index + 4);
    const settled = await Promise.allSettled(batch.map((username) => fetchThreadsProfile(env, accountId, username)));
    for (const [itemIndex, result] of settled.entries()) {
      const username = batch[itemIndex];
      if (!username) continue;
      if (result.status === "fulfilled") {
        accounts.push(result.value);
      } else {
        const sourcePost = boundedPosts.find((post) => post.username.toLowerCase() === username);
        accounts.push({
          id: username,
          platform: "threads",
          username: sourcePost?.username ?? username,
          displayName: sourcePost?.displayName ?? null,
          profileUrl: sourcePost?.profileUrl ?? `https://www.threads.com/@${username}`,
          followers: null,
          verified: null,
          metrics: { likes: null, quotes: null, replies: null, reposts: null, views: null },
          evidence: ["Akun ditemukan dari hasil pencarian konten publik Threads.", "Snapshot profil tidak tersedia pada pengambilan ini."]
        });
        warnings.push(`Profil @${username} tidak dapat dilengkapi; konten pencarian tetap disimpan.`);
      }
    }
  }

  const followersByUsername = new Map(accounts.map((account) => [account.username.toLowerCase(), account.followers]));
  for (const post of boundedPosts) post.followers = followersByUsername.get(post.username.toLowerCase()) ?? null;

  if (boundedPosts.some((post) => post.likes === null && post.replies === null && post.reposts === null && post.views === null)) {
    warnings.push("Repliz tidak menyediakan metrik per posting pada sebagian hasil; analisis bagian itu hanya memakai teks, relevansi, dan waktu terbit.");
  }

  return { providerId: "repliz_threads", accounts, posts: boundedPosts, searches, warnings };
}

function placeholderConnector(
  id: TopicResearchProviderId,
  platform: TopicResearchPlatform,
  label: string,
  bindingName: string
): TopicResearchConnector {
  return {
    id,
    platform,
    label,
    getStatus(env) {
      const configured = Boolean(readBinding(env, bindingName));
      return {
        id,
        platform,
        label,
        state: "not_configured",
        enabled: false,
        message: configured
          ? "Credential terdeteksi, tetapi adapter provider ini belum diaktifkan."
          : "Adapter tersedia untuk diganti; credential/provider belum dikonfigurasi."
      };
    },
    async collect() {
      throw new TopicResearchConnectorError(503, `Konektor ${label} belum diaktifkan.`);
    }
  };
}

const connectors: TopicResearchConnector[] = [
  {
    id: "repliz_threads",
    platform: "threads",
    label: "Threads via Repliz Research",
    getStatus(env) {
      const configured = Boolean(replizAuthorization(env));
      return {
        id: "repliz_threads",
        platform: "threads",
        label: "Threads via Repliz Research",
        state: configured ? "ready" : "not_configured",
        enabled: configured,
        message: configured
          ? "Repliz Gold+ siap untuk pencarian konten dan profil Threads secara read-only."
          : "Credential Repliz belum dikonfigurasi."
      };
    },
    collect: collectReplizThreads
  },
  placeholderConnector("x_api", "x", "X API", "X_API_BEARER_TOKEN"),
  placeholderConnector("instagram_api", "instagram", "Instagram API/provider", "INSTAGRAM_RESEARCH_TOKEN")
];

export function listTopicResearchConnectors(): TopicResearchConnector[] {
  return connectors;
}

export function getTopicResearchConnector(providerId: TopicResearchProviderId): TopicResearchConnector | null {
  return connectors.find((connector) => connector.id === providerId) ?? null;
}

export function defaultTopicResearchConnector(platform: TopicResearchPlatform): TopicResearchConnector {
  const connector = connectors.find((candidate) => candidate.platform === platform);
  if (!connector) throw new TopicResearchConnectorError(400, "Platform riset tidak memiliki konektor.");
  return connector;
}
