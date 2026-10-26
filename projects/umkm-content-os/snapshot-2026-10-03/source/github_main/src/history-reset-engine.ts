import { listBrandRoutes } from "./brand-registry";
import {
  PRESERVED_HISTORY_REFERENCES,
  PROTECTED_TABLES,
  RESETTABLE_TABLES,
  dedupeScheduleCandidates,
  parseResetBearerToken,
  resetDeleteFilter,
  resetRequestTokenHash,
  shouldCancelSchedule,
  type ResetScheduleCandidate
} from "./history-reset-policy";
import { cancelPublisherSchedule } from "./publisher-engine";

type JsonRecord = Record<string, unknown>;

type ResetRunRow = {
  version: string;
  status: "pending" | "running" | "failed" | "completed";
  run_id: string | null;
  attempt_count: number;
  remote_cancelled: number;
  remote_absent: number;
  r2_deleted: number;
  local_rows_deleted_json: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type AutopilotResetRow = {
  idempotency_key: string;
  account_id: string;
  schedule_at: string;
  repliz_schedule_id: string | null;
};

type ActivityResetRow = {
  event_type: string;
  metadata_json: string;
};

type CancelledLedgerRow = {
  idempotency_key: string;
  repliz_schedule_id: string | null;
};

type ResetRequestRow = {
  version: string;
  token_hash: string;
  status: "pending" | "claimed" | "failed" | "completed";
  created_at: string;
};

export type HistoryResetStatus = {
  enabled: boolean;
  version: string | null;
  status: "disabled" | "pending" | "running" | "failed" | "completed";
  attemptCount: number;
  remoteCancelled: number;
  remoteAbsent: number;
  r2Deleted: number;
  localRowsDeleted: Record<string, number>;
  error: string | null;
  completedAt: string | null;
  protected: readonly string[];
};

const REQUIRED_RESET_TABLES = [
  "publication_ledger",
  "history_reset_runs",
  "history_reset_requests"
] as const;

function readBinding(env: Env, name: string): string | undefined {
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resetVersion(env: Env): string | null {
  return readBinding(env, "CONTENT_OS_HISTORY_RESET_VERSION") ?? null;
}

function parseJsonRecord(value: string): JsonRecord {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberRecord(value: string): Record<string, number> {
  const parsed = parseJsonRecord(value);
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number")
  );
}

async function tableExists(env: Env, table: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).bind(table).first<{ name: string }>();
  return row?.name === table;
}

async function ensureResetSchema(env: Env): Promise<void> {
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?)"
  ).bind(...REQUIRED_RESET_TABLES).all<{ name: string }>();
  const existing = new Set(tables.results.map((row) => row.name));
  const missing = REQUIRED_RESET_TABLES.filter((table) => !existing.has(table));
  if (missing.length > 0) {
    throw new Error(`History reset schema is missing: ${missing.join(", ")}. Apply D1 migrations before reset.`);
  }
}

