BEGIN;
CREATE TABLE IF NOT EXISTS customer_subscriptions (
  subscription_id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customer(customer_id) ON DELETE RESTRICT,
  environment VARCHAR(10) NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'live')),
  paypal_subscription_id VARCHAR(100),
  paypal_plan_id VARCHAR(100),
  subscription_type VARCHAR(30) CHECK (subscription_type IN ('membership', 'medicine_refill')),
  subscription_status VARCHAR(30) NOT NULL DEFAULT 'approval_pending'
    CHECK (subscription_status IN ('approval_pending', 'approved', 'active', 'suspended', 'cancelled', 'expired')),
  amount NUMERIC(14,2) CHECK (amount >= 0),
  currency VARCHAR(3) CHECK (currency ~ '^[A-Z]{3}$'),
  started_at TIMESTAMPTZ,
  last_payment_at TIMESTAMPTZ,
  next_billing_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (environment, paypal_subscription_id),
  UNIQUE (subscription_id, customer_id),
  UNIQUE (subscription_id, environment)
);
CREATE INDEX IF NOT EXISTS customer_subscriptions_customer_status_idx
  ON customer_subscriptions(customer_id, subscription_status);

CREATE TABLE IF NOT EXISTS subscription_payments (
  payment_id SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL,
  environment VARCHAR(10) NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'live')),
  paypal_payment_id VARCHAR(100) NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded', 'reversed')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (environment, paypal_payment_id),
  FOREIGN KEY (subscription_id, environment)
    REFERENCES customer_subscriptions(subscription_id, environment) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS subscription_payments_subscription_date_idx
  ON subscription_payments(subscription_id, created_at);

CREATE TABLE IF NOT EXISTS paypal_webhook_events (
  webhook_event_id SERIAL PRIMARY KEY,
  environment VARCHAR(10) NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'live')),
  paypal_event_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  subscription_id INTEGER,
  is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  processing_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processed', 'failed', 'ignored')),
  event_payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (environment, paypal_event_id),
  FOREIGN KEY (subscription_id, environment)
    REFERENCES customer_subscriptions(subscription_id, environment) ON DELETE RESTRICT,
  CHECK (processing_status <> 'processed' OR (signature_verified AND NOT is_simulated))
);

-- Existing manual reminders remain valid. Composite FK enforces customer ownership.
ALTER TABLE customer_refill_reminders ADD COLUMN IF NOT EXISTS subscription_id INTEGER;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_refill_subscription_owner_fk'
      AND conrelid = 'customer_refill_reminders'::regclass
  ) THEN
    ALTER TABLE customer_refill_reminders
      ADD CONSTRAINT customer_refill_subscription_owner_fk
      FOREIGN KEY (subscription_id, customer_id)
      REFERENCES customer_subscriptions(subscription_id, customer_id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS customer_refill_subscription_idx
  ON customer_refill_reminders(subscription_id) WHERE subscription_id IS NOT NULL;
COMMIT;
