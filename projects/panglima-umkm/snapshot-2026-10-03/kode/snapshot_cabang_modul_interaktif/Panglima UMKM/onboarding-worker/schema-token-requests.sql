CREATE TABLE IF NOT EXISTS panglima_token_requests (
  request_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  email_hash TEXT NOT NULL CHECK (length(email_hash) = 64),
  device_hash TEXT NOT NULL CHECK (length(device_hash) = 64),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 3),
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  processed_at TEXT,
  error_code TEXT,
  FOREIGN KEY (transaction_id)
    REFERENCES panglima_onboarding_fulfillments(transaction_id),
  FOREIGN KEY (participant_id)
    REFERENCES panglima_participants(id)
);

CREATE INDEX IF NOT EXISTS idx_panglima_token_requests_email_time
  ON panglima_token_requests(email_hash, requested_at);

CREATE INDEX IF NOT EXISTS idx_panglima_token_requests_device_time
  ON panglima_token_requests(device_hash, requested_at);

CREATE INDEX IF NOT EXISTS idx_panglima_token_requests_status_time
  ON panglima_token_requests(status, requested_at);

-- Hak modul dibuat terpisah agar tabel peserta dan fulfillment produksi lama
-- tidak perlu diubah. Satu transaksi jalur produk hanya dapat memberi satu modul.
CREATE TABLE IF NOT EXISTS panglima_module_entitlements (
  participant_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  module_code TEXT NOT NULL
    CHECK (module_code IN ('property', 'insurance', 'mlm')),
  source_variant TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (participant_id, module_code),
  FOREIGN KEY (participant_id) REFERENCES panglima_participants(id),
  FOREIGN KEY (transaction_id)
    REFERENCES panglima_onboarding_fulfillments(transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_panglima_module_entitlements_participant
  ON panglima_module_entitlements(participant_id);
