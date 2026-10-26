PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS design_assets (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('logo', 'slide_image')),
  slide_number INTEGER,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_design_assets_content
  ON design_assets(content_item_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS content_designs (
  content_item_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  preset TEXT NOT NULL DEFAULT 'brand',
  background_color TEXT NOT NULL DEFAULT '#fffaf0',
  primary_color TEXT NOT NULL DEFAULT '#9e1b13',
  accent_color TEXT NOT NULL DEFAULT '#c69a3d',
  text_color TEXT NOT NULL DEFAULT '#1b1612',
  heading_font TEXT NOT NULL DEFAULT 'classic',
  body_font TEXT NOT NULL DEFAULT 'sans',
  logo_asset_id TEXT,
  logo_position TEXT NOT NULL DEFAULT 'top-right',
  logo_size TEXT NOT NULL DEFAULT 'medium',
  slide_assets_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
  FOREIGN KEY (logo_asset_id) REFERENCES design_assets(id) ON DELETE SET NULL
);
