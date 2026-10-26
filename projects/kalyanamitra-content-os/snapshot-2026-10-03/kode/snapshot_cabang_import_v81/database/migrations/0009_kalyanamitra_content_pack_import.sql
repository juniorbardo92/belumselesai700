PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO brands (
  id,
  name,
  slug,
  voice,
  palette_json,
  status
) VALUES (
  'brand-ruang-kalyanamitra',
  'Ruang Kalyanamitra',
  'ruang-kalyanamitra',
  'Hangat, reflektif, jernih, membumi, dan berhati-hati dalam menyampaikan sumber Dharma.',
  '{}',
  'active'
);

CREATE TABLE IF NOT EXISTS content_pack_imports (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  package_id TEXT NOT NULL,
  package_revision INTEGER NOT NULL,
  part_number INTEGER NOT NULL,
  part_total INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  filename TEXT NOT NULL,
  payload_json TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  admin_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'committed', 'rejected', 'expired')),
  confirmation_token_hash TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_pack_imports_package
  ON content_pack_imports(namespace, package_id, part_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_pack_imports_status
  ON content_pack_imports(status, expires_at);

CREATE TABLE IF NOT EXISTS content_pack_items (
  namespace TEXT NOT NULL,
  package_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  publish_date TEXT NOT NULL,
  slot INTEGER NOT NULL,
  content_fingerprint TEXT NOT NULL,
  content_item_id TEXT NOT NULL UNIQUE,
  package_revision INTEGER NOT NULL,
  import_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (namespace, package_id, external_id),
  UNIQUE (namespace, publish_date, slot),
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE RESTRICT,
  FOREIGN KEY (import_id) REFERENCES content_pack_imports(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_content_pack_items_date
  ON content_pack_items(namespace, publish_date, slot);

CREATE INDEX IF NOT EXISTS idx_content_pack_items_import
  ON content_pack_items(import_id);