async function snapshotAutopilotLedger(env: Env): Promise<void> {
  if (await tableExists(env, "autopilot_jobs")) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO publication_ledger (
         idempotency_key, content_item_id, brand_id, platform, account_id, schedule_at,
         status, repliz_schedule_id, origin, created_at, updated_at
       )
       SELECT idempotency_key, content_item_id, brand_id, platform, account_id, schedule_at,
              status, repliz_schedule_id, 'history-reset-snapshot', created_at, updated_at
       FROM autopilot_jobs`
    ).run();
  }
}

function publicStatus(row: ResetRunRow | null, version: string | null): HistoryResetStatus {
  if (!version) {
    return {
      enabled: false,
      version: null,
      status: "disabled",
      attemptCount: 0,
      remoteCancelled: 0,
      remoteAbsent: 0,
      r2Deleted: 0,
      localRowsDeleted: {},
      error: null,
      completedAt: null,
      protected: PROTECTED_TABLES
    };
  }
  return {
    enabled: true,
    version,
    status: row?.status ?? "pending",
    attemptCount: Number(row?.attempt_count ?? 0),
    remoteCancelled: Number(row?.remote_cancelled ?? 0),
    remoteAbsent: Number(row?.remote_absent ?? 0),
    r2Deleted: Number(row?.r2_deleted ?? 0),
    localRowsDeleted: numberRecord(row?.local_rows_deleted_json ?? "{}"),
    error: row?.error_message ?? null,
    completedAt: row?.completed_at ?? null,
    protected: PROTECTED_TABLES
  };
}

async function readResetRun(env: Env, version: string): Promise<ResetRunRow | null> {
  return env.DB.prepare(
    `SELECT version, status, run_id, attempt_count, remote_cancelled, remote_absent,
            r2_deleted, local_rows_deleted_json, error_message, started_at, completed_at, updated_at
     FROM history_reset_runs WHERE version = ? LIMIT 1`
  ).bind(version).first<ResetRunRow>();
}

export async function getHistoryResetStatus(env: Env): Promise<HistoryResetStatus> {
  const version = resetVersion(env);
  if (!version) return publicStatus(null, null);
  await ensureResetSchema(env);
  return publicStatus(await readResetRun(env, version), version);
}

async function acquireResetRun(env: Env, version: string, runId: string): Promise<ResetRunRow | null> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO history_reset_runs (version, status)
     VALUES (?, 'pending')`
  ).bind(version).run();
  await env.DB.prepare(
    `UPDATE history_reset_runs
     SET status = 'running', run_id = ?, attempt_count = attempt_count + 1,
         error_message = NULL, started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE version = ?
       AND attempt_count < 3
       AND (
         status IN ('pending', 'failed')
         OR (status = 'running' AND updated_at < datetime('now', '-15 minutes'))
       )`
  ).bind(runId, version).run();
  const row = await readResetRun(env, version);
  return row?.run_id === runId && row.status === "running" ? row : null;
}

function legacyLedgerKey(candidate: ResetScheduleCandidate): string {
  const schedule = new Date(candidate.scheduleAt).toISOString().replace(/[^0-9]/g, "");
  return candidate.idempotencyKey ?? `legacy:${candidate.accountId}:${schedule}:${candidate.scheduleId ?? "slot"}`;
}

async function collectCancellationCandidates(env: Env): Promise<ResetScheduleCandidate[]> {
  const nowMs = Date.now();
  const routes = listBrandRoutes();
  const allowedAccounts = new Set(routes.map((route) => route.accountId));
  const cancelled = await env.DB.prepare(
    `SELECT idempotency_key, repliz_schedule_id
     FROM publication_ledger WHERE status = 'cancelled_by_reset'`
  ).all<CancelledLedgerRow>();
  const cancelledKeys = new Set(cancelled.results.map((row) => row.idempotency_key));
  const cancelledScheduleIds = new Set(
    cancelled.results.map((row) => row.repliz_schedule_id).filter((value): value is string => Boolean(value))
  );
  const candidates: ResetScheduleCandidate[] = [];

  if (await tableExists(env, "autopilot_jobs")) {
    const jobs = await env.DB.prepare(
      `SELECT idempotency_key, account_id, schedule_at, repliz_schedule_id
       FROM autopilot_jobs ORDER BY created_at ASC`
    ).all<AutopilotResetRow>();
    for (const job of jobs.results) {
      if (cancelledKeys.has(job.idempotency_key)) continue;
      const candidate: ResetScheduleCandidate = {
        accountId: job.account_id,
        scheduleAt: job.schedule_at,
        scheduleId: job.repliz_schedule_id,
        idempotencyKey: job.idempotency_key,
        isDraft: false,
        source: "autopilot"
      };
      if (allowedAccounts.has(candidate.accountId) && shouldCancelSchedule(candidate, nowMs)) candidates.push(candidate);
    }
  }

  if (await tableExists(env, "activity_logs")) {
    const logs = await env.DB.prepare(
      `SELECT event_type, metadata_json
       FROM activity_logs
       WHERE event_type IN ('publisher.draft_submitted', 'publisher.auto_scheduled', 'publisher.reconcile_required')
       ORDER BY created_at ASC`
    ).all<ActivityResetRow>();
    for (const log of logs.results) {
      const metadata = parseJsonRecord(log.metadata_json);
      const scheduleId = textValue(metadata.replizScheduleId) || null;
      if (scheduleId && cancelledScheduleIds.has(scheduleId)) continue;
      const candidate: ResetScheduleCandidate = {
        accountId: textValue(metadata.accountId),
        scheduleAt: textValue(metadata.scheduleAt),
        scheduleId,
        idempotencyKey: textValue(metadata.idempotencyKey) || null,
        isDraft: metadata.isDraft === true || log.event_type === "publisher.draft_submitted",
        source: "publisher-log"
      };
      if (cancelledKeys.has(legacyLedgerKey(candidate))) continue;
      if (allowedAccounts.has(candidate.accountId) && shouldCancelSchedule(candidate, nowMs)) candidates.push(candidate);
    }
  }
  return dedupeScheduleCandidates(candidates);
}

