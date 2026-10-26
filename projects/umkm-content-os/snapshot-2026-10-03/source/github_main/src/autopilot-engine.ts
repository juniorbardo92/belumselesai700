import { getBrandRoute, type AutomationPlatform } from "./brand-registry";
import { isTerminalLedgerStatus, publicationFingerprint } from "./history-reset-policy";
import { evaluatePublicationGate, type GateAsset } from "./publication-gate";
import { scheduleAutomatedPublication } from "./publisher-engine";
import { refreshActiveRenderJobs, startRenderJob } from "./render-engine";

type JsonRecord = Record<string, unknown>;

type AutopilotContentRow = {
  id: string;
  brand_id: string;
  title: string;
  status: string;
  body_json: string;
  created_at: string;
};

type AutopilotJobRow = {
  id: string;
  idempotency_key: string;
  status: "gated" | "scheduled" | "blocked" | "reconcile_required" | "failed";
  attempt_count: number;
  repliz_schedule_id: string | null;
};

type PublicationLedgerRow = {
  idempotency_key: string;
  status: string;
  repliz_schedule_id: string | null;
};

type TargetSpec = {
  platform: AutomationPlatform;
  scheduleAt: string;
};

export type AutopilotRunSummary = {
  enabled: boolean;
  scanned: number;
  eligible: number;
  renderQueued: number;
  gated: number;
  scheduled: number;
  unchanged: number;
  blocked: number;
  reconcileRequired: number;
  failed: number;
};

const REQUIRED_AUTOPILOT_TABLES = ["autopilot_jobs", "publication_ledger"] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBinding(env: Env, name: string): string | undefined {
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function enabled(env: Env): boolean {
  return readBinding(env, "CONTENT_OS_AUTOPILOT_ENABLED") === "true";
}

function parseBody(value: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function flag(body: JsonRecord, camel: string, snake: string): boolean | undefined {
  const automation = isRecord(body.automation) ? body.automation : {};
  const value = automation[camel] ?? automation[snake] ?? body[camel] ?? body[snake];
  return typeof value === "boolean" ? value : undefined;
}

function scheduleValue(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function asPlatform(value: unknown): AutomationPlatform | null {
  return value === "instagram" || value === "threads" ? value : null;
}

function targetSpecs(body: JsonRecord): TargetSpec[] {
  const automation = isRecord(body.automation) ? body.automation : {};
  const explicit = automation.targets ?? body.publishTargets ?? body.publish_targets;
  const scheduleMap = isRecord(automation.scheduleAtByPlatform)
    ? automation.scheduleAtByPlatform
    : isRecord(body.scheduleAtByPlatform)
      ? body.scheduleAtByPlatform
      : {};
  const fallbackSchedule = scheduleValue(
    automation.scheduleAt ??
    automation.publishAt ??
    body.scheduleAt ??
    body.scheduledAt ??
    body.publishAt ??
    body.scheduled_at
  );
  const results: TargetSpec[] = [];

  if (Array.isArray(explicit)) {
    for (const target of explicit) {
      if (isRecord(target)) {
        const platform = asPlatform(target.platform);
        const scheduleAt = scheduleValue(target.scheduleAt ?? target.publishAt ?? target.scheduled_at);
        if (platform && scheduleAt) results.push({ platform, scheduleAt });
        continue;
      }
      const platform = asPlatform(target);
      const scheduleAt = platform ? scheduleValue(scheduleMap[platform]) ?? fallbackSchedule : null;
      if (platform && scheduleAt) results.push({ platform, scheduleAt });
    }
  }

  if (results.length === 0 && fallbackSchedule) {
    if (Array.isArray(body.threadsPosts) && body.threadsPosts.length > 0) {
      results.push({ platform: "threads", scheduleAt: fallbackSchedule });
    }
    if (isRecord(body.carousel) && Array.isArray(body.carousel.slides) && body.carousel.slides.length > 0) {
      results.push({ platform: "instagram", scheduleAt: fallbackSchedule });
    }
  }

  const unique = new Map<AutomationPlatform, TargetSpec>();
  for (const result of results) unique.set(result.platform, result);
  return [...unique.values()];
}

function automationEligible(body: JsonRecord): boolean {
  return flag(body, "automaticPublish", "automatic_publish") === true &&
    flag(body, "humanApprovalRequired", "human_approval_required") === false;
}

async function ensureSchema(env: Env): Promise<void> {
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)"
  ).bind(...REQUIRED_AUTOPILOT_TABLES).all<{ name: string }>();
  const existing = new Set(tables.results.map((row) => row.name));
  const missing = REQUIRED_AUTOPILOT_TABLES.filter((table) => !existing.has(table));
  if (missing.length > 0) {
    throw new Error(`Autopilot schema is missing: ${missing.join(", ")}. Apply D1 migrations before cron.`);
  }
}

async function latestRenderCompleted(env: Env, content: AutopilotContentRow): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT id FROM render_jobs WHERE content_item_id = ? AND status = 'completed' " +
    "AND updated_at >= COALESCE((SELECT updated_at FROM content_designs WHERE content_item_id = ?), ?) " +
    "AND EXISTS (SELECT 1 FROM activity_logs l WHERE l.event_type = 'render.completed' " +
    "AND l.entity_id = render_jobs.id AND l.metadata_json LIKE '%\"qa\":{\"passed\":true%') " +
    "ORDER BY updated_at DESC LIMIT 1"
  ).bind(content.id, content.id, content.created_at).first<{ id: string }>();
  return Boolean(row);
}

