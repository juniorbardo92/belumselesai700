-- Append-only audit trail for record-quality projection changes.

CREATE TABLE IF NOT EXISTS monetization_record_quality_history (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  record_type TEXT NOT NULL CHECK (record_type IN ('event','revenue_event','learning_insight')),
  record_id TEXT NOT NULL,
  previous_data_class TEXT,
  previous_verification_status TEXT,
  previous_evidence_ref TEXT,
  previous_reason TEXT,
  previous_metadata_json TEXT,
  new_data_class TEXT NOT NULL CHECK (new_data_class IN ('production','acceptance','synthetic','internal_test','unknown')),
  new_verification_status TEXT NOT NULL CHECK (new_verification_status IN ('verified','unverified')),
  evidence_ref TEXT,
  reason TEXT,
  new_metadata_json TEXT,
  actor_type TEXT NOT NULL,
  correlation_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_monetization_quality_history_record
  ON monetization_record_quality_history(record_type,record_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS monetization_quality_history_no_update
BEFORE UPDATE ON monetization_record_quality_history
BEGIN
  SELECT RAISE(ABORT,'monetization_record_quality_history is append-only');
END;

CREATE TRIGGER IF NOT EXISTS monetization_quality_history_no_delete
BEFORE DELETE ON monetization_record_quality_history
BEGIN
  SELECT RAISE(ABORT,'monetization_record_quality_history is append-only');
END;

INSERT INTO activity_logs(event_type,entity_type,entity_id,status,message,metadata_json)
SELECT 'monetization.record_quality_history.ready','system','monetization-engine-v15','success',
  'Append-only record-quality history aktif; business record tidak diubah.',
  '{"migration":"0008_monetization_quality_history.sql","policy":"additive-only"}'
WHERE NOT EXISTS (
  SELECT 1 FROM activity_logs
  WHERE event_type='monetization.record_quality_history.ready' AND entity_id='monetization-engine-v15'
);
