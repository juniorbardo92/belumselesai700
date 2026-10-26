import { createTopicResearchRun } from "./topic-research-engine";

type AutomationRecord = Record<string, unknown>;

export type AutomationRuntimeStatus = {
  enabled: boolean;
  configured: boolean;
  mode: "disabled" | "signed_webhook";
  source: "n8n_or_openclaw";
  allowedWorkflows: ["topic_research"];
  note: string;
};

export type AutomationResult = {
  status: number;
  body: unknown;
};

type AutomationRunRow = {
  id: string;
  workflow: string;
  idempotency_key: string;
  status: "queued" | "completed" | "failed";
  response_json: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type AutomationEventInput = {
  eventType: string;
  runId: string | null;
  status: string;
  payload: unknown;
};

class AutomationError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string
  ) {
    super(publicMessage);
  }
}

const MAX_BODY_BYTES = 16 * 1024;
const MAX_EVENT_PAYLOAD_BYTES = 32 * 1024;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_EVENT_TYPE_LENGTH = 80;
const MAX_RUNS = 20;
const MAX_EVENTS = 50;
const AUTOMATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  workflow TEXT NOT NULL CHECK (workflow IN ('topic_research')),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'completed', 'failed')),
  request_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_created ON automation_runs(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status, created_at DESC);
