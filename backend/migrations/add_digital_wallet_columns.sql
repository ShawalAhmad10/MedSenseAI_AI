-- Add digital wallet payment columns to invoices table
-- Run this migration to support EasyPaisa, JazzCash, NayaPay payments

ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS wallet_account_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS wallet_account_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS wallet_cnic VARCHAR(15);

-- Add comments
COMMENT ON COLUMN invoices.wallet_account_name IS 'Account holder name for digital wallet payments';
COMMENT ON COLUMN invoices.wallet_account_number IS 'Account number for EasyPaisa/JazzCash/NayaPay';
COMMENT ON COLUMN invoices.wallet_cnic IS 'CNIC for wallet verification';

-- Update payment_method enum to include new methods (if using enum, otherwise skip)
-- For string column, no action needed

SELECT 'Digital wallet columns added to invoices table successfully!' as result;
