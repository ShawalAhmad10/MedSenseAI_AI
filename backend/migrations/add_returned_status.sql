-- Add 'returned' value to delivery_status enum
ALTER TYPE enum_invoices_delivery_status ADD VALUE IF NOT EXISTS 'returned';
