PRAGMA foreign_keys = ON;

-- Monetization Engine v1.0 is additive-only. Existing Content OS tables are not altered.

CREATE TABLE IF NOT EXISTS monetization_offers (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('own_product','affiliate','lead_generation','service','app_install','free_lead_magnet')),
  category TEXT,
  description TEXT,
  destination_url TEXT,
  price_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IDR',
  commission_type TEXT CHECK (commission_type IS NULL OR commission_type IN ('percent','fixed')),
  commission_value REAL NOT NULL DEFAULT 0,
  estimated_margin_amount INTEGER NOT NULL DEFAULT 0,
  audience TEXT,
  problem_solved TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_monetization_offers_brand_status ON monetization_offers(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_monetization_offers_type ON monetization_offers(type);

CREATE TABLE IF NOT EXISTS monetization_campaigns (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  offer_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed','archived')),
  starts_at TEXT,
  ends_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (offer_id) REFERENCES monetization_offers(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_monetization_campaigns_brand_status ON monetization_campaigns(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_monetization_campaigns_offer ON monetization_campaigns(offer_id);

CREATE TABLE IF NOT EXISTS content_monetization (
  content_item_id TEXT PRIMARY KEY,
  monetization_goal TEXT NOT NULL DEFAULT 'none' CHECK (monetization_goal IN ('none','awareness','traffic','lead','affiliate','own_product','app_install','service')),
  offer_id TEXT,
  campaign_id TEXT,
  cta_id TEXT,
  cta_text TEXT,
  commercial_score REAL NOT NULL DEFAULT 0,
  destination_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
  FOREIGN KEY (offer_id) REFERENCES monetization_offers(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES monetization_campaigns(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_content_monetization_offer ON content_monetization(offer_id);
CREATE INDEX IF NOT EXISTS idx_content_monetization_campaign ON content_monetization(campaign_id);
CREATE INDEX IF NOT EXISTS idx_content_monetization_goal ON content_monetization(monetization_goal);

CREATE TABLE IF NOT EXISTS monetization_tracked_links (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  brand_id TEXT NOT NULL,
  content_item_id TEXT,
  campaign_id TEXT,
  offer_id TEXT,
  cta_id TEXT,
  platform TEXT,
  destination_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES monetization_campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (offer_id) REFERENCES monetization_offers(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_monetization_links_content ON monetization_tracked_links(content_item_id);
CREATE INDEX IF NOT EXISTS idx_monetization_links_campaign ON monetization_tracked_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_monetization_links_offer ON monetization_tracked_links(offer_id);

CREATE TABLE IF NOT EXISTS monetization_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression','click','landing_view','lead','checkout','purchase','refund','affiliate_click','affiliate_conversion','app_install','app_open','signup','tool_used')),
  brand_id TEXT NOT NULL,
  content_item_id TEXT,
  campaign_id TEXT,
  offer_id TEXT,
  tracked_link_id TEXT,
  source TEXT,
  platform TEXT,
  visitor_id TEXT,
  session_id TEXT,
  external_event_id TEXT,
  idempotency_key TEXT,
  value_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IDR',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES monetization_campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (offer_id) REFERENCES monetization_offers(id) ON DELETE SET NULL,
  FOREIGN KEY (tracked_link_id) REFERENCES monetization_tracked_links(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_monetization_events_idempotency ON monetization_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_monetization_events_type_time ON monetization_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_events_content ON monetization_events(content_item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_events_campaign ON monetization_events(campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_events_offer ON monetization_events(offer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_events_visitor ON monetization_events(visitor_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS monetization_revenue_events (
  id TEXT PRIMARY KEY,
  transaction_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('sale','affiliate_commission','subscription','refund','chargeback','lead_value','service_conversion')),
  source TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  content_item_id TEXT,
  campaign_id TEXT,
  offer_id TEXT,
  source_event_id TEXT,
  gross_amount INTEGER NOT NULL DEFAULT 0,
  fee_amount INTEGER NOT NULL DEFAULT 0,
  cost_amount INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER NOT NULL DEFAULT 0,
  margin_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','refunded','rejected')),
  external_reference TEXT,
  idempotency_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES monetization_campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (offer_id) REFERENCES monetization_offers(id) ON DELETE SET NULL,
  FOREIGN KEY (source_event_id) REFERENCES monetization_events(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_monetization_revenue_idempotency ON monetization_revenue_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_monetization_revenue_transaction ON monetization_revenue_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_monetization_revenue_time ON monetization_revenue_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_revenue_content ON monetization_revenue_events(content_item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_revenue_offer ON monetization_revenue_events(offer_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS monetization_touchpoints (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  session_id TEXT,
  content_item_id TEXT,
  campaign_id TEXT,
  offer_id TEXT,
  platform TEXT,
  touch_type TEXT NOT NULL CHECK (touch_type IN ('impression','click','landing_view','lead','checkout')),
  event_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES monetization_campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (offer_id) REFERENCES monetization_offers(id) ON DELETE SET NULL,
  FOREIGN KEY (event_id) REFERENCES monetization_events(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_monetization_touchpoints_visitor ON monetization_touchpoints(visitor_id, occurred_at ASC);

CREATE TABLE IF NOT EXISTS monetization_learning_insights (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  statement TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0,
  action_recommendation TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_monetization_learning_brand_status ON monetization_learning_insights(brand_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS monetization_experiments (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  variable TEXT NOT NULL,
  variant_a_json TEXT NOT NULL DEFAULT '{}',
  variant_b_json TEXT NOT NULL DEFAULT '{}',
  primary_metric TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','completed','cancelled')),
  winner TEXT CHECK (winner IS NULL OR winner IN ('a','b','none')),
  result_json TEXT NOT NULL DEFAULT '{}',
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS monetization_integration_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','warning','error','duplicate')),
  error_code TEXT,
  error_message TEXT,
  correlation_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_monetization_integration_logs_time ON monetization_integration_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_integration_logs_provider ON monetization_integration_logs(provider, created_at DESC);

CREATE TABLE IF NOT EXISTS monetization_daily_analytics (
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
  purchases INTEGER NOT NULL DEFAULT 0,
  gross_revenue INTEGER NOT NULL DEFAULT 0,
  net_revenue INTEGER NOT NULL DEFAULT 0,
  profit INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (day, brand_id, content_item_id, campaign_id, offer_id, platform),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

INSERT INTO activity_logs (
  event_type,
  entity_type,
  entity_id,
  status,
  message,
  metadata_json
) SELECT
  'monetization.schema.ready',
  'system',
  'monetization-engine-v1',
  'success',
  'Schema Monetization Engine v1.0 ditambahkan secara additive.',
  '{"migration":"0004_monetization_engine_v1.sql","policy":"additive-only"}'
WHERE NOT EXISTS (
  SELECT 1 FROM activity_logs
  WHERE event_type = 'monetization.schema.ready'
    AND entity_id = 'monetization-engine-v1'
);