async function hasActiveRender(env: Env, contentItemId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT id FROM render_jobs WHERE content_item_id = ? AND status IN ('queued','running') LIMIT 1"
  ).bind(contentItemId).first<{ id: string }>();
  return Boolean(row);
}

async function queueRender(env: Env, contentItemId: string): Promise<boolean> {
  if (await hasActiveRender(env, contentItemId)) return true;
  const request = new Request("https://content-os.internal/api/render-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentItemId })
  });
  const result = await startRenderJob(request, env);
  return result.status === 202 || result.status === 409;
}

async function latestAssets(env: Env, contentItemId: string): Promise<GateAsset[]> {
  const query = await env.DB.prepare(
    "SELECT platform, public_url, width, height FROM assets WHERE render_job_id = (" +
    "SELECT id FROM render_jobs WHERE content_item_id = ? AND status = 'completed' " +
    "AND EXISTS (SELECT 1 FROM activity_logs l WHERE l.event_type = 'render.completed' " +
    "AND l.entity_id = render_jobs.id AND l.metadata_json LIKE '%\"qa\":{\"passed\":true%') " +
    "ORDER BY updated_at DESC LIMIT 1) ORDER BY platform, r2_key"
  ).bind(contentItemId).all<GateAsset>();
  return query.results;
}

function idempotencyKey(contentItemId: string, target: TargetSpec): string {
  return [contentItemId, target.platform, target.scheduleAt.replace(/[^0-9]/g, "")].join(":");
}

async function upsertJob(
  env: Env,
  content: AutopilotContentRow,
  target: TargetSpec,
  status: AutopilotJobRow["status"],
  gate: unknown,
  fingerprint: string,
  error: string | null = null
): Promise<AutopilotJobRow> {
  const route = getBrandRoute(content.brand_id, target.platform);
  if (!route) throw new Error("Unknown brand route");
  const key = idempotencyKey(content.id, target);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO autopilot_jobs " +
      "(id, content_item_id, brand_id, platform, account_id, schedule_at, idempotency_key, status, gate_json, last_error) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(idempotency_key) DO UPDATE SET " +
      "status = CASE WHEN autopilot_jobs.status IN ('scheduled','reconcile_required') THEN autopilot_jobs.status ELSE excluded.status END, " +
      "gate_json = excluded.gate_json, last_error = excluded.last_error, updated_at = CURRENT_TIMESTAMP"
    ).bind(
      id,
      content.id,
      content.brand_id,
      target.platform,
      route.accountId,
      target.scheduleAt,
      key,
      status,
      JSON.stringify(gate),
      error
    ),
    env.DB.prepare(
      `INSERT INTO publication_ledger (
         idempotency_key, content_fingerprint, content_item_id, brand_id, platform,
         account_id, schedule_at, status, origin, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'autopilot', CURRENT_TIMESTAMP)
       ON CONFLICT(idempotency_key) DO UPDATE SET
         content_fingerprint = COALESCE(publication_ledger.content_fingerprint, excluded.content_fingerprint),
         status = CASE
           WHEN publication_ledger.status IN ('scheduled','unchanged','reconcile_required','published','cancelled_by_reset')
             THEN publication_ledger.status
           ELSE excluded.status
         END,
         updated_at = CURRENT_TIMESTAMP`
    ).bind(key, fingerprint, content.id, content.brand_id, target.platform, route.accountId, target.scheduleAt, status)
  ]);
  const row = await env.DB.prepare(
    "SELECT id, idempotency_key, status, attempt_count, repliz_schedule_id " +
    "FROM autopilot_jobs WHERE idempotency_key = ? LIMIT 1"
  ).bind(key).first<AutopilotJobRow>();
  if (!row) throw new Error("Autopilot job was not stored");
  return row;
}

