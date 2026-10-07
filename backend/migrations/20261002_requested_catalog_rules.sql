CREATE TABLE IF NOT EXISTS medicine_categories (
  category_id SERIAL PRIMARY KEY,
  category_name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 1
);
INSERT INTO medicine_categories(category_name,display_order,status)
SELECT value,ordinality,1 FROM jsonb_array_elements_text('["Analgesic / Antipyretic","Analgesic","NSAID / Painkiller","Cold & Flu","Antibiotic","Antibiotic / Antiprotozoal","Gastrointestinal","Antiemetic","Antispasmodic","Antihistamine","Respiratory","Cough / Respiratory","Cough Suppressant","Cardiovascular","Cardiovascular / Lipid Lowering","Antihypertensive","Lipid Lowering","Antidiabetic","Multivitamin","Vitamins","Calcium / Supplement","Supplement","Iron Supplement","Calcium / Vitamin D","Joint Supplement","Antimalarial","Herbal Supplement","Personal Care","Neurological","Antipsychotic","Antidepressant","Neuropathic Pain","Respiratory / Antiallergic","Throat / Cough Relief"]'::jsonb)
WITH ORDINALITY ON CONFLICT(category_name) DO NOTHING;
INSERT INTO medicine_categories(category_name,display_order,status)
VALUES('Other',35,1) ON CONFLICT(category_name) DO NOTHING;

ALTER TABLE product ADD COLUMN IF NOT EXISTS medicine_supply_key TEXT;
CREATE TABLE IF NOT EXISTS medicine_supplier_bindings (
  medicine_key TEXT PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES supplier_info(supplier_id)
);
CREATE OR REPLACE FUNCTION enforce_medicine_supplier() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE chosen_key TEXT; assigned_supplier INTEGER;
BEGIN
  IF COALESCE(NEW.archived,false) THEN RETURN NEW; END IF;
  IF NEW.product_brand IS NULL OR NEW.product_supplier IS NULL THEN
    RAISE EXCEPTION 'Brand and supplier are required for every product' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM brand WHERE brand_id=NEW.product_brand AND status=1)
    OR NOT EXISTS(SELECT 1 FROM supplier_info WHERE supplier_id=NEW.product_supplier AND status=1) THEN
    RAISE EXCEPTION 'Select an active existing brand and supplier' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM medicine_categories WHERE category_name=NEW.product_category AND status=1) THEN
    RAISE EXCEPTION 'Select a category from the medicine category directory' USING ERRCODE='23514';
  END IF;
  IF NEW.fifo_family_id IS NOT NULL AND NEW.fifo_family_id<>NEW.product_id THEN
    SELECT medicine_supply_key INTO chosen_key FROM product WHERE product_id=NEW.fifo_family_id;
  END IF;
  chosen_key := COALESCE(chosen_key,concat_ws('|',
    regexp_replace(regexp_replace(lower(trim(NEW.product_title)),'\s+',' ','g'),'\s+[0-9]+(\.[0-9]+)?\s*ml$',''),
    regexp_replace(lower(trim(COALESCE(NEW.product_salt,NEW.product_generic_name,''))),'\s+',' ','g'),
    NEW.product_brand,COALESCE(NEW.product_pack_size,1)));
  IF TG_OP='UPDATE' AND OLD.medicine_supply_key IS NOT NULL AND
    (NEW.product_supplier IS DISTINCT FROM OLD.product_supplier OR NEW.product_brand IS DISTINCT FROM OLD.product_brand
      OR NEW.product_salt IS DISTINCT FROM OLD.product_salt OR NEW.product_pack_size IS DISTINCT FROM OLD.product_pack_size) THEN
    RAISE EXCEPTION 'An existing medicine keeps its assigned brand, composition, pack size and supplier' USING ERRCODE='23514';
  END IF;
  INSERT INTO medicine_supplier_bindings(medicine_key,supplier_id) VALUES(chosen_key,NEW.product_supplier)
    ON CONFLICT(medicine_key) DO NOTHING;
  SELECT supplier_id INTO assigned_supplier FROM medicine_supplier_bindings WHERE medicine_key=chosen_key;
  IF assigned_supplier IS DISTINCT FROM NEW.product_supplier THEN
    RAISE EXCEPTION 'This medicine is already assigned to another supplier' USING ERRCODE='23514';
  END IF;
  NEW.medicine_supply_key := chosen_key;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS product_medicine_supplier_guard ON product;
CREATE TRIGGER product_medicine_supplier_guard BEFORE INSERT OR UPDATE OF
  product_brand,product_supplier,product_title,product_salt,product_generic_name,product_pack_size,product_pack_description,
  product_category,fifo_family_id,archived ON product FOR EACH ROW EXECUTE FUNCTION enforce_medicine_supplier();

CREATE OR REPLACE FUNCTION enforce_receipt_supplier() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE expected_supplier INTEGER; receipt_supplier INTEGER;
BEGIN
  IF NEW.stock_id IS NULL THEN RETURN NEW; END IF;
  SELECT product_supplier INTO expected_supplier FROM product WHERE product_id=NEW.product_id;
  SELECT supplier_id INTO receipt_supplier FROM stock WHERE stock_id=NEW.stock_id;
  IF expected_supplier IS NULL OR receipt_supplier IS DISTINCT FROM expected_supplier THEN
    RAISE EXCEPTION 'Stock must be received from the medicine assigned supplier' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_receipt_supplier_guard ON stock_history;
CREATE TRIGGER stock_receipt_supplier_guard BEFORE INSERT OR UPDATE OF product_id,stock_id
  ON stock_history FOR EACH ROW EXECUTE FUNCTION enforce_receipt_supplier();

CREATE OR REPLACE FUNCTION enforce_receipt_header_supplier() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM stock_history h JOIN product p ON p.product_id=h.product_id
    WHERE h.stock_id=NEW.stock_id AND p.product_supplier IS DISTINCT FROM NEW.supplier_id) THEN
    RAISE EXCEPTION 'A receipt keeps the assigned supplier of its medicines' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_header_supplier_guard ON stock;
CREATE TRIGGER stock_header_supplier_guard BEFORE UPDATE OF supplier_id ON stock
  FOR EACH ROW EXECUTE FUNCTION enforce_receipt_header_supplier();