async function markCandidateCancelled(
  env: Env,
  version: string,
  candidate: ResetScheduleCandidate,
  resolvedScheduleId: string | null
): Promise<void> {
  const route = listBrandRoutes().find((item) => item.accountId === candidate.accountId);
  if (!route) throw new Error("Unknown brand route during reset");
  const key = legacyLedgerKey(candidate);
  await env.DB.prepare(
    `INSERT INTO publication_ledger (
       idempotency_key, brand_id, platform, account_id, schedule_at, status,
       repliz_schedule_id, origin, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'cancelled_by_reset', ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(idempotency_key) DO UPDATE SET
       status = 'cancelled_by_reset',
       repliz_schedule_id = COALESCE(excluded.repliz_schedule_id, publication_ledger.repliz_schedule_id),
       origin = excluded.origin,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(
    key,
    route.brandId,
    route.platform,
    candidate.accountId,
    new Date(candidate.scheduleAt).toISOString(),
    resolvedScheduleId ?? candidate.scheduleId,
    `history-reset:${version}`
  ).run();
}

async function cancelOldRemoteSchedules(
  env: Env,
  version: string
): Promise<{ cancelled: number; absent: number }> {
  const candidates = await collectCancellationCandidates(env);
  let cancelled = 0;
  let absent = 0;
  for (const candidate of candidates) {
    const result = await cancelPublisherSchedule(env, {
      accountId: candidate.accountId,
      scheduleAt: candidate.scheduleAt,
      scheduleId: candidate.scheduleId,
      idempotencyKey: candidate.idempotencyKey,
      allowExactSlotFallback: candidate.source === "publisher-log"
    });
    if (result.status === "cancelled") cancelled += 1;
    else absent += 1;
    await markCandidateCancelled(env, version, candidate, result.scheduleId);
  }
  return { cancelled, absent };
}

async function clearMediaBucket(env: Env): Promise<number> {
  let deleted = 0;
  for (let pass = 0; pass < 100; pass += 1) {
    const page = await env.MEDIA.list({ limit: 1000 });
    const keys = page.objects.map((object) => object.key);
    if (keys.length === 0) return deleted;
    await env.MEDIA.delete(keys);
    deleted += keys.length;
  }
  throw new Error("Media R2 melebihi batas reset aman 100.000 objek.");
}

async function clearLocalHistory(env: Env): Promise<Record<string, number>> {
  const rows: Record<string, number> = {};
  const statements: D1PreparedStatement[] = [];
  const existingReferenceTables = new Set<string>();
  for (const table of new Set(PRESERVED_HISTORY_REFERENCES.map((reference) => reference.childTable))) {
    if (await tableExists(env, table)) existingReferenceTables.add(table);
  }
  for (const table of RESETTABLE_TABLES) {
    if (!(await tableExists(env, table))) continue;
    const filter = resetDeleteFilter(table, existingReferenceTables);
    const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} ${filter}`).first<{ total: number }>();
    rows[table] = Number(count?.total ?? 0);
    statements.push(env.DB.prepare(`DELETE FROM ${table} ${filter}`));
  }
  if (statements.length > 0) await env.DB.batch(statements);
  return rows;
}

