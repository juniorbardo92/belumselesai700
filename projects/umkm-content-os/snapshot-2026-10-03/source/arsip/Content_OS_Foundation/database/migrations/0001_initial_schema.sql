PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  voice TEXT,
  palette_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  relevance_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'approved', 'rejected', 'produced')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_topics_brand_status ON topics(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_topics_created_at ON topics(created_at DESC);

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  format TEXT NOT NULL,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  body_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'scheduled', 'published', 'failed')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_content_brand_status ON content_items(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_content_topic ON content_items(topic_id);

CREATE TABLE IF NOT EXISTS render_jobs (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL,
  output_format TEXT NOT NULL DEFAULT 'carousel',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  github_run_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON render_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  content_item_id TEXT,
  render_job_id TEXT,
  platform TEXT NOT NULL,
  kind TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  public_url TEXT,
  width INTEGER,
  height INTEGER,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE SET NULL,
  FOREIGN KEY (render_job_id) REFERENCES render_jobs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_content ON assets(content_item_id);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);

INSERT OR IGNORE INTO brands (
  id,
  name,
  slug,
  voice,
  palette_json
) VALUES (
  'brand-umkm-naik-kelas',
  'UMKM Naik Kelas',
  'umkm-naik-kelas',
  'Tegas, praktis, diagnostik, dan membumi untuk pemilik UMKM Indonesia.',
  '{"red":"#9E1B13","gold":"#C69A3D","cream":"#F5E9D1","ink":"#1B1612"}'
);

INSERT INTO activity_logs (
  event_type,
  entity_type,
  entity_id,
  status,
  message
) SELECT
  'system.bootstrap',
  'brand',
  'brand-umkm-naik-kelas',
  'success',
  'Fondasi Content OS dibuat.'
WHERE NOT EXISTS (
  SELECT 1
  FROM activity_logs
  WHERE event_type = 'system.bootstrap'
    AND entity_id = 'brand-umkm-naik-kelas'
);
