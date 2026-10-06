BEGIN;
ALTER TABLE invoice_report ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES stock_history(batch_id);
CREATE INDEX IF NOT EXISTS invoice_report_batch_id_idx ON invoice_report(batch_id);
-- Backfill only unambiguous existing references. Preserve ambiguous legacy records.
UPDATE invoice_report i SET batch_id = b.batch_id
FROM (SELECT product_id, batch_number, MIN(batch_id) AS batch_id FROM stock_history
      GROUP BY product_id, batch_number HAVING COUNT(*) = 1) b
WHERE i.batch_id IS NULL AND i.product_id = b.product_id AND i.batch_number = b.batch_number;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_history_nonnegative_quantity') THEN
    ALTER TABLE stock_history ADD CONSTRAINT stock_history_nonnegative_quantity
      CHECK (remaining_quantity >= 0 AND initial_quantity >= 0) NOT VALID;
  END IF;
END $$;
COMMIT;
