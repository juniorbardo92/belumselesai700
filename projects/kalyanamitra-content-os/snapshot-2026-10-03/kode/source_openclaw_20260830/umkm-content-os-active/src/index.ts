import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import {
  executeAutoReplyPolicyBatch,
  getOwnPostInsights,
  getOwnPostReplies,
  getRecentOwnPosts,
  publishTextPost,
  replyToPost,
  THREADS_INSIGHT_METRICS,
} from "./meta-threads.js";

const WEBHOOK_URL =
  "https://umkm-content-os-ingress.ruang-belajar-mandiri01.workers.dev/webhook/umkm-content-os/topic-research";
const TOKEN_ENV = "UMKM_CONTENT_OS_TOKEN";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
const VIRAL_ANALYZER_REQUEST_TIMEOUT_MS = 90_000;

type TopicResearchInput = {
  topic: string;
  platform?: "threads" | "instagram" | "tiktok" | "x" | "youtube";
  lookbackDays?: number;
  keywords?: string[];
  idempotencyKey?: string;
};

type AccountAuditInput = {
  username: string;
  idempotencyKey?: string;
};

type ViralAnalyzerInput = {
  topic: string;
  lookbackDays?: number;
  keywords?: string[];
  idempotencyKey?: string;
};

function normalizeText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function buildRequestBody(input: TopicResearchInput) {
  const topic = normalizeText(input.topic, 500);
  if (topic.length < 3) {
    throw new Error("Topic must contain at least 3 non-space characters.");
  }

  const keywords = (input.keywords ?? [])
    .map((item) => normalizeText(item, 100))
    .filter(Boolean)
    .slice(0, 10);

  return {
    topic,
    platform: input.platform ?? "threads",
    lookbackDays: Math.min(30, Math.max(1, input.lookbackDays ?? 7)),
    keywords,
    idempotencyKey:
      input.idempotencyKey?.trim().slice(0, 128) ||
      `openclaw-${Date.now()}-${crypto.randomUUID()}`,
  };
}

function buildAuditRequestBody(input: AccountAuditInput) {
  const username = normalizeText(input.username, 65).replace(/^@+/, "");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(username)) {
    throw new Error("Username Threads must contain only letters, numbers, dots, underscores, or hyphens.");
  }

  return {
    topic: `__account_audit__:${username}`,
    platform: "threads" as const,
    lookbackDays: 7,
    keywords: [],
    idempotencyKey:
      input.idempotencyKey?.trim().slice(0, 128) ||
      `openclaw-audit-${Date.now()}-${crypto.randomUUID()}`,
  };
}

function buildViralAnalyzerRequestBody(input: ViralAnalyzerInput) {
  const request = buildRequestBody({
    ...input,
    platform: "threads",
    idempotencyKey:
      input.idempotencyKey?.trim().slice(0, 128) ||
      `openclaw-viral-${Date.now()}-${crypto.randomUUID()}`,
  });

  return {
    ...request,
    topic: `__viral_analyzer__:${request.topic}`,
  };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("Content OS response exceeded the 2 MB safety limit.");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Content OS returned an empty response body.");
  }

  const chunks: Uint8Array[] = [];
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

