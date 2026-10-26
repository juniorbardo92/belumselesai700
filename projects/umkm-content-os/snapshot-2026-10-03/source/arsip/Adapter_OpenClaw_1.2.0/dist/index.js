import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";

const WEBHOOK_URL =
  "https://umkmnaikkelas.app.n8n.cloud/webhook/umkm-content-os/topic-research";
const TOKEN_ENV = "UMKM_CONTENT_OS_TOKEN";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
const VIRAL_ANALYZER_REQUEST_TIMEOUT_MS = 90_000;

function normalizeText(value, maxLength) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function buildRequestBody(input) {
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
    idempotencyKey:
      input.idempotencyKey?.trim().slice(0, 128) ||
      `openclaw-audit-${Date.now()}-${crypto.randomUUID()}`,
  };
}

function buildViralAnalyzerRequestBody(input) {
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

export default defineToolPlugin({
  id: "umkm-content-os",
  name: "UMKM Content OS",
  description: "Researches a topic through the UMKM Content OS production workflow.",
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

        let response;
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
              ? String(payload.message).slice(0, 300)
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

        let response;
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
              ? String(payload.message).slice(0, 300)
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

        let response;
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
              ? String(payload.message).slice(0, 300)
              : "Request rejected";
          throw new Error(`Content OS returned HTTP ${response.status}: ${reason}`);
        }

        return payload;
      },
    }),
  ],
});
