CREATE TABLE IF NOT EXISTS panglima_pretest_profiles (
    participant_id TEXT PRIMARY KEY,
    owner_name TEXT NOT NULL,
    business_name TEXT NOT NULL,
    business_type TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'pretest',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS panglima_device_licenses (
    participant_id TEXT PRIMARY KEY,
    device_hash TEXT NOT NULL CHECK (length(device_hash) = 64),
    owner_name TEXT NOT NULL,
    business_name TEXT NOT NULL,
    business_type TEXT NOT NULL DEFAULT '',
    profile_source TEXT NOT NULL DEFAULT 'registered',
    activated_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);
