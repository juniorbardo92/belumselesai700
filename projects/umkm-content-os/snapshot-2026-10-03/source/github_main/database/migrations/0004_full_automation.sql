PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO brands (id, name, slug, voice, palette_json)
VALUES (
  'brand-ruang-kalyanamitra',
  'Ruang Kalyanamitra',
  'ruang-kalyanamitra',
  'Hangat, jernih, rendah hati, modern, dan setia pada sumber Dharma.',
  '{"blue":"#0B2F64","gold":"#D5A62F","cream":"#FFFAF0","ink":"#172033"}'
);

CREATE TABLE IF NOT EXISTS autopilot_jobs (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'threads')),
  account_id TEXT NOT NULL,
  schedule_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (
    status IN ('gated', 'scheduled', 'blocked', 'reconcile_required', 'failed')
  ),
  repliz_schedule_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  gate_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  UNIQUE (content_item_id, platform, schedule_at)
);

CREATE INDEX IF NOT EXISTS idx_autopilot_jobs_status
  ON autopilot_jobs(status, schedule_at, updated_at);

CREATE INDEX IF NOT EXISTS idx_autopilot_jobs_content
  ON autopilot_jobs(content_item_id, platform, schedule_at);

INSERT INTO activity_logs (event_type, entity_type, entity_id, status, message, metadata_json)
SELECT
  'system.autopilot_schema_ready',
  'system',
  'full-automation-v1',
  'success',
  'Skema full automation UMKM dan Ruang Kalyanamitra siap.',
  '{"humanApprovalRequired":false,"mode":"fail-closed"}'
WHERE NOT EXISTS (
  SELECT 1 FROM activity_logs
  WHERE event_type = 'system.autopilot_schema_ready' AND entity_id = 'full-automation-v1'
);
