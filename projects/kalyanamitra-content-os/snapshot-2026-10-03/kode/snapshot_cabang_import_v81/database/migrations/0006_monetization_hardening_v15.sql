-- Additive-only hardening for the reproducible TypeScript v15 candidate.
-- This migration never deletes or rewrites business, evidence, or acceptance rows.

CREATE TABLE IF NOT EXISTS monetization_api_rate_limits (
  scope TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (scope, window_start)
);

CREATE INDEX IF NOT EXISTS idx_monetization_rate_limits_expiry
  ON monetization_api_rate_limits(expires_at);

CREATE INDEX IF NOT EXISTS idx_monetization_events_brand_time
  ON monetization_events(brand_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_monetization_revenue_brand_time
  ON monetization_revenue_events(brand_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_monetization_daily_brand_day
  ON monetization_daily_analytics(brand_id, day DESC);

-- A non-unique lookup index is safe even if historical/manual canary rows contain duplicates.
-- Runtime writes still use WHERE NOT EXISTS(event_id) for forward idempotency.
CREATE INDEX IF NOT EXISTS idx_monetization_touchpoints_event
  ON monetization_touchpoints(event_id);

-- v15 snapshots are isolated from the legacy rollup so verified-production data
-- can never inherit stale acceptance/unknown totals. Snapshots are append-only;
-- an incomplete snapshot is ignored instead of replacing the last complete one.
CREATE TABLE IF NOT EXISTS monetization_analytics_snapshots (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  data_scope TEXT NOT NULL CHECK (data_scope IN ('verified-production','legacy-unclassified')),
  period_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','complete','error')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monetization_analytics_snapshots_latest
  ON monetization_analytics_snapshots(brand_id, data_scope, status, completed_at DESC);

CREATE TABLE IF NOT EXISTS monetization_daily_analytics_v15 (
  snapshot_id TEXT NOT NULL,
  day TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  content_item_id TEXT NOT NULL DEFAULT '',
  campaign_id TEXT NOT NULL DEFAULT '',
  offer_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  impressions INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  checkouts INTEGER NOT NULL DEFAULT 0,
  conversion_events INTEGER NOT NULL DEFAULT 0,
  confirmed_transactions INTEGER NOT NULL DEFAULT 0,
  reversals INTEGER NOT NULL DEFAULT 0,
  gross_revenue INTEGER NOT NULL DEFAULT 0,
  net_revenue INTEGER NOT NULL DEFAULT 0,
  contribution_margin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (snapshot_id, day, brand_id, content_item_id, campaign_id, offer_id, platform),
  FOREIGN KEY (snapshot_id) REFERENCES monetization_analytics_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monetization_daily_v15_snapshot_day
  ON monetization_daily_analytics_v15(snapshot_id, day DESC);

INSERT INTO activity_logs(event_type,entity_type,entity_id,status,message,metadata_json)
SELECT 'monetization.hardening_schema.ready','system','monetization-engine-v15','success',
  'Schema hardening v15 ditambahkan secara additive tanpa retention mutatif.',
  '{"migration":"0006_monetization_hardening_v15.sql","retentionMode":"preview-only","policy":"additive-only"}'
WHERE NOT EXISTS (
  SELECT 1 FROM activity_logs
  WHERE event_type='monetization.hardening_schema.ready' AND entity_id='monetization-engine-v15'
);
