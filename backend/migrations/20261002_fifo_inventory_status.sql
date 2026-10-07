BEGIN;
-- Only availability changes. Historical receipt names, dates and prices are untouched.
UPDATE stock_history SET batch_status = 'FINISHED'
WHERE remaining_quantity = 0 AND batch_status = 'ACTIVE';
UPDATE product p SET product_status = CASE WHEN EXISTS (
  SELECT 1 FROM stock_history h WHERE h.product_id = p.product_id AND h.status = 1
  AND h.batch_status = 'ACTIVE' AND h.remaining_quantity > 0 AND h.sale_price > 0
  AND (h.expiry_date IS NULL OR h.expiry_date >= CURRENT_DATE)
) THEN 1 ELSE 0 END;
CREATE INDEX IF NOT EXISTS stock_history_fifo_arrival_idx
ON stock_history (product_id, creation_day, created_at, batch_id)
WHERE status = 1 AND batch_status = 'ACTIVE' AND remaining_quantity > 0;
COMMIT;
