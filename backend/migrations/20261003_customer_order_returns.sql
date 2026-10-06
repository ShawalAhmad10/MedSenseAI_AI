ALTER TYPE enum_customer_ledger_transaction_type ADD VALUE IF NOT EXISTS 'refund';
CREATE TABLE IF NOT EXISTS invoice_return (
 return_id SERIAL PRIMARY KEY, return_number VARCHAR(100) NOT NULL UNIQUE,
 linked_invoice_id INTEGER NOT NULL REFERENCES invoice(invoice_id), linked_invoice_number TEXT NOT NULL,
 customer_name TEXT NOT NULL, customer_phone TEXT, customer_email TEXT, invoice_type TEXT DEFAULT 'normal',
 return_description TEXT, subtotal NUMERIC(14,2) NOT NULL DEFAULT 0, discount NUMERIC(14,2) DEFAULT 0,
 total_amount NUMERIC(14,2) NOT NULL DEFAULT 0, refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
 refund_method TEXT DEFAULT 'cash', refund_status TEXT NOT NULL DEFAULT 'pending', created_by TEXT,
 status INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS invoice_return_report (
 return_item_id SERIAL PRIMARY KEY, return_id INTEGER NOT NULL REFERENCES invoice_return(return_id),
 product_id INTEGER NOT NULL REFERENCES product(product_id), product_name TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0), unit_price NUMERIC(14,2) NOT NULL,
 total_price NUMERIC(14,2) NOT NULL, product_profit NUMERIC(14,2) DEFAULT 0,
 invoice_type TEXT DEFAULT 'normal', status INTEGER DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW(),
 batch_id INTEGER REFERENCES stock_history(batch_id), invoice_item_id INTEGER REFERENCES invoice_report(item_id)
);
ALTER TABLE invoice_report ADD COLUMN IF NOT EXISTS returned_quantity INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS invoice_return_invoice_idx ON invoice_return(linked_invoice_id);