async function terminalLedgerMatch(
  env: Env,
  key: string,
  fingerprint: string
): Promise<PublicationLedgerRow | null> {
  const row = await env.DB.prepare(
    `SELECT idempotency_key, status, repliz_schedule_id
     FROM publication_ledger
     WHERE (idempotency_key = ? OR content_fingerprint = ?)
       AND status IN ('scheduled','unchanged','reconcile_required','published','cancelled_by_reset')
     ORDER BY updated_at DESC LIMIT 1`
  ).bind(key, fingerprint).first<PublicationLedgerRow>();
  return row && isTerminalLedgerStatus(row.status) ? row : null;
}

async function autoApprove(env: Env, content: AutopilotContentRow): Promise<void> {
  if (content.status === "approved" || content.status === "scheduled") return;
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE content_items SET status = 'approved', updated_at = CURRENT_TIMESTAMP " +
      "WHERE id = ? AND status IN ('draft','review')"
    ).bind(content.id),
    env.DB.prepare(
      "INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json) " +
      "VALUES ('content.auto_approved', 'content_item', ?, 'success', " +
      "'Konten lolos gate otomatis; approval manusia tidak digunakan.', ?)"
    ).bind(content.id, JSON.stringify({ brandId: content.brand_id, title: content.title }))
  ]);
  content.status = "approved";
}

async function updateJobAfterSchedule(
  env: Env,
  job: AutopilotJobRow,
  result: { status: "scheduled" | "unchanged" | "reconcile_required"; replizScheduleId: string | null }
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE autopilot_jobs SET status = ?, repliz_schedule_id = ?, attempt_count = attempt_count + 1, " +
      "last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(
      result.status === "reconcile_required" ? "reconcile_required" : "scheduled",
      result.replizScheduleId,
      job.id
    ),
    env.DB.prepare(
      `UPDATE publication_ledger
       SET status = ?, repliz_schedule_id = COALESCE(?, repliz_schedule_id), updated_at = CURRENT_TIMESTAMP
       WHERE idempotency_key = ?`
    ).bind(result.status, result.replizScheduleId, job.idempotency_key)
  ]);
}

async function markJobFailure(env: Env, job: AutopilotJobRow, error: string): Promise<void> {
  const nextAttempts = job.attempt_count + 1;
  const status = nextAttempts >= 3 ? "blocked" : "failed";
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE autopilot_jobs SET status = ?, attempt_count = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(status, nextAttempts, error.slice(0, 500), job.id),
    env.DB.prepare(
      `UPDATE publication_ledger
       SET status = CASE
         WHEN status IN ('scheduled','unchanged','reconcile_required','published','cancelled_by_reset') THEN status
         ELSE ?
       END, updated_at = CURRENT_TIMESTAMP
       WHERE idempotency_key = ?`
    ).bind(status, job.idempotency_key)
  ]);
}

export function getAutopilotRuntimeStatus(env: Env): {
  enabled: boolean;
  mode: "disabled" | "full-automation";
  humanApprovalRequired: false;
  brands: string[];
} {
  const isEnabled = enabled(env);
  return {
    enabled: isEnabled,
    mode: isEnabled ? "full-automation" : "disabled",
    humanApprovalRequired: false,
    brands: ["brand-umkm-naik-kelas", "brand-ruang-kalyanamitra"]
  };
}

