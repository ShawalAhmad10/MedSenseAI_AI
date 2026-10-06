CREATE TABLE IF NOT EXISTS evaluation_lead_activity (
 customer_id INTEGER PRIMARY KEY REFERENCES customer(customer_id) ON DELETE CASCADE,
 source_fingerprint VARCHAR(64) NOT NULL, dataset JSONB NOT NULL,
 observation_time TIMESTAMPTZ NOT NULL, data_origin TEXT NOT NULL DEFAULT 'synthetic_development'
 CHECK(data_origin='synthetic_development'), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
