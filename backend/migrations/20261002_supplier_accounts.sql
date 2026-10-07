BEGIN;

CREATE TABLE IF NOT EXISTS supplier_accounts (
  supplier_account_id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES supplier_info(supplier_id),
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_debit NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_return NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  account_status VARCHAR(30) NOT NULL DEFAULT 'active',
  notes TEXT,
  status INTEGER NOT NULL DEFAULT 1,
  creation_day DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_accounts_active_supplier
  ON supplier_accounts(supplier_id) WHERE status = 1;

CREATE TABLE IF NOT EXISTS supplier_ledger (
  ledger_number SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES supplier_info(supplier_id),
  supplier_account_id INTEGER NOT NULL REFERENCES supplier_accounts(supplier_account_id),
  transaction_type VARCHAR(40) NOT NULL,
  account_type INTEGER NOT NULL DEFAULT 0,
  payment_type INTEGER NOT NULL DEFAULT 0,
  stock_id INTEGER REFERENCES stock(stock_id),
  product_id INTEGER REFERENCES product(product_id),
  product_title VARCHAR(255),
  product_quantity INTEGER NOT NULL DEFAULT 0,
  product_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  debit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT,
  reference_type VARCHAR(40),
  reference_number VARCHAR(255),
  performed_by VARCHAR(255),
  status INTEGER NOT NULL DEFAULT 1,
  time_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creation_day DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS supplier_ledger_supplier_time
  ON supplier_ledger(supplier_id, time_created DESC);

-- Import balances only for newly created accounts. Rerunning must not reset accounts
-- or duplicate opening entries. Keep historical receipts/payments/returns intact.
WITH receipts AS (
  SELECT supplier_id, SUM(COALESCE(total_amount, 0)) AS debit,
    SUM(COALESCE(paid_amount, 0)) AS credit
  FROM stock WHERE status = 1 GROUP BY supplier_id
), returns AS (
  SELECT supplier_id, SUM(COALESCE(total_amount, 0)) AS returned
  FROM stock_return WHERE status = 1 GROUP BY supplier_id
), new_accounts AS (
  INSERT INTO supplier_accounts (supplier_id, total_debit, total_credit, total_return, current_balance, notes)
  SELECT s.supplier_id, COALESCE(r.debit, 0), COALESCE(r.credit, 0), COALESCE(rt.returned, 0),
    COALESCE(r.debit, 0) - COALESCE(r.credit, 0) - COALESCE(rt.returned, 0),
    'Initialized from existing stock bills, recorded payments and stock returns.'
  FROM supplier_info s
  LEFT JOIN receipts r ON r.supplier_id = s.supplier_id
  LEFT JOIN returns rt ON rt.supplier_id = s.supplier_id
  ON CONFLICT (supplier_id) WHERE status = 1 DO NOTHING
  RETURNING *
)
INSERT INTO supplier_ledger (supplier_id, supplier_account_id, transaction_type,
  debit_amount, credit_amount, balance, description, reference_type, performed_by)
SELECT supplier_id, supplier_account_id, 'opening_balance', total_debit,
  total_credit + total_return, current_balance,
  'Balance imported from existing stock bills, recorded payments and returns; original records preserved.',
  'MIGRATION', 'System migration'
FROM new_accounts WHERE total_debit <> 0 OR total_credit <> 0 OR total_return <> 0;

COMMIT;
