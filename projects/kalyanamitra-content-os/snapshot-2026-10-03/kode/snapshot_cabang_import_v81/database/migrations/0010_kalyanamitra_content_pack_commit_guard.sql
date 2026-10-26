PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_pack_commit_guards (
  import_id TEXT NOT NULL PRIMARY KEY,
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_id) REFERENCES content_pack_imports(id) ON DELETE RESTRICT
);
