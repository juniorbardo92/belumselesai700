CREATE TABLE IF NOT EXISTS certificate_completions (
  participant_id TEXT PRIMARY KEY,
  owner_name TEXT NOT NULL,
  email TEXT NOT NULL,
  business_name TEXT NOT NULL,
  completion_date TEXT NOT NULL,
  diagnosis_answered INTEGER NOT NULL,
  diagnosis_total INTEGER NOT NULL,
  actions_completed INTEGER NOT NULL,
  actions_total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  mentor_notes TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT,
  rejected_at TEXT,
  dispatched_at TEXT,
  dispatch_error TEXT NOT NULL DEFAULT '',
  dispatch_attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_certificate_completions_status_updated
  ON certificate_completions(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS certificate_rate_limits (
  scope TEXT NOT NULL,
  day_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, day_key)
);

CREATE TABLE IF NOT EXISTS certificate_events (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_certificate_events_participant_created
  ON certificate_events(participant_id, created_at DESC);