export async function runAutopilot(env: Env): Promise<AutopilotRunSummary> {
  const summary: AutopilotRunSummary = {
    enabled: enabled(env),
    scanned: 0,
    eligible: 0,
    renderQueued: 0,
    gated: 0,
    scheduled: 0,
    unchanged: 0,
    blocked: 0,
    reconcileRequired: 0,
    failed: 0
  };
  if (!summary.enabled) return summary;

  await ensureSchema(env);
  await refreshActiveRenderJobs(env, 20);
  const query = await env.DB.prepare(
    "SELECT id, brand_id, title, status, body_json, created_at FROM content_items " +
    "WHERE status IN ('draft','review','approved','scheduled') ORDER BY created_at ASC LIMIT 50"
  ).all<AutopilotContentRow>();
  summary.scanned = query.results.length;

  for (const content of query.results) {
    const body = parseBody(content.body_json);
    if (!body || !automationEligible(body)) continue;
    const targets = targetSpecs(body);
    if (targets.length === 0) {
      summary.blocked += 1;
      continue;
    }
    summary.eligible += 1;

    if (!(await latestRenderCompleted(env, content))) {
      try {
        if (await queueRender(env, content.id)) summary.renderQueued += 1;
        else summary.failed += 1;
      } catch (error) {
        summary.failed += 1;
        console.error(JSON.stringify({
          message: "autopilot_render_queue_failed",
          contentItemId: content.id,
          error: error instanceof Error ? error.message : "Unknown error"
        }));
      }
      continue;
    }

    const assets = await latestAssets(env, content.id);
    const gates = targets.map((target) => ({
      target,
      gate: evaluatePublicationGate({
        brandId: content.brand_id,
        platform: target.platform,
        body,
        assets
      })
    }));
    if (gates.some((item) => !item.gate.passed)) {
      for (const item of gates) {
        const fingerprint = await publicationFingerprint({
          brandId: content.brand_id,
          platform: item.target.platform,
          scheduleAt: item.target.scheduleAt,
          title: content.title,
          body
        });
        await upsertJob(env, content, item.target, "blocked", item.gate, fingerprint);
        if (!item.gate.passed) summary.blocked += 1;
      }
      continue;
    }

    await autoApprove(env, content);
    summary.gated += gates.length;

    for (const item of gates) {
      const key = idempotencyKey(content.id, item.target);
      const fingerprint = await publicationFingerprint({
        brandId: content.brand_id,
        platform: item.target.platform,
        scheduleAt: item.target.scheduleAt,
        title: content.title,
        body
      });
      const ledgerMatch = await terminalLedgerMatch(env, key, fingerprint);
      if (ledgerMatch) {
        await upsertJob(env, content, item.target, "blocked", {
          ...item.gate,
          passed: false,
          reasons: ["durable-publication-ledger-match"],
          matchedIdempotencyKey: ledgerMatch.idempotency_key,
          matchedStatus: ledgerMatch.status
        }, fingerprint);
        summary.blocked += 1;
        continue;
      }
      const job = await upsertJob(env, content, item.target, "gated", item.gate, fingerprint);
      if (job.status === "scheduled") {
        summary.unchanged += 1;
        continue;
      }
      if (job.status === "reconcile_required") {
        summary.reconcileRequired += 1;
        continue;
      }
      if (job.status === "blocked" && job.attempt_count >= 3) {
        summary.blocked += 1;
        continue;
      }
      try {
        const result = await scheduleAutomatedPublication(env, {
          contentItemId: content.id,
          platform: item.target.platform,
          scheduleAt: item.target.scheduleAt,
          idempotencyKey: key
        });
        await updateJobAfterSchedule(env, job, result);
        if (result.status === "scheduled") summary.scheduled += 1;
        if (result.status === "unchanged") summary.unchanged += 1;
        if (result.status === "reconcile_required") summary.reconcileRequired += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Autopilot Publisher gagal.";
        await markJobFailure(env, job, message);
        summary.failed += 1;
      }
    }
  }

  await env.DB.prepare(
    "INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json) " +
    "VALUES ('autopilot.run_completed', 'system', ?, 'success', 'Siklus full automation selesai.', ?)"
  ).bind(crypto.randomUUID(), JSON.stringify(summary)).run();
  return summary;
}

export async function listAutopilotJobs(env: Env): Promise<unknown> {
  await ensureSchema(env);
  const query = await env.DB.prepare(
    "SELECT id, content_item_id, brand_id, platform, account_id, schedule_at, status, repliz_schedule_id, " +
    "attempt_count, gate_json, last_error, created_at, updated_at FROM autopilot_jobs " +
    "ORDER BY updated_at DESC LIMIT 100"
  ).all<Record<string, unknown>>();
  return {
    ok: true,
    mode: getAutopilotRuntimeStatus(env).mode,
    humanApprovalRequired: false,
    jobs: query.results
  };
}
