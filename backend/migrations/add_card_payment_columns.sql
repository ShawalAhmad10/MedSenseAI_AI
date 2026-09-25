-- Add card payment columns to invoices table
-- Run this migration to support card payment details

ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS card_holder_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS card_last_four VARCHAR(4),
ADD COLUMN IF NOT EXISTS card_expiry VARCHAR(7),
ADD COLUMN IF NOT EXISTS billing_address TEXT;

-- Add comment
COMMENT ON COLUMN invoices.card_holder_name IS 'Name on the card (for card payments)';
COMMENT ON COLUMN invoices.card_last_four IS 'Last 4 digits of card number (for security)';
COMMENT ON COLUMN invoices.card_expiry IS 'Card expiry date in MM/YY format';
COMMENT ON COLUMN invoices.billing_address IS 'Billing address for card payments';

SELECT 'Card payment columns added to invoices table successfully!' as result;
