BEGIN;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS legacy_source_schema TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS legacy_source_invoice_id INTEGER;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS legacy_source_invoice_number TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS legacy_source_record JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_legacy_cloud_source_idx
ON invoice (legacy_source_schema, legacy_source_invoice_id)
WHERE legacy_source_schema IS NOT NULL;
COMMIT;
