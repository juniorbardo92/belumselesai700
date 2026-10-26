PRAGMA foreign_keys = ON;

-- Monetization Engine v1.0 tranche 2. Additive-only attribution and reconciliation.

CREATE TABLE IF NOT EXISTS monetization_provider_mappings (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  offer_id TEXT,
  campaign_id TEXT,
  content_item_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (offer_id) REFERENCES monetization_offers(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES monetization_campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE SET NULL,
  UNIQUE (brand_id, provider, external_type, external_id)
);
CREATE INDEX IF NOT EXISTS idx_monetization_provider_mapping_lookup
  ON monetization_provider_mappings(brand_id, provider, external_type, external_id);

CREATE TABLE IF NOT EXISTS monetization_attributions (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  revenue_event_id TEXT NOT NULL UNIQUE,
  visitor_id TEXT,
  model TEXT NOT NULL DEFAULT 'first_last' CHECK (model IN ('first_last','last_touch','first_touch','unattributed')),
  first_event_id TEXT,
  first_content_item_id TEXT,
  first_campaign_id TEXT,
  first_offer_id TEXT,
  first_platform TEXT,
  last_event_id TEXT,
  last_content_item_id TEXT,
  last_campaign_id TEXT,
  last_offer_id TEXT,
  last_platform TEXT,
  attribution_status TEXT NOT NULL DEFAULT 'pending' CHECK (attribution_status IN ('pending','attributed','partial','unattributed')),
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (revenue_event_id) REFERENCES monetization_revenue_events(id) ON DELETE CASCADE,
  FOREIGN KEY (first_event_id) REFERENCES monetization_events(id) ON DELETE SET NULL,
  FOREIGN KEY (last_event_id) REFERENCES monetization_events(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_monetization_attribution_status
  ON monetization_attributions(brand_id, attribution_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_attribution_first_content
  ON monetization_attributions(first_content_item_id);
CREATE INDEX IF NOT EXISTS idx_monetization_attribution_last_content
  ON monetization_attributions(last_content_item_id);

CREATE TABLE IF NOT EXISTS monetization_reconciliation_runs (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  source TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  external_transaction_count INTEGER NOT NULL DEFAULT 0,
  external_gross_amount INTEGER NOT NULL DEFAULT 0,
  ledger_transaction_count INTEGER NOT NULL DEFAULT 0,
  ledger_gross_amount INTEGER NOT NULL DEFAULT 0,
  transaction_count_delta INTEGER NOT NULL DEFAULT 0,
  gross_amount_delta INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('matched','mismatch','error')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_monetization_reconciliation_source_time
  ON monetization_reconciliation_runs(brand_id, source, created_at DESC);

CREATE TABLE IF NOT EXISTS monetization_reconciliation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reconciliation_run_id TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  external_reference TEXT,
  transaction_id TEXT,
  expected_amount INTEGER,
  ledger_amount INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY (reconciliation_run_id) REFERENCES monetization_reconciliation_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_monetization_reconciliation_items_run
  ON monetization_reconciliation_items(reconciliation_run_id, status);

INSERT INTO activity_logs (
  event_type, entity_type, entity_id, status, message, metadata_json
) SELECT
  'monetization.attribution_schema.ready',
  'system',
  'monetization-engine-v1',
  'success',
  'Attribution, provider mapping, dan reconciliation schema ditambahkan secara additive.',
  '{"migration":"0005_monetization_attribution_reconciliation.sql"}'
WHERE NOT EXISTS (
  SELECT 1 FROM activity_logs
  WHERE event_type='monetization.attribution_schema.ready'
    AND entity_id='monetization-engine-v1'
);
