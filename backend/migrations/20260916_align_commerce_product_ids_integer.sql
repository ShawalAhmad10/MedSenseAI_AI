-- ============================================================================
-- MedSenseAI baseline migration
-- Align commerce product IDs with the latest partner backend.
--
-- Canonical contract:
--   product.product_id               INTEGER PK, auto-increment
--   invoice_report.product_id        INTEGER
--   stock_history.product_id         INTEGER NOT NULL
--   stock_history_open.product_id    INTEGER
--   stock_report.product_id          INTEGER NOT NULL
--   stock_return_report.product_id   INTEGER
--
-- Idempotent:
--   - Safe to re-run.
--   - Already-aligned INTEGER columns are left unchanged.
--   - Refuses destructive UUID -> INTEGER conversion when non-numeric values
--     exist. No guessed remapping is performed.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    t TEXT;
    typ TEXT;
    bad_count BIGINT;
BEGIN
    -- ------------------------------------------------------------------------
    -- 1. Validate any legacy non-integer product_id values before conversion.
    -- ------------------------------------------------------------------------
    FOREACH t IN ARRAY ARRAY[
        'product',
        'invoice_report',
        'stock_history',
        'stock_history_open',
        'stock_report',
        'stock_return_report'
    ]
    LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            CONTINUE;
        END IF;

        SELECT c.data_type
          INTO typ
          FROM information_schema.columns c
         WHERE c.table_schema = 'public'
           AND c.table_name = t
           AND c.column_name = 'product_id';

        IF typ IS NULL OR typ = 'integer' THEN
            CONTINUE;
        END IF;

        EXECUTE format(
            'SELECT count(*) FROM %I WHERE product_id IS NOT NULL AND product_id::text !~ %L',
            t,
            '^[0-9]+$'
        )
        INTO bad_count;

        IF bad_count > 0 THEN
            RAISE EXCEPTION
                'Cannot safely convert %.product_id from % to INTEGER: % non-numeric value(s) exist',
                t, typ, bad_count;
        END IF;
    END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- 2. Drop product_id FK constraints temporarily, if any.
--    They will be recreated only where an equivalent FK existed.
-- --------------------------------------------------------------------------

CREATE TEMP TABLE IF NOT EXISTS _medsense_product_fk_backup (
    table_name      TEXT,
    constraint_name TEXT,
    constraint_def  TEXT
) ON COMMIT DROP;

TRUNCATE _medsense_product_fk_backup;

INSERT INTO _medsense_product_fk_backup(table_name, constraint_name, constraint_def)
SELECT
    conrelid::regclass::text,
    conname,
    pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid = 'public.product'::regclass
  AND pg_get_constraintdef(oid) ILIKE '%product_id%';

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT table_name, constraint_name
        FROM _medsense_product_fk_backup
    LOOP
        EXECUTE format(
            'ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I',
            r.table_name,
            r.constraint_name
        );
    END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- 3. Convert dependent columns first when required.
-- --------------------------------------------------------------------------

DO $$
DECLARE
    t TEXT;
    typ TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'invoice_report',
        'stock_history',
        'stock_history_open',
        'stock_report',
        'stock_return_report'
    ]
    LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            CONTINUE;
        END IF;

        SELECT c.data_type
          INTO typ
          FROM information_schema.columns c
         WHERE c.table_schema = 'public'
           AND c.table_name = t
           AND c.column_name = 'product_id';

        IF typ IS NOT NULL AND typ <> 'integer' THEN
            EXECUTE format(
                'ALTER TABLE %I ALTER COLUMN product_id TYPE INTEGER USING product_id::text::integer',
                t
            );
        END IF;
    END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- 4. Convert product.product_id when required.
-- --------------------------------------------------------------------------

DO $$
DECLARE
    typ TEXT;
BEGIN
    IF to_regclass('public.product') IS NULL THEN
        RAISE EXCEPTION 'Required table public.product does not exist';
    END IF;

    SELECT c.data_type
      INTO typ
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'product'
       AND c.column_name = 'product_id';

    IF typ IS NULL THEN
        RAISE EXCEPTION 'Required column product.product_id does not exist';
    END IF;

    IF typ <> 'integer' THEN
        ALTER TABLE product
            ALTER COLUMN product_id DROP DEFAULT;

        ALTER TABLE product
            ALTER COLUMN product_id TYPE INTEGER
            USING product_id::text::integer;
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- 5. Ensure canonical product PK sequence/default.
-- --------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS product_product_id_seq;

ALTER SEQUENCE product_product_id_seq
    OWNED BY product.product_id;

SELECT setval(
    'product_product_id_seq',
    COALESCE((SELECT MAX(product_id) FROM product), 0) + 1,
    false
);

ALTER TABLE product
    ALTER COLUMN product_id
    SET DEFAULT nextval('product_product_id_seq'::regclass);

ALTER TABLE product
    ALTER COLUMN product_id SET NOT NULL;

-- --------------------------------------------------------------------------
-- 6. Canonical nullability required by latest backend models.
-- --------------------------------------------------------------------------

DO $$
BEGIN
    IF to_regclass('public.stock_history') IS NOT NULL THEN
        ALTER TABLE stock_history
            ALTER COLUMN product_id SET NOT NULL;
    END IF;

    IF to_regclass('public.stock_report') IS NOT NULL THEN
        ALTER TABLE stock_report
            ALTER COLUMN product_id SET NOT NULL;
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- 7. Restore previously-existing product foreign keys.
-- --------------------------------------------------------------------------

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT table_name, constraint_name, constraint_def
        FROM _medsense_product_fk_backup
    LOOP
        BEGIN
            EXECUTE format(
                'ALTER TABLE %s ADD CONSTRAINT %I %s',
                r.table_name,
                r.constraint_name,
                r.constraint_def
            );
        EXCEPTION
            WHEN duplicate_object THEN
                NULL;
        END;
    END LOOP;
END $$;

COMMIT;
