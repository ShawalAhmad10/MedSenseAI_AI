BEGIN;
ALTER TABLE product ADD COLUMN IF NOT EXISTS product_purchase_price numeric(14,2);
ALTER TABLE product ALTER COLUMN product_pack_price TYPE numeric(14,2);
-- Preserve legacy batches. The oldest receipt establishes the price for future receipts.
UPDATE product p SET product_purchase_price = h.product_price
FROM (
  SELECT DISTINCT ON (product_id) product_id, product_price
  FROM stock_history WHERE product_price > 0
  ORDER BY product_id, batch_id
) h
WHERE p.product_id = h.product_id AND p.product_purchase_price IS NULL;
COMMIT;
