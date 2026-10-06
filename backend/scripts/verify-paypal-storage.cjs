const assert = require('node:assert/strict');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/config/database');

async function main() {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const query = (sql, replacements = {}) => sequelize.query(sql, { transaction, replacements, logging: false, type: QueryTypes.RAW });
    const schema = process.env.DB_SCHEMA || 'public';
    assert.match(schema, /^[a-zA-Z_][a-zA-Z0-9_]*$/);
    await query(`SET LOCAL search_path TO "${schema}"`);
    const [tables] = await query(`SELECT table_name AS storage_name FROM information_schema.tables
      WHERE table_schema = :schema AND table_name IN
      ('customer_subscriptions', 'subscription_payments', 'paypal_webhook_events')`, { schema });
    assert.equal(tables.length, 3, JSON.stringify({ schema, tables }));
    const [customers] = await query('SELECT customer_id FROM customer ORDER BY customer_id LIMIT 1');
    assert.ok(customers.length, 'An existing customer is required for this rollback test');
    const [subscriptions] = await query(`INSERT INTO customer_subscriptions
      (subscription_id, customer_id, paypal_subscription_id) VALUES (-900001, :customer, 'VERIFY-ROLLBACK')
      RETURNING subscription_id`, { customer: customers[0].customer_id });
    const subscription = subscriptions[0].subscription_id;
    async function rejects(sql, code) {
      await query('SAVEPOINT expected_failure');
      let rejected = false;
      try { await query(sql, { subscription }); }
      catch (error) { assert.equal(error.original?.code, code); rejected = true; }
      finally { await query('ROLLBACK TO SAVEPOINT expected_failure'); }
      assert.ok(rejected, 'Expected database constraint rejection');
    }
    await query(`INSERT INTO subscription_payments
      (payment_id, subscription_id, paypal_payment_id, amount, currency)
      VALUES (-900001, :subscription, 'VERIFY-PAYMENT', 1, 'USD')`, { subscription });
    await rejects(`INSERT INTO subscription_payments
      (payment_id, subscription_id, paypal_payment_id, amount, currency)
      VALUES (-900002, :subscription, 'VERIFY-PAYMENT', 1, 'USD')`, '23505');
    await rejects(`INSERT INTO subscription_payments
      (payment_id, subscription_id, environment, paypal_payment_id, amount, currency)
      VALUES (-900002, :subscription, 'live', 'VERIFY-LIVE', 1, 'USD')`, '23503');
    await query(`INSERT INTO paypal_webhook_events
      (webhook_event_id, paypal_event_id, event_type, event_payload)
      VALUES (-900001, 'VERIFY-EVENT', 'BILLING.SUBSCRIPTION.ACTIVATED', '{}')`);
    await rejects(`INSERT INTO paypal_webhook_events
      (webhook_event_id, paypal_event_id, event_type, event_payload)
      VALUES (-900002, 'VERIFY-EVENT', 'BILLING.SUBSCRIPTION.ACTIVATED', '{}')`, '23505');
    await rejects(`UPDATE paypal_webhook_events SET processing_status = 'processed'
      WHERE webhook_event_id = -900001`, '23514');
    await rejects(`UPDATE paypal_webhook_events SET processing_status = 'processed',
      signature_verified = TRUE, is_simulated = TRUE WHERE webhook_event_id = -900001`, '23514');
    const [ownership] = await query(`SELECT conname FROM pg_constraint
      WHERE conname = 'customer_refill_subscription_owner_fk'
      AND conrelid = 'customer_refill_reminders'::regclass`);
    assert.equal(ownership.length, 1);
    await transaction.rollback();
    transaction = null;
    console.log('PASS: 3 tables, payment/event uniqueness, environment isolation, webhook verification and refill ownership constraint.');
    console.log('Verification records rolled back; no customer data or ID sequences changed.');
  } finally {
    if (transaction && !transaction.finished) await transaction.rollback();
    await sequelize.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
