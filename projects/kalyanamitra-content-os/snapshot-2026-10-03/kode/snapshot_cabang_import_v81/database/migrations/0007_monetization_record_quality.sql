-- Provenance overlay. Existing ledger/events remain untouched and unknown by default.

CREATE TABLE IF NOT EXISTS monetization_record_quality (
  record_type TEXT NOT NULL CHECK (record_type IN ('event','revenue_event','learning_insight')),
  record_id TEXT NOT NULL,
  data_class TEXT NOT NULL DEFAULT 'unknown' CHECK (data_class IN ('production','acceptance','synthetic','internal_test','unknown')),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('verified','unverified')),
  amount_basis TEXT CHECK (amount_basis IS NULL OR amount_basis IN ('provider_reported','system_derived','manual','unknown')),
  fee_status TEXT CHECK (fee_status IS NULL OR fee_status IN ('actual','estimated','not_applicable','unknown')),
  cost_status TEXT CHECK (cost_status IS NULL OR cost_status IN ('actual','estimated','not_applicable','unknown')),
  evidence_ref TEXT,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (record_type, record_id)
);

CREATE INDEX IF NOT EXISTS idx_monetization_record_quality_scope
  ON monetization_record_quality(record_type, data_class, verification_status);

-- No existing business/evidence row is auto-classified. Verification is a separate,
-- authenticated operator action through the quality endpoint and requires evidence_ref.

INSERT INTO activity_logs(event_type,entity_type,entity_id,status,message,metadata_json)
SELECT 'monetization.record_quality.ready','system','monetization-engine-v15','success',
  'Record-quality overlay aktif; row lama tidak dihapus atau ditulis ulang.',
  '{"migration":"0007_monetization_record_quality.sql","defaultClass":"unknown","policy":"additive-only"}'
WHERE NOT EXISTS (
  SELECT 1 FROM activity_logs
  WHERE event_type='monetization.record_quality.ready' AND entity_id='monetization-engine-v15'
);