export default defineToolPlugin({
  id: "umkm-content-os",
  name: "UMKM Content OS",
  description:
    "Runs UMKM Content OS research and bounded official Meta Threads operations.",
  tools: (tool) => [
    tool({
      name: "umkm_topic_research",
      label: "UMKM Topic Research",
      description:
        "Research relevant public accounts and high-performing content for a topic through UMKM Content OS. Use only when the user asks for topic, creator, competitor, or viral-content research.",
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
              Type.Literal("youtube"),
            ]),
          ),
          lookbackDays: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 30, default: 7 }),
          ),
          keywords: Type.Optional(
            Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
              maxItems: 10,
            }),
          ),
          idempotencyKey: Type.Optional(
            Type.String({ minLength: 1, maxLength: 128 }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(input, _config, context) {
        const token = process.env[TOKEN_ENV]?.trim();
        if (!token) {
          throw new Error(
            `Missing ${TOKEN_ENV}. Save it in the global OpenClaw .env file and restart the Gateway.`,
          );
        }

        const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        const signal = context.signal
          ? AbortSignal.any([context.signal, timeoutSignal])
          : timeoutSignal;

        let response: Response;
        try {
          response = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-OpenClaw-Token": token,
            },
            body: JSON.stringify(buildRequestBody(input)),
            redirect: "error",
            cache: "no-store",
            credentials: "omit",
            signal,
          });
        } catch (error) {
          if (error instanceof Error && error.name === "TimeoutError") {
            throw new Error("Content OS request timed out after 60 seconds.");
          }
          throw new Error("Content OS request could not be completed.");
        }

        const payload = await readBoundedJson(response);
        if (!response.ok) {
          const reason =
            payload && typeof payload === "object" && "message" in payload
              ? String((payload as { message?: unknown }).message).slice(0, 300)
              : "Request rejected";
          throw new Error(`Content OS returned HTTP ${response.status}: ${reason}`);
        }

        return payload;
      },
    }),
    tool({
      name: "umkm_account_audit",
      label: "UMKM Account Audit",
      description:
        "Audit one public Threads account through UMKM Content OS. Returns profile statistics and recent public content when available. Read-only: never likes, comments, follows, messages, drafts, or publishes.",
      optional: true,
      parameters: Type.Object(
        {
          username: Type.String({
            minLength: 1,
            maxLength: 65,
            pattern: "^@?[A-Za-z0-9._-]{1,64}$",
          }),
          idempotencyKey: Type.Optional(
            Type.String({ minLength: 1, maxLength: 128 }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(input, _config, context) {
        const token = process.env[TOKEN_ENV]?.trim();
        if (!token) {
          throw new Error(
            `Missing ${TOKEN_ENV}. Save it in the global OpenClaw .env file and restart the Gateway.`,
          );
        }

        const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        const signal = context.signal
          ? AbortSignal.any([context.signal, timeoutSignal])
          : timeoutSignal;

        let response: Response;
        try {
          response = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-OpenClaw-Token": token,
            },
            body: JSON.stringify(buildAuditRequestBody(input)),
            redirect: "error",
            cache: "no-store",
            credentials: "omit",
            signal,
          });
        } catch (error) {
          if (error instanceof Error && error.name === "TimeoutError") {
            throw new Error("Content OS account audit timed out after 60 seconds.");
          }
          throw new Error("Content OS account audit could not be completed.");
        }

        const payload = await readBoundedJson(response);
        if (!response.ok) {
          const reason =
            payload && typeof payload === "object" && "message" in payload
              ? String((payload as { message?: unknown }).message).slice(0, 300)
              : "Request rejected";
          throw new Error(`Content OS returned HTTP ${response.status}: ${reason}`);
        }

        return payload;
      },
    }),
    tool({
      name: "umkm_viral_analyzer",
      label: "UMKM Viral Content Analyzer",
      description:
        "Analyze up to five relevant public Threads posts using per-post views, engagement, follower normalization, post age, and an explicitly labeled median baseline. Read-only and evidence-bounded: never claims virality when metrics are insufficient.",
      optional: true,
      parameters: Type.Object(
        {
          topic: Type.String({ minLength: 3, maxLength: 500 }),
          lookbackDays: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 30, default: 7 }),
          ),
          keywords: Type.Optional(
            Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
              maxItems: 10,
            }),
          ),
          idempotencyKey: Type.Optional(
            Type.String({ minLength: 1, maxLength: 128 }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(input, _config, context) {
        const token = process.env[TOKEN_ENV]?.trim();
        if (!token) {
          throw new Error(
            `Missing ${TOKEN_ENV}. Save it in the global OpenClaw .env file and restart the Gateway.`,
          );
        }

        const timeoutSignal = AbortSignal.timeout(
          VIRAL_ANALYZER_REQUEST_TIMEOUT_MS,
        );
        const signal = context.signal
          ? AbortSignal.any([context.signal, timeoutSignal])
          : timeoutSignal;

        let response: Response;
        try {
          response = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-OpenClaw-Token": token,
            },
            body: JSON.stringify(buildViralAnalyzerRequestBody(input)),
            redirect: "error",
            cache: "no-store",
            credentials: "omit",
            signal,
          });
        } catch (error) {
          if (error instanceof Error && error.name === "TimeoutError") {
            throw new Error(
              "Content OS viral analysis timed out after 90 seconds.",
            );
          }
          throw new Error("Content OS viral analysis could not be completed.");
        }

        const payload = await readBoundedJson(response);
        if (!response.ok) {
          const reason =
            payload && typeof payload === "object" && "message" in payload
              ? String((payload as { message?: unknown }).message).slice(0, 300)
              : "Request rejected";
          throw new Error(`Content OS returned HTTP ${response.status}: ${reason}`);
        }

        return payload;
      },
    }),
    tool({
      name: "umkm_threads_own_insights",
      label: "UMKM Threads Own-Post Insights",
      description:
        "Read official Meta insights for one Threads post owned by the connected @umkmnaikkelas.id account. Read-only. Never use this tool for competitor posts and never invent unavailable metrics.",
      optional: true,
      parameters: Type.Object(
        {
          postId: Type.String({ minLength: 5, maxLength: 30, pattern: "^[0-9]+$" }),
          metrics: Type.Optional(
            Type.Array(
              Type.Union(
                THREADS_INSIGHT_METRICS.map((metric) => Type.Literal(metric)),
              ),
              { minItems: 1, maxItems: THREADS_INSIGHT_METRICS.length },
            ),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(input, _config, context) {
        return getOwnPostInsights({
          postId: input.postId,
          metrics: input.metrics,
          signal: context.signal,
        });
      },
    }),
    tool({
      name: "umkm_threads_read_replies",
      label: "UMKM Threads Read Replies",
      description:
        "Read replies to one Threads post owned by the connected account. Read-only: never replies, hides, deletes, likes, or publishes.",
      optional: true,
      parameters: Type.Object(
        {
          postId: Type.String({ minLength: 5, maxLength: 30, pattern: "^[0-9]+$" }),
          limit: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 100, default: 25 }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(input, _config, context) {
        return getOwnPostReplies({
          postId: input.postId,
          limit: input.limit,
          signal: context.signal,
        });
      },
    }),
    tool({
      name: "umkm_threads_publish",
      label: "UMKM Threads Publish",
      description:
        "Publish one text post to the connected Threads account through the official Meta API. Call only after the user explicitly approves the exact text in the current conversation. Can cross-share the new Threads post to the linked Instagram account as a Story. Never retries automatically.",
      optional: true,
      parameters: Type.Object(
        {
          text: Type.String({ minLength: 1, maxLength: 500 }),
          shareToInstagramStory: Type.Optional(Type.Boolean({ default: false })),
          approval: Type.Literal("APPROVE_PUBLISH"),
          idempotencyKey: Type.String({ minLength: 8, maxLength: 128 }),
        },
        { additionalProperties: false },
      ),
      async execute(input, _config, context) {
        if (input.approval !== "APPROVE_PUBLISH") {
          throw new Error("Explicit publish approval is required.");
        }
        return publishTextPost({
          text: input.text,
          shareToInstagramStory: input.shareToInstagramStory,
          idempotencyKey: input.idempotencyKey,
          signal: context.signal,
        });
      },
    }),
    tool({
      name: "umkm_threads_reply",
      label: "UMKM Threads Reply",
      description:
        "Publish one reply from the connected Threads account through the official Meta API. Call only after the user explicitly approves the exact reply in the current conversation. Never generates approval, never bulk-replies, and never retries automatically.",
      optional: true,
      parameters: Type.Object(
        {
          replyToId: Type.String({ minLength: 5, maxLength: 30, pattern: "^[0-9]+$" }),
          text: Type.String({ minLength: 1, maxLength: 500 }),
          approval: Type.Literal("APPROVE_REPLY"),
          idempotencyKey: Type.String({ minLength: 8, maxLength: 128 }),
        },
        { additionalProperties: false },
      ),
      async execute(input, _config, context) {
        if (input.approval !== "APPROVE_REPLY") {
          throw new Error("Explicit reply approval is required.");
        }
        return replyToPost({
          replyToId: input.replyToId,
          text: input.text,
          idempotencyKey: input.idempotencyKey,
          signal: context.signal,
        });
      },
    }),
    tool({
      name: "umkm_threads_recent_posts",
      label: "UMKM Threads Recent Own Posts",
      description:
        "Read up to five recent posts owned by the connected Threads account. Read-only and intended for the approved auto-reply monitor.",
      optional: true,
      parameters: Type.Object(
        {
          limit: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 5, default: 3 }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(input, _config, context) {
        return getRecentOwnPosts({
          limit: input.limit,
          signal: context.signal,
        });
      },
    }),
    tool({
      name: "umkm_threads_auto_reply_batch",
      label: "UMKM Threads Guarded Auto Reply",
      description:
        "Apply the owner-approved UMKM_SAFE_AUTO_REPLY_V1 policy to one scheduled batch. Handles at most three replies, persists every decision, escalates sensitive content, and never retries. Use only from the approved 10-minute automation.",
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
                  pattern: "^[0-9]+$",
                }),
                username: Type.Optional(
                  Type.String({ minLength: 1, maxLength: 65 }),
                ),
                sourceText: Type.String({ minLength: 1, maxLength: 1_000 }),
                action: Type.Union([
                  Type.Literal("reply"),
                  Type.Literal("escalate"),
                  Type.Literal("ignore"),
                ]),
                replyText: Type.Optional(
                  Type.String({ minLength: 1, maxLength: 300 }),
                ),
                reason: Type.Optional(
                  Type.Union([
                    Type.Literal("sensitive"),
                    Type.Literal("transaction"),
                    Type.Literal("personal_data"),
                    Type.Literal("spam"),
                    Type.Literal("not_a_question"),
                    Type.Literal("not_relevant"),
                    Type.Literal("capacity_limit"),
                  ]),
                ),
              },
              { additionalProperties: false },
            ),
            { minItems: 1, maxItems: 20 },
          ),
        },
        { additionalProperties: false },
      ),
      async execute(input, _config, context) {
        return executeAutoReplyPolicyBatch({
          runId: input.runId,
          policyApproval: input.policyApproval,
          decisions: input.decisions,
          signal: context.signal,
        });
      },
    }),
  ],
});
