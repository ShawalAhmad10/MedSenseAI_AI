-- ========================================
-- Migration: Convert product_id from INTEGER to UUID
-- Date: 2026-09-08
-- Purpose: Enhanced security and unpredictability
-- ========================================

-- Step 1: Add temporary UUID columns to all affected tables
-- ========================================

-- Product table
ALTER TABLE product ADD COLUMN product_id_uuid UUID;

-- Foreign key tables
ALTER TABLE batches ADD COLUMN product_id_uuid UUID;
ALTER TABLE invoice_items ADD COLUMN product_id_uuid UUID;
ALTER TABLE stock_history_open ADD COLUMN product_id_uuid UUID;
ALTER TABLE stock_ledger ADD COLUMN product_id_uuid UUID;
ALTER TABLE stock_return_report ADD COLUMN product_id_uuid UUID;
ALTER TABLE inventory ADD COLUMN product_id_uuid UUID;

-- Step 2: Generate UUIDs for existing products and map them
-- ========================================

-- Update product table with new UUIDs
UPDATE product SET product_id_uuid = gen_random_uuid();

-- Create temporary mapping table for old ID -> new UUID
CREATE TEMP TABLE product_id_mapping AS
SELECT product_id AS old_id, product_id_uuid AS new_uuid
FROM product;

-- Step 3: Update foreign key references using the mapping
-- ========================================

-- Update batches
UPDATE batches b
SET product_id_uuid = m.new_uuid
FROM product_id_mapping m
WHERE b.product_id = m.old_id;

-- Update invoice_items
UPDATE invoice_items i
SET product_id_uuid = m.new_uuid
FROM product_id_mapping m
WHERE i.product_id = m.old_id;

-- Update stock_history_open
UPDATE stock_history_open s
SET product_id_uuid = m.new_uuid
FROM product_id_mapping m
WHERE s.product_id = m.old_id;

-- Update stock_ledger
UPDATE stock_ledger sl
SET product_id_uuid = m.new_uuid
FROM product_id_mapping m
WHERE sl.product_id = m.old_id;

-- Update stock_return_report
UPDATE stock_return_report sr
SET product_id_uuid = m.new_uuid
FROM product_id_mapping m
WHERE sr.product_id = m.old_id;

-- Update inventory
UPDATE inventory inv
SET product_id_uuid = m.new_uuid
FROM product_id_mapping m
WHERE inv.product_id = m.old_id;

-- Step 4: Drop old foreign key constraints
-- ========================================

-- Drop foreign keys from all tables
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_product_id_fkey CASCADE;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS fk_batches_product CASCADE;

ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_product_id_fkey CASCADE;
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS fk_invoice_items_product CASCADE;

ALTER TABLE stock_history_open DROP CONSTRAINT IF EXISTS stock_history_open_product_id_fkey CASCADE;
ALTER TABLE stock_history_open DROP CONSTRAINT IF EXISTS fk_stock_history_open_product CASCADE;

ALTER TABLE stock_ledger DROP CONSTRAINT IF EXISTS stock_ledger_product_id_fkey CASCADE;
ALTER TABLE stock_ledger DROP CONSTRAINT IF EXISTS fk_stock_ledger_product CASCADE;

ALTER TABLE stock_return_report DROP CONSTRAINT IF EXISTS stock_return_report_product_id_fkey CASCADE;
ALTER TABLE stock_return_report DROP CONSTRAINT IF EXISTS fk_stock_return_report_product CASCADE;

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_product_id_fkey CASCADE;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS fk_inventory_product CASCADE;

-- Step 5: Drop old INTEGER product_id columns
-- ========================================

-- Drop primary key constraint on product table first
ALTER TABLE product DROP CONSTRAINT IF EXISTS product_pkey CASCADE;
ALTER TABLE product DROP CONSTRAINT IF EXISTS pk_product CASCADE;

-- Drop old INTEGER columns with CASCADE to handle dependencies
ALTER TABLE product DROP COLUMN product_id CASCADE;
ALTER TABLE batches DROP COLUMN IF EXISTS product_id CASCADE;
ALTER TABLE invoice_items DROP COLUMN IF EXISTS product_id CASCADE;
ALTER TABLE stock_history_open DROP COLUMN IF EXISTS product_id CASCADE;
ALTER TABLE stock_ledger DROP COLUMN IF EXISTS product_id CASCADE;
ALTER TABLE stock_return_report DROP COLUMN IF EXISTS product_id CASCADE;
ALTER TABLE inventory DROP COLUMN IF EXISTS product_id CASCADE;

-- Step 6: Rename UUID columns to product_id
-- ========================================

ALTER TABLE product RENAME COLUMN product_id_uuid TO product_id;
ALTER TABLE batches RENAME COLUMN product_id_uuid TO product_id;
ALTER TABLE invoice_items RENAME COLUMN product_id_uuid TO product_id;
ALTER TABLE stock_history_open RENAME COLUMN product_id_uuid TO product_id;
ALTER TABLE stock_ledger RENAME COLUMN product_id_uuid TO product_id;
ALTER TABLE stock_return_report RENAME COLUMN product_id_uuid TO product_id;
ALTER TABLE inventory RENAME COLUMN product_id_uuid TO product_id;

-- Step 7: Add primary key and constraints back
-- ========================================

-- Add primary key on product table
ALTER TABLE product ADD PRIMARY KEY (product_id);

-- Make product_id NOT NULL where required
ALTER TABLE product ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE batches ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE stock_ledger ALTER COLUMN product_id SET NOT NULL;

-- Step 8: Add foreign key constraints
-- ========================================

ALTER TABLE batches 
ADD CONSTRAINT fk_batches_product 
FOREIGN KEY (product_id) REFERENCES product(product_id) ON DELETE CASCADE;

ALTER TABLE invoice_items 
ADD CONSTRAINT fk_invoice_items_product 
FOREIGN KEY (product_id) REFERENCES product(product_id) ON DELETE SET NULL;

ALTER TABLE stock_history_open 
ADD CONSTRAINT fk_stock_history_open_product 
FOREIGN KEY (product_id) REFERENCES product(product_id) ON DELETE SET NULL;

ALTER TABLE stock_ledger 
ADD CONSTRAINT fk_stock_ledger_product 
FOREIGN KEY (product_id) REFERENCES product(product_id) ON DELETE CASCADE;

ALTER TABLE stock_return_report 
ADD CONSTRAINT fk_stock_return_report_product 
FOREIGN KEY (product_id) REFERENCES product(product_id) ON DELETE SET NULL;

ALTER TABLE inventory 
ADD CONSTRAINT fk_inventory_product 
FOREIGN KEY (product_id) REFERENCES product(product_id) ON DELETE CASCADE;

-- Step 9: Verification
-- ========================================

DO $$
DECLARE
    product_count INTEGER;
    batch_count INTEGER;
    invoice_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO product_count FROM product WHERE product_id IS NOT NULL;
    SELECT COUNT(*) INTO batch_count FROM batches WHERE product_id IS NOT NULL;
    SELECT COUNT(*) INTO invoice_count FROM invoice_items WHERE product_id IS NOT NULL;
    
    RAISE NOTICE '✅ Migration Complete!';
    RAISE NOTICE 'Products with UUID: %', product_count;
    RAISE NOTICE 'Batches with UUID: %', batch_count;
    RAISE NOTICE 'Invoice items with UUID: %', invoice_count;
END $$;

-- ========================================
-- Migration Complete
-- ========================================
