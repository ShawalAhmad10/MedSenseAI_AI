BEGIN;
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS approval_url TEXT;
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS payment_failure_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS customer_subscription_request_idx ON customer_subscriptions(request_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_subscription_current_idx
  ON customer_subscriptions(customer_id, environment)
  WHERE subscription_status IN ('approval_pending', 'approved', 'active', 'suspended');
ALTER TABLE customer_refill_reminders ADD COLUMN IF NOT EXISTS recurrence_days INTEGER
  CHECK (recurrence_days BETWEEN 1 AND 365);
ALTER TABLE customer_refill_reminders ADD COLUMN IF NOT EXISTS previous_reminder_id INTEGER UNIQUE
  REFERENCES customer_refill_reminders(reminder_id) ON DELETE RESTRICT;
COMMIT;
