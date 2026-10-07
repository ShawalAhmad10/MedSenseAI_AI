-- ============================================================
-- MIGRATION: Fix customer_ledger table structure
-- Old table has product-level columns (wrong design)
-- New table is transaction-level (correct design)
-- Safe: table has 0 rows, no data loss
-- ============================================================

-- Step 1: Drop old table
DROP TABLE IF EXISTS customer_ledger CASCADE;

-- Step 2: Create correct customer_ledger table
CREATE TABLE customer_ledger (
  ledger_id       SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customers(customer_id),
  account_id      INTEGER NOT NULL REFERENCES customer_accounts(account_id),
  transaction_date TIMESTAMP NOT NULL DEFAULT NOW(),
  transaction_type VARCHAR(50) NOT NULL,  -- opening_balance, invoice, payment, return, adjustment
  reference_type  VARCHAR(50),            -- INVOICE, PAYMENT, RETURN, OPENING
  reference_id    INTEGER,                -- FK to invoices.invoice_id etc
  reference_number VARCHAR(100),          -- INV-000001, PMT-000001 etc
  debit_amount    NUMERIC(15,2) DEFAULT 0.00,   -- invoice created (customer owes us)
  credit_amount   NUMERIC(15,2) DEFAULT 0.00,   -- payment received (customer paid)
  balance         NUMERIC(15,2) DEFAULT 0.00,   -- running balance after this entry
  payment_method  VARCHAR(50) DEFAULT 'cash',   -- cash only for now
  description     TEXT,
  performed_by    VARCHAR(255),
  status          INTEGER DEFAULT 1,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Step 3: Indexes for fast lookup
CREATE INDEX idx_customer_ledger_customer ON customer_ledger(customer_id);
CREATE INDEX idx_customer_ledger_date ON customer_ledger(transaction_date DESC);
CREATE INDEX idx_customer_ledger_type ON customer_ledger(transaction_type);
