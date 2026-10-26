PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS topic_research_runs (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  platform TEXT NOT NULL CHECK (platform IN ('threads', 'x', 'instagram')),
  lookback_days INTEGER NOT NULL DEFAULT 7 CHECK (lookback_days BETWEEN 1 AND 30),
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'waiting_provider', 'ready', 'failed')),
  result_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_topic_research_runs_created
  ON topic_research_runs(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_topic_research_runs_status
  ON topic_research_runs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS topic_research_accounts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('threads', 'x', 'instagram')),
  username TEXT NOT NULL,
  display_name TEXT,
  profile_url TEXT,
  followers INTEGER,
  relevance_score REAL NOT NULL DEFAULT 0,
  viral_score REAL NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES topic_research_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_topic_research_accounts_run
  ON topic_research_accounts(run_id, relevance_score DESC, viral_score DESC);

CREATE TABLE IF NOT EXISTS topic_research_posts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  account_id TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('threads', 'x', 'instagram')),
  external_id TEXT,
  url TEXT,
  text TEXT NOT NULL,
  created_at_external TEXT,
  likes INTEGER,
  replies INTEGER,
  reposts INTEGER,
  views INTEGER,
  relevance_score REAL NOT NULL DEFAULT 0,
  virality_score REAL NOT NULL DEFAULT 0,
  analysis_json TEXT NOT NULL DEFAULT '{}',
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES topic_research_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES topic_research_accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_topic_research_posts_run
  ON topic_research_posts(run_id, virality_score DESC, relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_topic_research_posts_external
  ON topic_research_posts(platform, external_id);
