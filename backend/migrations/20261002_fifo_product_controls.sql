BEGIN;
ALTER TABLE product ADD COLUMN IF NOT EXISTS fifo_family_id INTEGER;
ALTER TABLE product ADD COLUMN IF NOT EXISTS manually_inactive BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE product ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
-- Link legacy price versions with explicit (new)/(newest) suffixes, preserving their names.
WITH families AS (
 SELECT product_id, MIN(product_id) OVER (PARTITION BY
 LOWER(TRIM(REGEXP_REPLACE(COALESCE(product_title,''), '\s*\((new|newest)\)\s*$', '', 'i'))),
 LOWER(TRIM(COALESCE(product_generic_name,''))), LOWER(TRIM(COALESCE(product_salt,''))),
 product_brand, COALESCE(NULLIF(product_pack_size,0),1)) AS root_id
 FROM product
)
UPDATE product p SET fifo_family_id = f.root_id FROM families f
WHERE p.product_id = f.product_id AND p.fifo_family_id IS NULL;
UPDATE product SET product_status = 0 WHERE archived OR manually_inactive;
COMMIT;
