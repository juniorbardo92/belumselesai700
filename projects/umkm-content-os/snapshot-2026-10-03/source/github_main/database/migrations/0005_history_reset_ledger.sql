PRAGMA foreign_keys = ON;

-- Durable publication memory. This table intentionally has no foreign keys:
-- content history may be purged, while duplicate-prevention evidence survives.
CREATE TABLE IF NOT EXISTS publication_ledger (
  idempotency_key TEXT PRIMARY KEY,
  content_fingerprint TEXT,
  content_item_id TEXT,
  brand_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'threads')),
  account_id TEXT NOT NULL,
  schedule_at TEXT NOT NULL,
  status TEXT NOT NULL,
  repliz_schedule_id TEXT,
  origin TEXT NOT NULL DEFAULT 'autopilot',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_publication_ledger_fingerprint
  ON publication_ledger(content_fingerprint, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_publication_ledger_schedule
  ON publication_ledger(account_id, schedule_at, repliz_schedule_id);

INSERT OR IGNORE INTO publication_ledger (
  idempotency_key,
  content_item_id,
  brand_id,
  platform,
  account_id,
  schedule_at,
  status,
  repliz_schedule_id,
  origin,
  created_at,
  updated_at
)
SELECT
  idempotency_key,
  content_item_id,
  brand_id,
  platform,
  account_id,
  schedule_at,
  status,
  repliz_schedule_id,
  'migration-0005',
  created_at,
  updated_at
FROM autopilot_jobs;

-- One-shot reset state is operational configuration, not user-facing history.
CREATE TABLE IF NOT EXISTS history_reset_runs (
  version TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'failed', 'completed')),
  run_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  remote_cancelled INTEGER NOT NULL DEFAULT 0,
  remote_absent INTEGER NOT NULL DEFAULT 0,
  r2_deleted INTEGER NOT NULL DEFAULT 0,
  local_rows_deleted_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
