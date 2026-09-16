-- Update payment_method enum to include new payment methods
-- Add easypaisa, jazzcash, nayapay to allowed values

-- First, alter the column to use VARCHAR instead of ENUM
ALTER TABLE invoices 
ALTER COLUMN payment_method TYPE VARCHAR(50);

-- Remove the old enum type constraint if exists
ALTER TABLE invoices 
DROP CONSTRAINT IF EXISTS invoices_payment_method_check;

-- Add new check constraint with all payment methods
ALTER TABLE invoices 
ADD CONSTRAINT invoices_payment_method_check 
CHECK (payment_method IN ('cash', 'card', 'easypaisa', 'jazzcash', 'nayapay', 'online', 'bank_transfer'));

-- Update any existing 'card' entries to remain 'card'
UPDATE invoices SET payment_method = 'card' WHERE payment_method = 'card';

-- Add comment
COMMENT ON COLUMN invoices.payment_method IS 'Payment method: cash, card, easypaisa, jazzcash, nayapay, online, bank_transfer';

SELECT 'Payment method enum updated successfully!' as result;
SELECT DISTINCT payment_method, COUNT(*) as count 
FROM invoices 
GROUP BY payment_method;
