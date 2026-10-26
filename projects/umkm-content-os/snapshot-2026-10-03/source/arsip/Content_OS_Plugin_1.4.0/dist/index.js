// src/index.ts
import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";

// src/meta-threads.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
var META_GRAPH_ORIGIN = "https://graph.threads.net";
var META_TOKEN_ENV = "META_THREADS_ACCESS_TOKEN";
var META_USER_ID_ENV = "META_THREADS_USER_ID";
var META_API_VERSION_ENV = "META_THREADS_API_VERSION";
var DEFAULT_META_API_VERSION = "v1.0";
var META_TIMEOUT_MS = 3e4;
var MAX_META_RESPONSE_BYTES = 2 * 1024 * 1024;
var MAX_IDEMPOTENCY_ENTRIES = 500;
var AUTO_REPLY_STATE_VERSION = 1;
var AUTO_REPLY_POLICY_ID = "UMKM_SAFE_AUTO_REPLY_V1";
var MAX_AUTO_REPLIES_PER_RUN = 3;
var MAX_AUTO_REPLY_DECISIONS_PER_RUN = 20;
var MAX_AUTO_REPLY_STATE_ENTRIES = 5e3;
var THREADS_INSIGHT_METRICS = [
  "views",
  "likes",
  "replies",
  "reposts",
  "quotes",
  "shares"
];
var writeOperations = /* @__PURE__ */ new Map();
var autoReplyStateQueue = Promise.resolve();
var BLOCKED_CONTENT_PATTERNS = [
  {
    reason: "personal_data",
    pattern: /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+62|62|0)8\d{7,})/i
  },
  {
    reason: "transaction",
    pattern: /\b(refund|pengembalian dana|transfer|rekening|pembayaran|bayar|invoice|pesanan|order|resi|alamat pengiriman)\b/i
  },
  {
    reason: "sensitive",
    pattern: /\b(politik|pemilu|partai|agama|suku|ras|kesehatan|diagnosis medis|obat|hukum|legal|penipuan|scam|ancaman|kekerasan)\b/i
  },
  {
    reason: "sensitive",
    pattern: /\b(kecewa|komplain|keluhan|marah|buruk sekali|tidak profesional)\b/i
  }
];
function normalizeApiVersion(value) {
  const version = value?.trim() || DEFAULT_META_API_VERSION;
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error(
      `${META_API_VERSION_ENV} must use the form v1.0, v2.0, and so on.`
    );
  }
  return version;
}
function requireMetaCredentials(environment = process.env) {
  const accessToken = environment[META_TOKEN_ENV]?.trim();
  const userId = environment[META_USER_ID_ENV]?.trim();
  if (!accessToken) {
    throw new Error(
      `Missing ${META_TOKEN_ENV}. Store a newly generated token in the OpenClaw runtime environment and restart the Gateway.`
    );
  }
  if (!userId || !/^\d{5,30}$/.test(userId)) {
    throw new Error(
      `Missing or invalid ${META_USER_ID_ENV}. It must contain the numeric Threads user ID.`
    );
  }
  return {
    accessToken,
    userId,
    apiVersion: normalizeApiVersion(environment[META_API_VERSION_ENV])
  };
}
function validateThreadsId(value, label) {
  const normalized = value.trim();
  if (!/^\d{5,30}$/.test(normalized)) {
    throw new Error(`${label} must be a numeric Threads ID.`);
  }
  return normalized;
}
function createSignal(parentSignal) {
  const timeoutSignal = AbortSignal.timeout(META_TIMEOUT_MS);
  return parentSignal ? AbortSignal.any([parentSignal, timeoutSignal]) : timeoutSignal;
}
async function readMetaJson(response) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_META_RESPONSE_BYTES) {
    throw new Error("Meta Threads response exceeded the 2 MB safety limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Meta Threads returned an empty response body.");
  }
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_META_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Meta Threads response exceeded the 2 MB safety limit.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(merged);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Meta Threads returned a non-JSON response.");
  }
}
function getMetaError(payload) {
  if (!payload || typeof payload !== "object") return "Request rejected";
  const error = "error" in payload ? payload.error : null;
  if (!error || typeof error !== "object") return "Request rejected";
  const message = "message" in error ? String(error.message) : "Request rejected";
  return message.replace(/[\r\n]+/g, " ").slice(0, 300);
}
async function metaRequest(credentials, path, options) {
  const url = new URL(
    `/${credentials.apiVersion}/${path.replace(/^\/+/, "")}`,
    META_GRAPH_ORIGIN
  );
  if (options.query) url.search = options.query.toString();
  let response;
  try {
    response = await fetch(url, {
      method: options.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${credentials.accessToken}`,
        ...options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}
      },
      body: options.body?.toString(),
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      signal: createSignal(options.signal)
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Meta Threads request timed out or was cancelled.");
    }
    throw new Error("Meta Threads request could not be completed.");
  }
  const payload = await readMetaJson(response);
  if (!response.ok) {
    throw new Error(
      `Meta Threads returned HTTP ${response.status}: ${getMetaError(payload)}`
    );
  }
  return payload;
}
function readId(payload, label) {
  if (!payload || typeof payload !== "object" || !("id" in payload)) {
    throw new Error(`Meta Threads did not return ${label}.`);
  }
  return validateThreadsId(String(payload.id), label);
}
function rememberWrite(key, entry) {
  writeOperations.set(key, entry);
  if (writeOperations.size <= MAX_IDEMPOTENCY_ENTRIES) return;
  const oldest = writeOperations.keys().next().value;
  if (oldest) writeOperations.delete(oldest);
}
async function executeWriteOnce(operation, idempotencyKey, fingerprint, action) {
  const normalizedKey = idempotencyKey.trim();
  const mapKey = `${operation}:${normalizedKey}`;
  const previous = writeOperations.get(mapKey);
  if (previous) {
    if (previous.fingerprint !== fingerprint) {
      throw new Error(
        "The idempotency key was already used with different write parameters."
      );
    }
    const result = await previous.promise;
    return { ...result, duplicate: true };
  }
  const promise = action();
  rememberWrite(mapKey, { fingerprint, promise });
  try {
    return await promise;
  } catch (error) {
    writeOperations.delete(mapKey);
    throw error;
  }
}
async function getOwnPostInsights(input) {
  const credentials = requireMetaCredentials();
  const postId = validateThreadsId(input.postId, "postId");
  const requestedMetrics = input.metrics?.length ? [...new Set(input.metrics)] : [...THREADS_INSIGHT_METRICS];
  const invalid = requestedMetrics.find(
    (metric) => !THREADS_INSIGHT_METRICS.includes(metric)
  );
  if (invalid) throw new Error(`Unsupported insight metric: ${invalid}`);
  const query = new URLSearchParams({ metric: requestedMetrics.join(",") });
  const data = await metaRequest(credentials, `${postId}/insights`, {
    method: "GET",
    query,
    signal: input.signal
  });
  return {
    ok: true,
    provider: "meta_threads_api",
    metricScope: "owned_post",
    postId,
    requestedMetrics,
    data
  };
}
async function getOwnPostReplies(input) {
  const credentials = requireMetaCredentials();
  const postId = validateThreadsId(input.postId, "postId");
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const query = new URLSearchParams({
    fields: "id,text,username,timestamp,permalink,is_reply_owned_by_me",
    limit: String(limit)
  });
  const data = await metaRequest(credentials, `${postId}/replies`, {
    method: "GET",
    query,
    signal: input.signal
  });
  return {
    ok: true,
    provider: "meta_threads_api",
    postId,
    limit,
    data
  };
}
async function getRecentOwnPosts(input) {
  const credentials = requireMetaCredentials();
  const limit = Math.min(5, Math.max(1, input.limit ?? 3));
  const query = new URLSearchParams({
    fields: "id,text,permalink,timestamp,media_type",
    limit: String(limit)
  });
  const data = await metaRequest(credentials, `${credentials.userId}/threads`, {
    method: "GET",
    query,
    signal: input.signal
  });
  return {
    ok: true,
    provider: "meta_threads_api",
    scope: "owned_recent_posts",
    limit,
    data
  };
}
async function createAndPublish(input) {
  const credentials = requireMetaCredentials();
  const normalizedText = input.text.trim();
  const replyToId = input.replyToId ? validateThreadsId(input.replyToId, "replyToId") : void 0;
  const fingerprint = JSON.stringify({
    text: normalizedText,
    replyToId: replyToId ?? null,
    shareToInstagramStory: input.shareToInstagramStory
  });
  return executeWriteOnce(
    input.operation,
    input.idempotencyKey,
    fingerprint,
    async () => {
      const createBody = new URLSearchParams({
        media_type: "TEXT",
        text: normalizedText
      });
      if (replyToId) createBody.set("reply_to_id", replyToId);
      if (input.shareToInstagramStory) {
        createBody.set("crossreshare_to_ig", "true");
      }
      const created = await metaRequest(credentials, `${credentials.userId}/threads`, {
        method: "POST",
        body: createBody,
        signal: input.signal
      });
      const containerId = readId(created, "creation container ID");
      const published = await metaRequest(
        credentials,
        `${credentials.userId}/threads_publish`,
        {
          method: "POST",
          body: new URLSearchParams({ creation_id: containerId }),
          signal: input.signal
        }
      );
      const postId = readId(published, "published post ID");
      return {
        ok: true,
        provider: "meta_threads_api",
        operation: input.operation,
        duplicate: false,
        containerId,
        postId,
        shareToInstagramStory: input.shareToInstagramStory,
        requestCount: 2
      };
    }
  );
}
async function publishTextPost(input) {
  return createAndPublish({
    operation: "publish",
    text: input.text,
    shareToInstagramStory: input.shareToInstagramStory ?? false,
    idempotencyKey: input.idempotencyKey,
    signal: input.signal
  });
}
async function replyToPost(input) {
  return createAndPublish({
    operation: "reply",
    text: input.text,
    replyToId: input.replyToId,
    shareToInstagramStory: false,
    idempotencyKey: input.idempotencyKey,
    signal: input.signal
  });
}
function getAutoReplyStatePath() {
  const override = process.env.META_THREADS_AUTOREPLY_STATE_FILE?.trim();
  if (override) {
    if (!isAbsolute(override)) {
      throw new Error("META_THREADS_AUTOREPLY_STATE_FILE must be absolute.");
    }
    return override;
  }
  const stateRoot = process.env.OPENCLAW_STATE_DIR?.trim() || join(homedir(), ".openclaw");
  return join(stateRoot, "state", "umkm-content-os", "auto-reply-v1.json");
}
async function readAutoReplyState(statePath) {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8"));
    if (parsed.version !== AUTO_REPLY_STATE_VERSION || !parsed.handled || typeof parsed.handled !== "object" || Array.isArray(parsed.handled)) {
      throw new Error("invalid state shape");
    }
    return {
      version: AUTO_REPLY_STATE_VERSION,
      handled: parsed.handled
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { version: AUTO_REPLY_STATE_VERSION, handled: {} };
    }
    throw new Error("Auto-reply state could not be read safely.");
  }
}
async function writeAutoReplyState(statePath, state) {
  const orderedEntries = Object.entries(state.handled).sort(([, left], [, right]) => left.handledAt.localeCompare(right.handledAt)).slice(-MAX_AUTO_REPLY_STATE_ENTRIES);
  const boundedState = {
    version: AUTO_REPLY_STATE_VERSION,
    handled: Object.fromEntries(orderedEntries)
  };
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(boundedState, null, 2), {
    encoding: "utf8",
    mode: 384
  });
}
async function withAutoReplyStateLock(action) {
  let release = () => {
  };
  const previous = autoReplyStateQueue;
  autoReplyStateQueue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await action();
  } finally {
    release();
  }
}
function classifyBlockedContent(text) {
  for (const rule of BLOCKED_CONTENT_PATTERNS) {
    if (rule.pattern.test(text)) return rule.reason;
  }
  return null;
}
function normalizeAutoReplyDecision(decision) {
  const replyToId = validateThreadsId(decision.replyToId, "replyToId");
  const sourceText = decision.sourceText.trim().replace(/\s+/g, " ").slice(0, 1e3);
  const username = decision.username?.trim().replace(/^@+/, "").slice(0, 64);
  const replyText = decision.replyText?.trim().replace(/\s+/g, " ").slice(0, 300);
  if (!sourceText) throw new Error(`Missing sourceText for reply ${replyToId}.`);
  if (decision.action === "reply" && !replyText) {
    throw new Error(`Missing replyText for reply ${replyToId}.`);
  }
  if (decision.action !== "reply" && !decision.reason) {
    throw new Error(`Missing reason for ${decision.action} decision ${replyToId}.`);
  }
  return {
    ...decision,
    replyToId,
    sourceText,
    username,
    replyText
  };
}
async function executeAutoReplyPolicyBatch(input) {
  if (input.policyApproval !== "APPROVE_AUTO_REPLY_POLICY_V1") {
    throw new Error("The approved auto-reply policy is required.");
  }
  const runId = input.runId.trim().slice(0, 128);
  if (runId.length < 8) throw new Error("runId must contain at least 8 characters.");
  if (input.decisions.length < 1 || input.decisions.length > MAX_AUTO_REPLY_DECISIONS_PER_RUN) {
    throw new Error(
      `Auto-reply decisions must contain 1-${MAX_AUTO_REPLY_DECISIONS_PER_RUN} items.`
    );
  }
  const decisions = input.decisions.map(normalizeAutoReplyDecision);
  const replyCount = decisions.filter((item) => item.action === "reply").length;
  if (replyCount > MAX_AUTO_REPLIES_PER_RUN) {
    throw new Error(
      `Auto-reply policy allows at most ${MAX_AUTO_REPLIES_PER_RUN} replies per run.`
    );
  }
  if (new Set(decisions.map((item) => item.replyToId)).size !== decisions.length) {
    throw new Error("Auto-reply decisions contain duplicate replyToId values.");
  }
  return withAutoReplyStateLock(async () => {
    const statePath = getAutoReplyStatePath();
    const state = await readAutoReplyState(statePath);
    const results = [];
    for (const decision of decisions) {
      if (state.handled[decision.replyToId]) {
        results.push({
          replyToId: decision.replyToId,
          status: "already_handled",
          action: state.handled[decision.replyToId].action
        });
        continue;
      }
      const handledAt = (/* @__PURE__ */ new Date()).toISOString();
      if (decision.action === "escalate" || decision.action === "ignore") {
        const action = decision.action === "escalate" ? "escalated" : "ignored";
        state.handled[decision.replyToId] = {
          handledAt,
          runId,
          action,
          reason: decision.reason
        };
        await writeAutoReplyState(statePath, state);
        results.push({
          replyToId: decision.replyToId,
          username: decision.username ?? null,
          status: action,
          reason: decision.reason
        });
        continue;
      }
      const sourceBlock = classifyBlockedContent(decision.sourceText);
      const replyBlock = classifyBlockedContent(decision.replyText ?? "");
      if (!decision.sourceText.includes("?") || sourceBlock || replyBlock) {
        const reason = !decision.sourceText.includes("?") ? "not_a_question" : sourceBlock || replyBlock || "sensitive";
        state.handled[decision.replyToId] = {
          handledAt,
          runId,
          action: "escalated",
          reason
        };
        await writeAutoReplyState(statePath, state);
        results.push({
          replyToId: decision.replyToId,
          username: decision.username ?? null,
          status: "escalated_by_guard",
          reason
        });
        continue;
      }
      try {
        const published = await replyToPost({
          replyToId: decision.replyToId,
          text: decision.replyText ?? "",
          idempotencyKey: `auto-reply:${decision.replyToId}`,
          signal: input.signal
        });
        state.handled[decision.replyToId] = {
          handledAt,
          runId,
          action: "replied",
          replyPostId: published.postId
        };
        await writeAutoReplyState(statePath, state);
        results.push({
          replyToId: decision.replyToId,
          username: decision.username ?? null,
          status: "replied",
          replyPostId: published.postId,
          duplicate: published.duplicate,
          requestCount: published.requestCount
        });
      } catch (error) {
        results.push({
          replyToId: decision.replyToId,
          username: decision.username ?? null,
          status: "failed_no_retry",
          error: error instanceof Error ? error.message.slice(0, 300) : "Unknown error"
        });
      }
    }
    const counts = results.reduce((summary, result) => {
      const status = String(result.status);
      summary[status] = (summary[status] ?? 0) + 1;
      return summary;
    }, {});
    return {
      ok: !results.some((item) => item.status === "failed_no_retry"),
      partial: results.some((item) => item.status === "failed_no_retry"),
      provider: "meta_threads_api",
      policy: AUTO_REPLY_POLICY_ID,
      runId,
      maxRepliesPerRun: MAX_AUTO_REPLIES_PER_RUN,
      processedCount: results.length,
      counts,
      results,
      retryPerformed: false,
      statePersisted: true
    };
  });
}

// src/index.ts
var WEBHOOK_URL = "https://umkmnaikkelas.app.n8n.cloud/webhook/umkm-content-os/topic-research";
var TOKEN_ENV = "UMKM_CONTENT_OS_TOKEN";
var MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
var REQUEST_TIMEOUT_MS = 6e4;
var VIRAL_ANALYZER_REQUEST_TIMEOUT_MS = 9e4;
function normalizeText(value, maxLength) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}
function buildRequestBody(input) {
  const topic = normalizeText(input.topic, 500);
  if (topic.length < 3) {
    throw new Error("Topic must contain at least 3 non-space characters.");
  }
  const keywords = (input.keywords ?? []).map((item) => normalizeText(item, 100)).filter(Boolean).slice(0, 10);
  return {
    topic,
    platform: input.platform ?? "threads",
    lookbackDays: Math.min(30, Math.max(1, input.lookbackDays ?? 7)),
    keywords,
    idempotencyKey: input.idempotencyKey?.trim().slice(0, 128) || `openclaw-${Date.now()}-${crypto.randomUUID()}`
  };
}
function buildAuditRequestBody(input) {
  const username = normalizeText(input.username, 65).replace(/^@+/, "");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(username)) {
    throw new Error("Username Threads must contain only letters, numbers, dots, underscores, or hyphens.");
  }
  return {
    topic: `__account_audit__:${username}`,
    platform: "threads",
    lookbackDays: 7,
    keywords: [],
    idempotencyKey: input.idempotencyKey?.trim().slice(0, 128) || `openclaw-audit-${Date.now()}-${crypto.randomUUID()}`
  };
}
function buildViralAnalyzerRequestBody(input) {
  const request = buildRequestBody({
    ...input,
    platform: "threads",
    idempotencyKey: input.idempotencyKey?.trim().slice(0, 128) || `openclaw-viral-${Date.now()}-${crypto.randomUUID()}`
  });
  return {
    ...request,
    topic: `__viral_analyzer__:${request.topic}`
  };
}
async function readBoundedJson(response) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("Content OS response exceeded the 2 MB safety limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Content OS returned an empty response body.");
  }
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Content OS response exceeded the 2 MB safety limit.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(merged);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Content OS returned a non-JSON response.");
  }
}
var index_default = defineToolPlugin({
  id: "umkm-content-os",
  name: "UMKM Content OS",
  description: "Runs UMKM Content OS research and bounded official Meta Threads operations.",
  tools: (tool) => [
    tool({
      name: "umkm_topic_research",
      label: "UMKM Topic Research",
      description: "Research relevant public accounts and high-performing content for a topic through UMKM Content OS. Use only when the user asks for topic, creator, competitor, or viral-content research.",
      optional: true,
      parameters: Type.Object(
        {
          topic: Type.String({ minLength: 3, maxLength: 500 }),
          platform: Type.Optional(
            Type.Union([
              Type.Literal("threads"),
              Type.Literal("instagram"),
              Type.Literal("tiktok"),
              Type.Literal("x"),
              Type.Literal("youtube")
            ])
          ),
          lookbackDays: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 30, default: 7 })
          ),
          keywords: Type.Optional(
            Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
              maxItems: 10
            })
          ),
          idempotencyKey: Type.Optional(
            Type.String({ minLength: 1, maxLength: 128 })
          )
        },
        { additionalProperties: false }
      ),
      async execute(input, _config, context) {
        const token = process.env[TOKEN_ENV]?.trim();
        if (!token) {
          throw new Error(
            `Missing ${TOKEN_ENV}. Save it in the global OpenClaw .env file and restart the Gateway.`
          );
        }
        const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;
        let response;
        try {
          response = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-OpenClaw-Token": token
            },
            body: JSON.stringify(buildRequestBody(input)),
            redirect: "error",
            cache: "no-store",
            credentials: "omit",
            signal
          });
        } catch (error) {
          if (error instanceof Error && error.name === "TimeoutError") {
            throw new Error("Content OS request timed out after 60 seconds.");
          }
          throw new Error("Content OS request could not be completed.");
        }
        const payload = await readBoundedJson(response);
        if (!response.ok) {
          const reason = payload && typeof payload === "object" && "message" in payload ? String(payload.message).slice(0, 300) : "Request rejected";
          throw new Error(`Content OS returned HTTP ${response.status}: ${reason}`);
        }
        return payload;
      }
    }),
    tool({
      name: "umkm_account_audit",
      label: "UMKM Account Audit",
      description: "Audit one public Threads account through UMKM Content OS. Returns profile statistics and recent public content when available. Read-only: never likes, comments, follows, messages, drafts, or publishes.",
      optional: true,
      parameters: Type.Object(
        {
          username: Type.String({
            minLength: 1,
            maxLength: 65,
            pattern: "^@?[A-Za-z0-9._-]{1,64}$"
          }),
          idempotencyKey: Type.Optional(
            Type.String({ minLength: 1, maxLength: 128 })
          )
        },
        { additionalProperties: false }
      ),
      async execute(input, _config, context) {
        const token = process.env[TOKEN_ENV]?.trim();
        if (!token) {
          throw new Error(
            `Missing ${TOKEN_ENV}. Save it in the global OpenClaw .env file and restart the Gateway.`
          );
        }
        const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;
        let response;
        try {
          response = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-OpenClaw-Token": token
            },
            body: JSON.stringify(buildAuditRequestBody(input)),
            redirect: "error",
            cache: "no-store",
            credentials: "omit",
            signal
          });
        } catch (error) {
          if (error instanceof Error && error.name === "TimeoutError") {
            throw new Error("Content OS account audit timed out after 60 seconds.");
          }
          throw new Error("Content OS account audit could not be completed.");
        }
        const payload = await readBoundedJson(response);
        if (!response.ok) {
          const reason = payload && typeof payload === "object" && "message" in payload ? String(payload.message).slice(0, 300) : "Request rejected";
          throw new Error(`Content OS returned HTTP ${response.status}: ${reason}`);
        }
        return payload;
      }
    }),
    tool({
      name: "umkm_viral_analyzer",
      label: "UMKM Viral Content Analyzer",
      description: "Analyze up to five relevant public Threads posts using per-post views, engagement, follower normalization, post age, and an explicitly labeled median baseline. Read-only and evidence-bounded: never claims virality when metrics are insufficient.",
      optional: true,
      parameters: Type.Object(
        {
          topic: Type.String({ minLength: 3, maxLength: 500 }),
          lookbackDays: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 30, default: 7 })
          ),
          keywords: Type.Optional(
            Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
              maxItems: 10
            })
          ),
          idempotencyKey: Type.Optional(
            Type.String({ minLength: 1, maxLength: 128 })
          )
        },
        { additionalProperties: false }
      ),
      async execute(input, _config, context) {
        const token = process.env[TOKEN_ENV]?.trim();
        if (!token) {
          throw new Error(
            `Missing ${TOKEN_ENV}. Save it in the global OpenClaw .env file and restart the Gateway.`
          );
        }
        const timeoutSignal = AbortSignal.timeout(
          VIRAL_ANALYZER_REQUEST_TIMEOUT_MS
        );
        const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;
        let response;
        try {
          response = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-OpenClaw-Token": token
            },
            body: JSON.stringify(buildViralAnalyzerRequestBody(input)),
            redirect: "error",
            cache: "no-store",
            credentials: "omit",
            signal
          });
        } catch (error) {
          if (error instanceof Error && error.name === "TimeoutError") {
            throw new Error(
              "Content OS viral analysis timed out after 90 seconds."
            );
          }
          throw new Error("Content OS viral analysis could not be completed.");
        }
        const payload = await readBoundedJson(response);
        if (!response.ok) {
          const reason = payload && typeof payload === "object" && "message" in payload ? String(payload.message).slice(0, 300) : "Request rejected";
          throw new Error(`Content OS returned HTTP ${response.status}: ${reason}`);
        }
        return payload;
      }
    }),
    tool({
      name: "umkm_threads_own_insights",
      label: "UMKM Threads Own-Post Insights",
      description: "Read official Meta insights for one Threads post owned by the connected @umkmnaikkelas.id account. Read-only. Never use this tool for competitor posts and never invent unavailable metrics.",
      optional: true,
      parameters: Type.Object(
        {
          postId: Type.String({ minLength: 5, maxLength: 30, pattern: "^[0-9]+$" }),
          metrics: Type.Optional(
            Type.Array(
              Type.Union(
                THREADS_INSIGHT_METRICS.map((metric) => Type.Literal(metric))
              ),
              { minItems: 1, maxItems: THREADS_INSIGHT_METRICS.length }
            )
          )
        },
        { additionalProperties: false }
      ),
      async execute(input, _config, context) {
        return getOwnPostInsights({
          postId: input.postId,
          metrics: input.metrics,
          signal: context.signal
        });
      }
    }),
    tool({
      name: "umkm_threads_read_replies",
      label: "UMKM Threads Read Replies",
      description: "Read replies to one Threads post owned by the connected account. Read-only: never replies, hides, deletes, likes, or publishes.",
      optional: true,
      parameters: Type.Object(
        {
          postId: Type.String({ minLength: 5, maxLength: 30, pattern: "^[0-9]+$" }),
          limit: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 100, default: 25 })
          )
        },
        { additionalProperties: false }
      ),
      async execute(input, _config, context) {
        return getOwnPostReplies({
          postId: input.postId,
          limit: input.limit,
          signal: context.signal
        });
      }
    }),
    tool({
      name: "umkm_threads_publish",
      label: "UMKM Threads Publish",
      description: "Publish one text post to the connected Threads account through the official Meta API. Call only after the user explicitly approves the exact text in the current conversation. Can cross-share the new Threads post to the linked Instagram account as a Story. Never retries automatically.",
      optional: true,
      parameters: Type.Object(
        {
          text: Type.String({ minLength: 1, maxLength: 500 }),
          shareToInstagramStory: Type.Optional(Type.Boolean({ default: false })),
          approval: Type.Literal("APPROVE_PUBLISH"),
          idempotencyKey: Type.String({ minLength: 8, maxLength: 128 })
        },
        { additionalProperties: false }
      ),
      async execute(input, _config, context) {
        if (input.approval !== "APPROVE_PUBLISH") {
          throw new Error("Explicit publish approval is required.");
        }
        return publishTextPost({
          text: input.text,
          shareToInstagramStory: input.shareToInstagramStory,
          idempotencyKey: input.idempotencyKey,
          signal: context.signal
        });
      }
    }),
    tool({
      name: "umkm_threads_reply",
      label: "UMKM Threads Reply",
      description: "Publish one reply from the connected Threads account through the official Meta API. Call only after the user explicitly approves the exact reply in the current conversation. Never generates approval, never bulk-replies, and never retries automatically.",
      optional: true,
      parameters: Type.Object(
        {
          replyToId: Type.String({ minLength: 5, maxLength: 30, pattern: "^[0-9]+$" }),
          text: Type.String({ minLength: 1, maxLength: 500 }),
          approval: Type.Literal("APPROVE_REPLY"),
          idempotencyKey: Type.String({ minLength: 8, maxLength: 128 })
        },
        { additionalProperties: false }
      ),
      async execute(input, _config, context) {
        if (input.approval !== "APPROVE_REPLY") {
          throw new Error("Explicit reply approval is required.");
        }
        return replyToPost({
          replyToId: input.replyToId,
          text: input.text,
          idempotencyKey: input.idempotencyKey,
          signal: context.signal
        });
      }
    }),
    tool({
      name: "umkm_threads_recent_posts",
      label: "UMKM Threads Recent Own Posts",
      description: "Read up to five recent posts owned by the connected Threads account. Read-only and intended for the approved auto-reply monitor.",
      optional: true,
      parameters: Type.Object(
        {
          limit: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 5, default: 3 })
          )
        },
        { additionalProperties: false }
      ),
      async execute(input, _config, context) {
        return getRecentOwnPosts({
          limit: input.limit,
          signal: context.signal
        });
      }
    }),
    tool({
      name: "umkm_threads_auto_reply_batch",
      label: "UMKM Threads Guarded Auto Reply",
      description: "Apply the owner-approved UMKM_SAFE_AUTO_REPLY_V1 policy to one scheduled batch. Handles at most three replies, persists every decision, escalates sensitive content, and never retries. Use only from the approved 10-minute automation.",
      optional: true,
      parameters: Type.Object(
        {
          runId: Type.String({ minLength: 8, maxLength: 128 }),
          policyApproval: Type.Literal("APPROVE_AUTO_REPLY_POLICY_V1"),
          decisions: Type.Array(
            Type.Object(
              {
                replyToId: Type.String({
                  minLength: 5,
                  maxLength: 30,
                  pattern: "^[0-9]+$"
                }),
                username: Type.Optional(
                  Type.String({ minLength: 1, maxLength: 65 })
                ),
                sourceText: Type.String({ minLength: 1, maxLength: 1e3 }),
                action: Type.Union([
                  Type.Literal("reply"),
                  Type.Literal("escalate"),
                  Type.Literal("ignore")
                ]),
                replyText: Type.Optional(
                  Type.String({ minLength: 1, maxLength: 300 })
                ),
                reason: Type.Optional(
                  Type.Union([
                    Type.Literal("sensitive"),
                    Type.Literal("transaction"),
                    Type.Literal("personal_data"),
                    Type.Literal("spam"),
                    Type.Literal("not_a_question"),
                    Type.Literal("not_relevant"),
                    Type.Literal("capacity_limit")
                  ])
                )
              },
              { additionalProperties: false }
            ),
            { minItems: 1, maxItems: 20 }
          )
        },
        { additionalProperties: false }
      ),
      async execute(input, _config, context) {
        return executeAutoReplyPolicyBatch({
          runId: input.runId,
          policyApproval: input.policyApproval,
          decisions: input.decisions,
          signal: context.signal
        });
      }
    })
  ]
});
export {
  index_default as default
};
