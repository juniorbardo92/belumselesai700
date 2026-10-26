import {
  defaultTopicResearchConnector,
  getTopicResearchConnector,
  listTopicResearchConnectors,
  TopicResearchConnectorError,
  type NormalizedTopicResearchPost,
  type TopicResearchConnectorInput,
  type TopicResearchPlatform,
  type TopicResearchProviderId,
  type TopicResearchProviderStatus
} from "./topic-research-connectors";
import { MIN_TOPIC_RELEVANCE_SCORE, scoreTopicRelevance } from "./topic-research-ranking";

type TopicResearchRecord = Record<string, unknown>;

export type TopicResearchRuntimeStatus = {
  configured: boolean;
  canCollect: boolean;
  mode: "read-only";
  storage: "D1";
  providers: TopicResearchProviderStatus[];
  capabilities: ["keyword_plan", "account_clustering", "viral_pattern_analysis"];
  note: string;
};

export type TopicResearchResult = {
  status: number;
  body: unknown;
};

type TopicResearchInput = {
  topic: string;
  keywords: string[];
  platform: TopicResearchPlatform;
  lookbackDays: number;
  providerId: TopicResearchProviderId;
};

type TopicResearchRunRow = {
  id: string;
  brand_id: string;
  topic: string;
  keywords_json: string;
  platform: TopicResearchPlatform;
  lookback_days: number;
  provider_id: TopicResearchProviderId;
  status: "queued" | "waiting_provider" | "ready" | "failed";
  result_json: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type TopicResearchAccountRow = {
  id: string;
  run_id: string;
  platform: TopicResearchPlatform;
  username: string;
  display_name: string | null;
  profile_url: string | null;
  followers: number | null;
  relevance_score: number;
  viral_score: number;
  evidence_json: string;
  created_at: string;
};

type TopicResearchPostRow = {
  id: string;
  run_id: string;
  account_id: string | null;
  platform: TopicResearchPlatform;
  external_id: string | null;
  url: string | null;
  text: string;
  created_at_external: string | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  views: number | null;
  relevance_score: number;
  virality_score: number;
  analysis_json: string;
  observed_at: string;
  account_username?: string | null;
};

export type TopicResearchPostAnalysis = {
  relevanceScore: number;
  patternScore: number;
  viralityScore: number;
  engagement: number;
  velocityPerHour: number;
  evidence: string[];
  whyItMayWork: string[];
  confidence: "low" | "medium" | "high";
};

class TopicResearchError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string
  ) {
    super(publicMessage);
  }
}

const BRAND_ID = "brand-umkm-naik-kelas";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_TOPIC_LENGTH = 300;
const MAX_KEYWORDS = 12;
const MAX_KEYWORD_LENGTH = 80;
const MAX_RUNS = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORMS: TopicResearchPlatform[] = ["threads", "x", "instagram"];
const TOPIC_RESEARCH_SCHEMA = [
  "PRAGMA foreign_keys = ON;",
  "CREATE TABLE IF NOT EXISTS topic_research_runs (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, topic TEXT NOT NULL, keywords_json TEXT NOT NULL DEFAULT '[]', platform TEXT NOT NULL CHECK (platform IN ('threads', 'x', 'instagram')), lookback_days INTEGER NOT NULL DEFAULT 7 CHECK (lookback_days BETWEEN 1 AND 30), provider_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'waiting_provider', 'ready', 'failed')), result_json TEXT NOT NULL DEFAULT '{}', error_message TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE);",
  "CREATE INDEX IF NOT EXISTS idx_topic_research_runs_created ON topic_research_runs(created_at DESC, id DESC);",
  "CREATE INDEX IF NOT EXISTS idx_topic_research_runs_status ON topic_research_runs(status, created_at DESC);",
  "CREATE TABLE IF NOT EXISTS topic_research_accounts (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, platform TEXT NOT NULL CHECK (platform IN ('threads', 'x', 'instagram')), username TEXT NOT NULL, display_name TEXT, profile_url TEXT, followers INTEGER, relevance_score REAL NOT NULL DEFAULT 0, viral_score REAL NOT NULL DEFAULT 0, evidence_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (run_id) REFERENCES topic_research_runs(id) ON DELETE CASCADE);",
  "CREATE INDEX IF NOT EXISTS idx_topic_research_accounts_run ON topic_research_accounts(run_id, relevance_score DESC, viral_score DESC);",
  "CREATE TABLE IF NOT EXISTS topic_research_posts (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, account_id TEXT, platform TEXT NOT NULL CHECK (platform IN ('threads', 'x', 'instagram')), external_id TEXT, url TEXT, text TEXT NOT NULL, created_at_external TEXT, likes INTEGER, replies INTEGER, reposts INTEGER, views INTEGER, relevance_score REAL NOT NULL DEFAULT 0, virality_score REAL NOT NULL DEFAULT 0, analysis_json TEXT NOT NULL DEFAULT '{}', observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (run_id) REFERENCES topic_research_runs(id) ON DELETE CASCADE, FOREIGN KEY (account_id) REFERENCES topic_research_accounts(id) ON DELETE SET NULL);",
  "CREATE INDEX IF NOT EXISTS idx_topic_research_posts_run ON topic_research_posts(run_id, virality_score DESC, relevance_score DESC);",
  "CREATE INDEX IF NOT EXISTS idx_topic_research_posts_external ON topic_research_posts(platform, external_id);"
].join("\n");