async function markResetFailed(env: Env, version: string, runId: string, error: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE history_reset_runs
     SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
     WHERE version = ? AND run_id = ?`
  ).bind(error.slice(0, 500), version, runId).run();
}

export async function runHistoryResetIfRequired(env: Env): Promise<HistoryResetStatus> {
  const version = resetVersion(env);
  if (!version) return publicStatus(null, null);
  await ensureResetSchema(env);
  const current = await readResetRun(env, version);
  if (current?.status === "completed") return publicStatus(current, version);

  const runId = crypto.randomUUID();
  const acquired = await acquireResetRun(env, version, runId);
  if (!acquired) return publicStatus(await readResetRun(env, version), version);

  try {
    await snapshotAutopilotLedger(env);
    const remote = await cancelOldRemoteSchedules(env, version);
    const r2Deleted = await clearMediaBucket(env);
    const localRowsDeleted = await clearLocalHistory(env);
    await env.DB.prepare(
      `UPDATE history_reset_runs
       SET status = 'completed', remote_cancelled = ?, remote_absent = ?, r2_deleted = ?,
           local_rows_deleted_json = ?, error_message = NULL, completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE version = ? AND run_id = ?`
    ).bind(
      remote.cancelled,
      remote.absent,
      r2Deleted,
      JSON.stringify(localRowsDeleted),
      version,
      runId
    ).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "History reset failed";
    console.error(JSON.stringify({ message: "history_reset_failed", version, runId, error: message }));
    await markResetFailed(env, version, runId, message);
  }
  return publicStatus(await readResetRun(env, version), version);
}

export async function triggerHistoryReset(
  request: Request,
  env: Env
): Promise<{ status: number; body: Record<string, unknown> }> {
  const version = resetVersion(env);
  if (!version) {
    return { status: 503, body: { ok: false, error: "History reset is not configured." } };
  }

  const token = parseResetBearerToken(request.headers.get("Authorization"));
  if (!token) return { status: 401, body: { ok: false, error: "Invalid reset authorization." } };

  await ensureResetSchema(env);
  const tokenHash = await resetRequestTokenHash(token);
  const resetRequest = await env.DB.prepare(
    `SELECT version, token_hash, status, created_at
     FROM history_reset_requests
     WHERE version = ? AND token_hash = ?
       AND created_at >= datetime('now', '-20 minutes')
     LIMIT 1`
  ).bind(version, tokenHash).first<ResetRequestRow>();
  if (!resetRequest) {
    return { status: 401, body: { ok: false, error: "Reset authorization is absent or expired." } };
  }

  await env.DB.prepare(
    `UPDATE history_reset_requests
     SET status = 'claimed', claimed_at = COALESCE(claimed_at, CURRENT_TIMESTAMP),
         error_message = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE version = ? AND token_hash = ? AND status IN ('pending', 'claimed', 'failed')`
  ).bind(version, tokenHash).run();

  const result = await runHistoryResetIfRequired(env);
  const requestStatus = result.status === "completed"
    ? "completed"
    : result.status === "failed"
      ? "failed"
      : "claimed";
  await env.DB.prepare(
    `UPDATE history_reset_requests
     SET status = ?, error_message = ?,
         completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE version = ? AND token_hash = ?`
  ).bind(requestStatus, result.error, requestStatus, version, tokenHash).run();

  const status = result.status === "completed"
    ? 200
    : result.status === "failed"
      ? (result.attemptCount < 3 ? 503 : 500)
      : 202;
  return { status, body: { ok: result.status === "completed", reset: result } };
}
