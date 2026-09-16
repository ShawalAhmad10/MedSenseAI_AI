-- Create proper customer_accounts_new table with correct structure
-- This will replace the existing customer_accounts which has wrong structure

-- Rename old table (backup)
ALTER TABLE IF EXISTS customer_accounts RENAME TO customer_accounts_old_backup;

-- Create new customer_accounts table with proper structure
CREATE TABLE customer_accounts (
  account_id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  opening_balance NUMERIC(15,2) DEFAULT 0.00,
  current_balance NUMERIC(15,2) DEFAULT 0.00,
  total_debit NUMERIC(15,2) DEFAULT 0.00,
  total_credit NUMERIC(15,2) DEFAULT 0.00,
  credit_limit NUMERIC(15,2) DEFAULT 50000.00,
  payment_terms INTEGER DEFAULT 30,
  account_status VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'closed')),
  notes TEXT,
  status INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_customer_accounts_customer_id ON customer_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_accounts_status ON customer_accounts(status);

-- Add comments
COMMENT ON TABLE customer_accounts IS 'Customer account balances and credit management';
COMMENT ON COLUMN customer_accounts.opening_balance IS 'Initial balance when account created';
COMMENT ON COLUMN customer_accounts.current_balance IS 'Current outstanding balance (debit - credit)';
COMMENT ON COLUMN customer_accounts.total_debit IS 'Total purchases/invoices';
COMMENT ON COLUMN customer_accounts.total_credit IS 'Total payments received';
COMMENT ON COLUMN customer_accounts.credit_limit IS 'Maximum credit allowed';
COMMENT ON COLUMN customer_accounts.payment_terms IS 'Payment terms in days';

-- Create accounts for existing customers
INSERT INTO customer_accounts (customer_id, opening_balance, current_balance, credit_limit, payment_terms, account_status, status, created_at)
SELECT 
  customer_id,
  0.00 as opening_balance,
  0.00 as current_balance,
  50000.00 as credit_limit,
  30 as payment_terms,
  'active' as account_status,
  1 as status,
  CURRENT_TIMESTAMP
FROM customers
WHERE NOT EXISTS (
  SELECT 1 FROM customer_accounts WHERE customer_accounts.customer_id = customers.customer_id
);

SELECT 'Customer accounts table created successfully!' as result;
SELECT COUNT(*) as accounts_created FROM customer_accounts;