function isRecord(value: unknown): value is TopicResearchRecord {
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
        throw new TopicResearchError(413, "Permintaan riset terlalu besar.");
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    reader.releaseLock();
  }
}

function normalizeKeyword(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildKeywordPlan(topic: string, suppliedKeywords: string[]): string[] {
  const normalizedTopic = normalizeKeyword(topic);
  const spellingVariant = normalizedTopic
    .replace(/\bomset\b/g, "omzet")
    .replace(/\bcash[ -]?flow\b/g, "arus kas");
  const candidates = [normalizedTopic, spellingVariant, ...suppliedKeywords]
    .map(normalizeKeyword)
    .filter((value) => value.length >= 2 && value.length <= MAX_KEYWORD_LENGTH);
  const topicTokens = normalizeKeyword(topic).split(" ").filter((token) => token.length >= 4);

  if (topicTokens.length >= 2) {
    candidates.push(topicTokens.slice(0, 2).join(" "));
    if (topicTokens.length >= 3) candidates.push(topicTokens.slice(0, 3).join(" "));
  }

  return [...new Set(candidates)].slice(0, MAX_KEYWORDS);
}

function providerById(providerId: TopicResearchProviderId, env: Env): TopicResearchProviderStatus {
  const connector = getTopicResearchConnector(providerId);
  if (!connector) throw new TopicResearchError(400, "Konektor riset tidak valid.");
  return connector.getStatus(env);
}

export function getTopicResearchRuntimeStatus(env: Env): TopicResearchRuntimeStatus {
  const providers = listTopicResearchConnectors().map((connector) => connector.getStatus(env));
  return {
    configured: providers.some((provider) => provider.state === "ready"),
    canCollect: providers.some((provider) => provider.enabled),
    mode: "read-only",
    storage: "D1",
    providers,
    capabilities: ["keyword_plan", "account_clustering", "viral_pattern_analysis"],
    note: "Konektor riset dapat diganti per platform. Repliz Threads berjalan read-only; data publik yang tidak tersedia tidak ditebak."
  };
}

function parseInput(value: unknown): TopicResearchInput {
  if (!isRecord(value)) throw new TopicResearchError(400, "Format permintaan riset tidak valid.");

  const topic = textValue(value.topic);
  if (topic.length < 8 || topic.length > MAX_TOPIC_LENGTH) {
    throw new TopicResearchError(400, "Topik harus berisi 8–300 karakter.");
  }

  const platform = textValue(value.platform, "threads").toLowerCase();
  if (!PLATFORMS.includes(platform as TopicResearchPlatform)) {
    throw new TopicResearchError(400, "Platform riset tidak valid.");
  }

  const lookbackDays = numberValue(value.lookbackDays ?? 7);
  if (lookbackDays === null || !Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 30) {
    throw new TopicResearchError(400, "Periode riset harus 1–30 hari.");
  }

  const rawKeywords = Array.isArray(value.keywords)
    ? value.keywords
    : typeof value.keywords === "string"
      ? value.keywords.split(",")
      : [];
  if (rawKeywords.length > MAX_KEYWORDS) throw new TopicResearchError(400, "Maksimal 12 keyword riset.");
  const suppliedKeywords = rawKeywords.filter(
    (keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0
  );
  if (suppliedKeywords.length !== rawKeywords.length) {
    throw new TopicResearchError(400, "Keyword riset harus berupa teks.");
  }

  const defaultConnector = defaultTopicResearchConnector(platform as TopicResearchPlatform);
  const providerId = textValue(value.providerId, defaultConnector.id) as TopicResearchProviderId;
  const connector = getTopicResearchConnector(providerId);
  if (!connector || connector.platform !== platform) {
    throw new TopicResearchError(400, "Konektor tidak sesuai dengan platform riset.");
  }

  return {
    topic: limitedText(topic, MAX_TOPIC_LENGTH),
    keywords: buildKeywordPlan(topic, suppliedKeywords),
    platform: platform as TopicResearchPlatform,
    lookbackDays,
    providerId
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function publicRun(row: TopicResearchRunRow, provider: TopicResearchProviderStatus): Record<string, unknown> {
  const keywords = parseJson(row.keywords_json);
  const result = parseJson(row.result_json);
  return {
    id: row.id,
    topic: row.topic,
    keywords: Array.isArray(keywords) ? keywords : [],
    platform: row.platform,
    lookbackDays: Number(row.lookback_days),
    providerId: row.provider_id,
    status: row.status,
    provider,
    result: isRecord(result) ? result : {},
    error: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicAccount(row: TopicResearchAccountRow): Record<string, unknown> {
  const patternScore = Number(row.viral_score);
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    platform: row.platform,
    profileUrl: row.profile_url,
    followers: row.followers,
    relevanceScore: Number(row.relevance_score),
    patternScore,
    viralScore: patternScore,
    scoreLabel: "Potensi pola",
    evidence: Array.isArray(parseJson(row.evidence_json)) ? parseJson(row.evidence_json) : []
  };
}

function publicPost(row: TopicResearchPostRow): Record<string, unknown> {
  const analysis = parseJson(row.analysis_json);
  const patternScore = Number(row.virality_score);
  return {
    id: row.id,
    accountId: row.account_id,
    username: row.account_username,
    platform: row.platform,
    externalId: row.external_id,
    url: row.url,
    text: row.text,
    createdAt: row.created_at_external,
    metrics: {
      likes: row.likes,
      replies: row.replies,
      reposts: row.reposts,
      views: row.views
    },
    relevanceScore: Number(row.relevance_score),
    patternScore,
    viralityScore: patternScore,
    scoreLabel: "Potensi pola",
    analysis: isRecord(analysis) ? { ...analysis, patternScore } : { patternScore },
    observedAt: row.observed_at
  };
}

async function ensureTopicResearchSchema(env: Env): Promise<void> {
  await env.DB.exec(TOPIC_RESEARCH_SCHEMA);
}

function summarizeInsights(analyses: TopicResearchPostAnalysis[]): string[] {
  const patterns = new Map<string, number>();
  for (const analysis of analyses) {
    for (const pattern of analysis.whyItMayWork) patterns.set(pattern, (patterns.get(pattern) ?? 0) + 1);
  }
  return [...patterns.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([pattern, count]) => `${pattern} Terlihat pada ${count} konten.`);
}

export async function createTopicResearchRun(request: Request, env: Env): Promise<TopicResearchResult> {
  const requestId = crypto.randomUUID();
  let runId: string | null = null;

  try {
    const contentLength = Number(request.headers.get("Content-Length") ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) throw new TopicResearchError(413, "Permintaan riset terlalu besar.");

    const requestText = await readLimitedText(request.body);
    let value: unknown;
    try {
      value = JSON.parse(requestText);
    } catch {
      throw new TopicResearchError(400, "Body riset harus berupa JSON valid.");
    }

    const input = parseInput(value);
    await ensureTopicResearchSchema(env);
    const connector = getTopicResearchConnector(input.providerId);
    if (!connector || connector.platform !== input.platform) throw new TopicResearchError(400, "Konektor riset tidak valid.");
    const provider = connector.getStatus(env);
    if (!provider.enabled) throw new TopicResearchError(503, provider.message);
    runId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO topic_research_runs
       (id, brand_id, topic, keywords_json, platform, lookback_days, provider_id, status, result_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', '{}')`
    )
      .bind(
        runId,
        BRAND_ID,
        input.topic,
        JSON.stringify(input.keywords),
        input.platform,
        input.lookbackDays,
        provider.id
      )
      .run();

    const collectionInput: TopicResearchConnectorInput = { ...input };
    const collection = await connector.collect(collectionInput, env);
    const accountIds = new Map<string, string>();
    const analyses = new Map<string, TopicResearchPostAnalysis>();
    for (const post of collection.posts) analyses.set(post.id, analyzeTopicResearchPost(post, input.topic, input.keywords));
    const relevantPosts = collection.posts.filter(
      (post) => (analyses.get(post.id)?.relevanceScore ?? 0) >= MIN_TOPIC_RELEVANCE_SCORE
    );
    const relevantUsernames = new Set(relevantPosts.map((post) => post.username.toLowerCase()));
    const relevantAccounts = collection.accounts.filter((account) => relevantUsernames.has(account.username.toLowerCase()));

    const statements: D1PreparedStatement[] = [];
    for (const account of relevantAccounts) {
      const accountId = crypto.randomUUID();
      accountIds.set(account.username.toLowerCase(), accountId);
      const accountAnalyses = relevantPosts
        .filter((post) => post.username.toLowerCase() === account.username.toLowerCase())
        .map((post) => analyses.get(post.id))
        .filter((analysis): analysis is TopicResearchPostAnalysis => Boolean(analysis));
      const relevanceScore = accountAnalyses.length
        ? Math.round(accountAnalyses.reduce((sum, analysis) => sum + analysis.relevanceScore, 0) / accountAnalyses.length)
        : 0;
      const viralScore = accountAnalyses.length ? Math.max(...accountAnalyses.map((analysis) => analysis.patternScore)) : 0;
      statements.push(env.DB.prepare(
        `INSERT INTO topic_research_accounts
         (id, run_id, platform, username, display_name, profile_url, followers, relevance_score, viral_score, evidence_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        accountId,
        runId,
        account.platform,
        account.username,
        account.displayName,
        account.profileUrl,
        account.followers,
        relevanceScore,
        viralScore,
        JSON.stringify(account.evidence)
      ));
    }

    for (const post of relevantPosts) {
      const analysis = analyses.get(post.id) ?? analyzeTopicResearchPost(post, input.topic, input.keywords);
      statements.push(env.DB.prepare(
        `INSERT INTO topic_research_posts
         (id, run_id, account_id, platform, external_id, url, text, created_at_external, likes, replies, reposts, views, relevance_score, virality_score, analysis_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        runId,
        accountIds.get(post.username.toLowerCase()) ?? null,
        post.platform,
        post.id,
        post.url ?? null,
        post.text,
        post.createdAt ?? null,
        post.likes ?? null,
        post.replies ?? null,
        post.reposts ?? null,
        post.views ?? null,
        analysis.relevanceScore,
        analysis.patternScore,
        JSON.stringify(analysis)
      ));
    }

    const analysisValues = relevantPosts.flatMap((post) => {
      const analysis = analyses.get(post.id);
      return analysis ? [analysis] : [];
    });
    const filteredOutCount = collection.posts.length - relevantPosts.length;
    const resultWarnings = [...collection.warnings];
    if (filteredOutCount > 0) {
      resultWarnings.push(`${filteredOutCount} konten disaring karena relevansinya di bawah ${MIN_TOPIC_RELEVANCE_SCORE}.`);
    }
    const result = {
      collectionMode: "public-metadata-only",
      providerId: collection.providerId,
      searches: collection.searches,
      accountCount: relevantAccounts.length,
      postCount: relevantPosts.length,
      candidatePostCount: collection.posts.length,
      filteredOutCount,
      minimumRelevanceScore: MIN_TOPIC_RELEVANCE_SCORE,
      scoreLabel: "Potensi pola",
      insights: summarizeInsights(analysisValues),
      warnings: resultWarnings,
      dataAvailable: relevantPosts.length > 0,
      note: relevantPosts.length > 0
        ? "Hasil berasal dari Repliz Research. Potensi pola menilai relevansi dan struktur copy; tanpa metrik per posting, skor ini bukan bukti bahwa konten viral."
        : "Tidak ada konten yang melewati ambang relevansi untuk periode dan keyword yang dipilih."
    };
    statements.push(env.DB.prepare(
      `UPDATE topic_research_runs
       SET status = 'ready', result_json = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(JSON.stringify(result), runId));
    await env.DB.batch(statements);

    return {
      status: 201,
      body: {
        ok: true,
        requestId,
        run: {
          id: runId,
          topic: input.topic,
          keywords: input.keywords,
          platform: input.platform,
          lookbackDays: input.lookbackDays,
          providerId: input.providerId,
          status: "ready",
          provider,
          result
        },
        nextStep: "Buka detail run untuk melihat akun relevan dan pola konten. Publisher tetap tidak tersentuh."
      }
    };
  } catch (error) {
    const knownError = error instanceof TopicResearchError || error instanceof TopicResearchConnectorError;
    const status = knownError ? error.status : 500;
    const message = knownError ? error.publicMessage : "Riset gagal dijalankan.";
    if (runId) {
      try {
        await env.DB.prepare(
          `UPDATE topic_research_runs SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(message, runId).run();
      } catch (updateError) {
        console.error(JSON.stringify({ message: "topic_research_failure_status_failed", requestId, runId, error: updateError instanceof Error ? updateError.message : "Unknown error" }));
      }
    }
    console.error(JSON.stringify({ message: "topic_research_run_failed", requestId, status, error: error instanceof Error ? error.message : "Unknown error" }));
    return { status, body: { ok: false, requestId, runId, error: message } };
  }
}

export async function listTopicResearchRuns(env: Env): Promise<TopicResearchResult> {
  try {
    await ensureTopicResearchSchema(env);
    const rows = await env.DB.prepare(
      `SELECT id, brand_id, topic, keywords_json, platform, lookback_days, provider_id, status, result_json, error_message, created_at, updated_at
       FROM topic_research_runs
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
      .bind(MAX_RUNS)
      .all<TopicResearchRunRow>();

    return {
      status: 200,
      body: {
        ok: true,
        runs: rows.results.map((row) => publicRun(row, providerById(row.provider_id, env)))
      }
    };
  } catch (error) {
    console.error(JSON.stringify({ message: "topic_research_runs_failed", error: error instanceof Error ? error.message : "Unknown error" }));
    return { status: 500, body: { ok: false, error: "Riwayat riset belum tersedia." } };
  }
}

export async function getTopicResearchRun(runId: string, env: Env): Promise<TopicResearchResult> {
  try {
    if (!UUID_PATTERN.test(runId)) return { status: 400, body: { ok: false, error: "ID riset tidak valid." } };

    await ensureTopicResearchSchema(env);
    const row = await env.DB.prepare(
      `SELECT id, brand_id, topic, keywords_json, platform, lookback_days, provider_id, status, result_json, error_message, created_at, updated_at
       FROM topic_research_runs WHERE id = ? LIMIT 1`
    )
      .bind(runId)
      .first<TopicResearchRunRow>();
    if (!row) return { status: 404, body: { ok: false, error: "Run riset tidak ditemukan." } };

    const [accounts, posts] = await Promise.all([
      env.DB.prepare(
        `SELECT id, run_id, platform, username, display_name, profile_url, followers, relevance_score, viral_score, evidence_json, created_at
         FROM topic_research_accounts WHERE run_id = ? AND relevance_score >= ? ORDER BY relevance_score DESC, viral_score DESC LIMIT 50`
      )
        .bind(runId, MIN_TOPIC_RELEVANCE_SCORE)
        .all<TopicResearchAccountRow>(),
      env.DB.prepare(
        `SELECT p.id, p.run_id, p.account_id, p.platform, p.external_id, p.url, p.text, p.created_at_external,
                p.likes, p.replies, p.reposts, p.views, p.relevance_score, p.virality_score, p.analysis_json, p.observed_at,
                a.username AS account_username
         FROM topic_research_posts p
         LEFT JOIN topic_research_accounts a ON a.id = p.account_id
         WHERE p.run_id = ? AND p.relevance_score >= ? ORDER BY p.virality_score DESC, p.relevance_score DESC LIMIT 100`
      )
        .bind(runId, MIN_TOPIC_RELEVANCE_SCORE)
        .all<TopicResearchPostRow>()
    ]);

    return {
      status: 200,
      body: {
        ok: true,
        run: publicRun(row, providerById(row.provider_id, env)),
        accounts: accounts.results.map(publicAccount),
        posts: posts.results.map(publicPost)
      }
    };
  } catch (error) {
    console.error(JSON.stringify({ message: "topic_research_run_read_failed", runId, error: error instanceof Error ? error.message : "Unknown error" }));
    return { status: 500, body: { ok: false, error: "Detail riset belum tersedia." } };
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function metric(value: number | null | undefined): number {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

export function analyzeTopicResearchPost(
  post: NormalizedTopicResearchPost,
  topic: string,
  keywords: string[] = [],
  nowMs = Date.now()
): TopicResearchPostAnalysis {
  const likes = metric(post.likes);
  const replies = metric(post.replies);
  const reposts = metric(post.reposts);
  const quotes = metric(post.quotes);
  const views = metric(post.views);
  const engagement = likes + replies + reposts + quotes;
  const createdMs = post.createdAt ? Date.parse(post.createdAt) : NaN;
  const ageHours = Number.isFinite(createdMs) ? Math.max(1, (nowMs - createdMs) / 3_600_000) : null;
  const velocityPerHour = ageHours ? engagement / ageHours : 0;
  const relevanceScore = scoreTopicRelevance(post.text, topic, keywords);
  const engagementRate = views > 0 ? engagement / views : post.followers && post.followers > 0 ? engagement / post.followers : null;
  const baseScore = Math.log10(engagement + 1) * 12 + Math.log10(velocityPerHour + 1) * 10;
  const rateScore = engagementRate === null ? 0 : clamp(engagementRate * 1000, 0, 25);
  let copyPatternScore = 0;

  const evidence: string[] = [];
  const whyItMayWork: string[] = [];
  if (engagement > 0) evidence.push(`Interaksi teramati: ${Math.round(engagement)}.`);
  if (ageHours !== null) evidence.push(`Kecepatan interaksi dihitung dari umur posting sekitar ${Math.round(ageHours)} jam.`);
  if (views > 0) evidence.push("Rasio interaksi terhadap views tersedia pada snapshot ini.");
  if (post.followers === null || post.followers === undefined) evidence.push("Followers akun tidak tersedia; skor tidak dinormalisasi terhadap ukuran akun.");

  if (/[?？]/.test(post.text)) { whyItMayWork.push("Hook menggunakan pertanyaan yang dapat memancing pengalaman pembaca."); copyPatternScore += 8; }
  if (/\b(tapi|namun|bukan|kenapa|ternyata|padahal)\b/i.test(post.text)) { whyItMayWork.push("Ada kontras atau diagnosis yang membuat pembaca ingin mengetahui penyebabnya."); copyPatternScore += 10; }
  if (/\b(omzet|omset|cashflow|cash flow|arus kas|kas|margin|stok|pelanggan|usaha|bisnis|umkm|jualan|penjualan)\b/i.test(post.text)) { whyItMayWork.push("Bahasanya menyebut masalah bisnis yang spesifik dan mudah dikenali target UMKM."); copyPatternScore += 12; }
  if (post.text.length > 0 && post.text.length <= 240) { whyItMayWork.push("Pesan relatif ringkas sehingga inti gagasan cepat terlihat."); copyPatternScore += 8; }
  if (whyItMayWork.length === 0) whyItMayWork.push("Belum ada pola copy yang cukup kuat untuk disimpulkan dari metadata ini.");

  const patternScore = Math.round(clamp(baseScore + rateScore + relevanceScore * 0.25 + copyPatternScore, 0, 100));

  const confidence: TopicResearchPostAnalysis["confidence"] =
    engagement > 0 && (views > 0 || post.followers !== null && post.followers !== undefined) ? "medium" : "low";

  return {
    relevanceScore,
    patternScore,
    viralityScore: patternScore,
    engagement,
    velocityPerHour: Math.round(velocityPerHour * 100) / 100,
    evidence,
    whyItMayWork,
    confidence
  };
}