CREATE TABLE IF NOT EXISTS automation_events (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_automation_events_created ON automation_events(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_automation_events_run ON automation_events(run_id, created_at DESC);
`;

function isRecord(value: unknown): value is AutomationRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readBinding(env: Env, name: string): string | undefined {
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function automationSecret(env: Env): string | undefined {
  return readBinding(env, "N8N_WEBHOOK_SECRET");
}

function isEnabled(env: Env): boolean {
  return readBinding(env, "CONTENT_OS_AUTOMATION_ENABLED") === "true" && Boolean(automationSecret(env));
}

function publicJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

function limitedJson(value: unknown, maxBytes: number): string {
  const serialized = JSON.stringify(value ?? {});
  if (new TextEncoder().encode(serialized).byteLength > maxBytes) {
    throw new AutomationError(413, "Payload otomasi terlalu besar.");
  }
  return serialized;
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
        throw new AutomationError(413, "Payload otomasi terlalu besar.");
      }
      output += decoder.decode(value, { stream: true });
    }
    return output + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function toBytes(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

async function verifySignature(request: Request, env: Env, body: string): Promise<boolean> {
  const secret = automationSecret(env);
  const timestamp = textValue(request.headers.get("X-Content-OS-Timestamp"));
  const signature = textValue(request.headers.get("X-Content-OS-Signature"));
  if (!secret || !/^\d{10}$/.test(timestamp) || !/^sha256=[0-9a-f]{64}$/i.test(signature)) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    toBytes(signature.slice("sha256=".length)),
    new TextEncoder().encode(`${timestamp}.${body}`)
  );
}

async function ensureSchema(env: Env): Promise<void> {
  await env.DB.exec(AUTOMATION_SCHEMA);
}

export function getAutomationRuntimeStatus(env: Env): AutomationRuntimeStatus {
  const configured = Boolean(automationSecret(env));
  const enabled = isEnabled(env);
  return {
    enabled,
    configured,
    mode: enabled ? "signed_webhook" : "disabled",
    source: "n8n_or_openclaw",
    allowedWorkflows: ["topic_research"],
    note: enabled
      ? "n8n/OpenClaw dapat memanggil workflow riset melalui webhook bertanda tangan. Publisher dan renderer tidak dipanggil oleh konektor ini."
      : "Lapisan otomasi belum diaktifkan. Set CONTENT_OS_AUTOMATION_ENABLED=true dan N8N_WEBHOOK_SECRET sebagai secret Worker untuk mengaktifkannya."
  };
}

async function parseJsonBody(request: Request): Promise<{ raw: string; value: AutomationRecord }> {
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) throw new AutomationError(413, "Payload otomasi terlalu besar.");
  const raw = await readLimitedText(request.body, MAX_BODY_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AutomationError(400, "Body otomasi harus berupa JSON valid.");
  }
  if (!isRecord(parsed)) throw new AutomationError(400, "Body otomasi tidak valid.");
  return { raw, value: parsed };
}

function parseTrigger(value: AutomationRecord): {
  workflow: "topic_research";
  idempotencyKey: string;
  payload: AutomationRecord;
} {
  const workflow = textValue(value.workflow);
  if (workflow !== "topic_research") throw new AutomationError(400, "Workflow otomasi belum didukung.");

  const idempotencyKey = textValue(value.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    throw new AutomationError(400, "idempotencyKey wajib berisi 1–128 karakter aman.");
  }

  const payload = isRecord(value.payload) ? value.payload : isRecord(value.input) ? value.input : null;
  if (!payload) throw new AutomationError(400, "Payload workflow tidak valid.");
  return { workflow: "topic_research", idempotencyKey, payload };
}

function publicRun(row: AutomationRunRow): Record<string, unknown> {
  return {
    id: row.id,
    workflow: row.workflow,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    response: publicJson(row.response_json),
    error: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function findExistingRun(env: Env, idempotencyKey: string): Promise<AutomationRunRow | null> {
  return env.DB.prepare(
    `SELECT id, workflow, idempotency_key, status, response_json, error_message, created_at, updated_at
     FROM automation_runs WHERE idempotency_key = ? LIMIT 1`
  ).bind(idempotencyKey).first<AutomationRunRow>();
}

export async function triggerAutomation(request: Request, env: Env): Promise<AutomationResult> {
  const requestId = crypto.randomUUID();
  if (!isEnabled(env)) {
    return {
      status: 503,
      body: { ok: false, requestId, error: "Lapisan otomasi belum diaktifkan.", status: getAutomationRuntimeStatus(env) }
    };
  }

  try {
    const parsed = await parseJsonBody(request);
    if (!(await verifySignature(request, env, parsed.raw))) {
      return { status: 401, body: { ok: false, requestId, error: "Signature otomasi tidak valid." } };
    }
    const input = parseTrigger(parsed.value);
    // Schema is provisioned separately; avoid DDL on every signed webhook request.

    const existing = await findExistingRun(env, input.idempotencyKey);
    if (existing) {
      return { status: 200, body: { ok: true, requestId, duplicate: true, run: publicRun(existing) } };
    }

    const runId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO automation_runs (id, workflow, idempotency_key, status, request_json)
       VALUES (?, ?, ?, 'queued', ?)`
    ).bind(runId, input.workflow, input.idempotencyKey, limitedJson(input.payload, MAX_BODY_BYTES)).run();

    const researchRequest = new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.payload)
    });
    const result = await createTopicResearchRun(researchRequest, env);
    const resultJson = limitedJson(result.body, MAX_BODY_BYTES);
    const success = result.status >= 200 && result.status < 300;
    await env.DB.prepare(
      `UPDATE automation_runs
       SET status = ?, response_json = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(success ? "completed" : "failed", resultJson, success ? null : "Workflow riset menolak permintaan.", runId).run();

    const stored = await env.DB.prepare(
      `SELECT id, workflow, idempotency_key, status, response_json, error_message, created_at, updated_at
       FROM automation_runs WHERE id = ? LIMIT 1`
    ).bind(runId).first<AutomationRunRow>();
    return {
      status: success ? 200 : result.status,
      body: { ok: success, requestId, duplicate: false, run: stored ? publicRun(stored) : { id: runId, status: success ? "completed" : "failed", response: result.body } }
    };
  } catch (error) {
    const status = error instanceof AutomationError ? error.status : 500;
    const message = error instanceof AutomationError ? error.publicMessage : "Workflow otomasi gagal diproses.";
    console.error(JSON.stringify({ message: "automation_trigger_failed", requestId, status, error: error instanceof Error ? error.message : "Unknown error" }));
    return { status, body: { ok: false, requestId, error: message } };
  }
}

function parseEvent(value: AutomationRecord): AutomationEventInput {
  const eventType = textValue(value.eventType);
  if (!eventType || eventType.length > MAX_EVENT_TYPE_LENGTH || !/^[A-Za-z0-9._:-]+$/.test(eventType)) {
    throw new AutomationError(400, "eventType tidak valid.");
  }
  const runIdValue = textValue(value.runId) || null;
  const status = textValue(value.status, "received");
  const payload = value.payload ?? value.data ?? {};
  limitedJson(payload, MAX_EVENT_PAYLOAD_BYTES);
  return { eventType, runId: runIdValue, status, payload };
}

export async function receiveAutomationEvent(request: Request, env: Env): Promise<AutomationResult> {
  const requestId = crypto.randomUUID();
  if (!isEnabled(env)) {
    return { status: 503, body: { ok: false, requestId, error: "Lapisan otomasi belum diaktifkan." } };
  }

  try {
    const parsed = await parseJsonBody(request);
    if (!(await verifySignature(request, env, parsed.raw))) {
      return { status: 401, body: { ok: false, requestId, error: "Signature otomasi tidak valid." } };
    }
    const input = parseEvent(parsed.value);
    await ensureSchema(env);
    const eventId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO automation_events (id, run_id, event_type, status, payload_json)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(eventId, input.runId, input.eventType, input.status, limitedJson(input.payload, MAX_EVENT_PAYLOAD_BYTES)).run();
    return { status: 202, body: { ok: true, requestId, eventId, status: "received" } };
  } catch (error) {
    const status = error instanceof AutomationError ? error.status : 500;
    const message = error instanceof AutomationError ? error.publicMessage : "Event otomasi gagal disimpan.";
    console.error(JSON.stringify({ message: "automation_event_failed", requestId, status, error: error instanceof Error ? error.message : "Unknown error" }));
    return { status, body: { ok: false, requestId, error: message } };
  }
}

export async function listAutomationRuns(env: Env): Promise<AutomationResult> {
  try {
    await ensureSchema(env);
    const [runs, events] = await Promise.all([
      env.DB.prepare(
        `SELECT id, workflow, idempotency_key, status, response_json, error_message, created_at, updated_at
         FROM automation_runs ORDER BY created_at DESC, id DESC LIMIT ?`
      ).bind(MAX_RUNS).all<AutomationRunRow>(),
      env.DB.prepare(
        `SELECT id, run_id, event_type, status, payload_json, created_at
         FROM automation_events ORDER BY created_at DESC, id DESC LIMIT ?`
      ).bind(MAX_EVENTS).all<Record<string, unknown>>()
    ]);
    return {
      status: 200,
      body: {
        ok: true,
        mode: "read-only",
        runs: runs.results.map(publicRun),
        events: events.results.map((event) => ({
          id: textValue(event.id),
          runId: textValue(event.run_id) || null,
          eventType: textValue(event.event_type),
          status: textValue(event.status),
          payload: publicJson(textValue(event.payload_json, "{}")),
          createdAt: textValue(event.created_at)
        }))
      }
    };
  } catch (error) {
    console.error(JSON.stringify({ message: "automation_runs_failed", error: error instanceof Error ? error.message : "Unknown error" }));
    return { status: 500, body: { ok: false, error: "Riwayat otomasi belum tersedia." } };
  }
}
