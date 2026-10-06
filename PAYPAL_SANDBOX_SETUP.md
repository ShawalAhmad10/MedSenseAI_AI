# PayPal Sandbox setup

1. Open [Apps & Credentials](https://developer.paypal.com/dashboard/applications/sandbox), sign in, select **Sandbox**, then **Create App**. Name it MedSenseAI and select your Sandbox Business account. Copy the app's Client ID and Secret. [Official instructions](https://developer.paypal.com/api/get-started/).
2. Open [Sandbox Accounts](https://developer.paypal.com/dashboard/accounts). Use View/Edit Account to get the Business test account's email and password. The Personal test account will approve customer subscriptions; these use test money.
3. Sign into [Sandbox Subscriptions](https://www.sandbox.paypal.com/billing/subscriptions) with that **Business test account**. Create a product and fixed-price plan, choose a supported currency and billing frequency, activate/save it, and copy its `P-...` Plan ID. Use the same Business account as the app. [Plan instructions](https://developer.paypal.com/subscriptions/dashboard/use-dashboard/).
4. The backend listener is implemented at `/api/paypal/webhook`. In the same Sandbox app, choose Add Webhook, enter your public HTTPS backend URL plus this path, select subscription lifecycle and payment events, and save. Copy the generated Webhook ID. Localhost and the Neon database hostname cannot serve as a PayPal webhook URL. [Webhook instructions](https://developer.paypal.com/api/rest/webhooks/rest/).

Fill the existing settings in `backend/.env` using `backend/paypal.env.example` as a reference:

```dotenv
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_secret
PAYPAL_DAILY_PLAN_ID=P-your_daily_plan
PAYPAL_WEEKLY_PLAN_ID=P-your_weekly_plan
PAYPAL_MONTHLY_PLAN_ID=P-your_monthly_plan
PAYPAL_WEBHOOK_ID=your_registered_webhook_id
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_PUBLIC_URL=https://your-public-backend/api/paypal/webhook
```

Use one-day, one-week and one-month regular billing intervals for the corresponding plan keys. Prices/currency, trial cycles, setup fees and taxes are read from PayPal and displayed before subscription approval. The legacy monthly `PAYPAL_PLAN_ID` and public origin `PAYPAL_PUBLIC_BASE_URL` are also supported. Keep the Secret only in backend configuration; do not put it into frontend/VITE variables, screenshots, source control, or chat. Restart the backend after changing `.env`.

## Database storage implemented

The migration `backend/migrations/20261002_paypal_subscriptions.sql` creates:

- `customer_subscriptions`: customer ownership, PayPal subscription/plan IDs, sandbox/live environment, status, amount/currency and billing dates.
- `subscription_payments`: individual payment IDs, amount/currency, payment status and dates.
- `paypal_webhook_events`: event IDs, original JSON payload, verification and processing status. Duplicate events are rejected; simulated/unverified events cannot be marked processed.
- `customer_refill_reminders.subscription_id`: optional subscription link with a constraint enforcing the same customer owner. Existing manual reminders remain valid.

These tables are applied to the application's `medsense_app` cloud schema. Original `public` tables are preserved. No fake paid subscriptions were inserted. `20261002_paypal_subscription_flow.sql` adds provider request IDs, approval links, failed-payment tracking, one-current-subscription uniqueness, customer-selected recurrence days and a link to the previous reminder.

## Customer flow

Open `/subscriptions` from Account, the navigation menu, the footer or Refill Reminders. Choose daily/weekly/monthly billing, approve on PayPal and return. The backend verifies subscription ownership, plan and current status using PayPal APIs; a browser return parameter does not mark it paid. Refresh status reconciles the last 30 days of transactions if a webhook was delayed or missed. Cancellation stops future recurring reminders; existing reminders and payment history remain.

This implementation treats the subscription as a paid recurring reminder service. Medicines still use normal purchase checkout, FIFO prices and existing prescription/interaction checks. It does not automatically order or charge for medicines.

On `/refills`, schedule a manual reminder from a delivered purchase, then enable recurring reminders with your chosen interval (1–365 days). Marking a reminder done retains it in history and creates the next reminder. Repeats require an active subscription, a verified completed payment, no unresolved payment failure, and an eligible purchase. Cancelled, suspended, expired or unpaid subscriptions do not schedule repeats. Timing is never inferred from dose or purchase quantity.

Subscribe to `BILLING.SUBSCRIPTION.CREATED`, `.ACTIVATED`, `.UPDATED`, `.CANCELLED`, `.SUSPENDED`, `.EXPIRED`, `.PAYMENT.FAILED`, plus `PAYMENT.SALE.COMPLETED`, `.REFUNDED`, `.REVERSED`. The listener verifies signatures with the registered Webhook ID before storing or processing events. Duplicate deliveries and late completion events do not duplicate payments or reverse refunds. The PayPal simulator is not treated as a real paid subscription.

## Verification

From backend, `node scripts/check-paypal-config.cjs` authenticates credentials and checks all configured plans and webhook registration without creating a payment. An HTTP 401 `invalid_client` means the app credential pair or Sandbox/Live mode needs correction in PayPal; copying plan IDs cannot fix authentication.

Run `node scripts/verify-paypal-storage.cjs` from backend to check storage constraints. Its test records are rolled back.
`node scripts/verify-subscription-flow.cjs` checks real database behavior using mocked PayPal responses and rolls back test records. It is not a real PayPal payment test.
