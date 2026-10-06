const assert = require('node:assert/strict');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/config/database');
const { createSubscriptionService } = require('../src/services/customerSubscriptionService');

(async () => {
  sequelize.options.logging = false;
  const transaction = await sequelize.transaction();
  const query = (sql, replacements = {}) => sequelize.query(sql, { transaction, replacements, type: QueryTypes.SELECT, logging: false });
  try {
    const sources = await query(`SELECT i.customer_id,i.invoice_id,ir.product_id FROM invoice i
      JOIN invoice_report ir ON ir.invoice_id=i.invoice_id
      WHERE i.customer_id IS NOT NULL AND ir.quantity>0 AND COALESCE(ir.status,1)=1
      AND COALESCE(i.status,1)=1 AND LOWER(COALESCE(i.delivery_status,'')) IN ('delivered','returned')
      AND NOT EXISTS (SELECT 1 FROM customer_refill_reminders r WHERE r.customer_id=i.customer_id
        AND r.source_invoice_id=i.invoice_id AND r.product_id=ir.product_id AND r.lifecycle_status='active')
      AND NOT EXISTS (SELECT 1 FROM customer_subscriptions s WHERE s.customer_id=i.customer_id AND s.environment='sandbox'
        AND s.subscription_status IN ('approval_pending','approved','active','suspended')) LIMIT 1`);
    assert.ok(sources.length, 'No unused existing customer purchase is available for rollback verification');
    const source = sources[0];
    const id = 900001;
    const base = { id: 'I-VERIFYTEST', plan_id: 'P-VERIFYTEST', custom_id: `medsense:${id}:${source.customer_id}`,
      start_time: '2026-10-02T00:00:00Z', billing_info: { next_billing_time: '2026-11-02T00:00:00Z' } };
    const payment = { id: 'VERIFYTESTSALE', status: 'COMPLETED', gross_amount: { value: '1.00', currency_code: 'USD' }, time: '2026-10-02T00:00:00Z' };
    let status = 'ACTIVE';
    let paidStatus = 'COMPLETED';
    let signature = true;
    const paypal = { config: () => ({ mode: 'sandbox' }), verifyWebhook: async () => signature,
      request: async (method, path) => {
        if (path.includes('/transactions?')) return { transactions: [{ ...payment, status: paidStatus }] };
        if (method === 'POST' && path.endsWith('/cancel')) { status = 'CANCELLED'; return; }
        return { ...base, status };
      } };
    const db = { query: (sql, options) => sequelize.query(sql, { ...options, transaction }), transaction: work => work(transaction) };
    const service = createSubscriptionService({ db, paypal, env: {} });
    await query(`INSERT INTO customer_subscriptions
      (subscription_id,customer_id,environment,paypal_subscription_id,paypal_plan_id,subscription_status,amount,currency)
      VALUES (:id,:customer,'sandbox','I-VERIFYTEST','P-VERIFYTEST','approval_pending',1,'USD')`, { id, customer: source.customer_id });
    await query(`INSERT INTO customer_refill_reminders
      (reminder_id,customer_id,source_invoice_id,product_id,reminder_date)
      VALUES (:id,:customer,:invoice,:product,CURRENT_DATE)`, { id, customer: source.customer_id, invoice: source.invoice_id, product: source.product_id });
    await assert.rejects(service.refresh(9999999, id), { code: 'SUBSCRIPTION_NOT_FOUND' });
    await assert.rejects(service.attachReminder(source.customer_id, id, id, 7), { code: 'SUBSCRIPTION_NOT_PAID' });
    await service.refresh(source.customer_id, id);
    await service.attachReminder(source.customer_id, id, id, 7);
    await service.completeRecurringReminder(source.customer_id, id);
    const next = await query(`SELECT reminder_id,reminder_date-CURRENT_DATE AS interval FROM customer_refill_reminders
      WHERE previous_reminder_id=:id`, { id });
    assert.equal(next.length, 1); assert.equal(next[0].interval, 7);
    const event = { id: 'VERIFYTESTEVENT', event_type: 'PAYMENT.SALE.COMPLETED', resource: {
      id: payment.id, state: 'completed', billing_agreement_id: base.id, amount: { total: '1.00', currency: 'USD' }, create_time: payment.time } };
    await service.webhook({}, event); await service.webhook({}, event);
    assert.equal((await query("SELECT COUNT(*)::int AS n FROM paypal_webhook_events WHERE paypal_event_id='VERIFYTESTEVENT'"))[0].n, 1);
    assert.equal((await query("SELECT COUNT(*)::int AS n FROM subscription_payments WHERE paypal_payment_id='VERIFYTESTSALE'"))[0].n, 1);
    signature = false;
    await assert.rejects(service.webhook({}, { ...event, id: 'FORGEDVERIFY' }), { code: 'PAYPAL_SIGNATURE_INVALID' });
    signature = true; paidStatus = 'REFUNDED';
    await service.refresh(source.customer_id, id);
    await service.webhook({}, { ...event, id: 'LATECOMPLETIONVERIFY' });
    assert.equal((await query("SELECT payment_status FROM subscription_payments WHERE paypal_payment_id='VERIFYTESTSALE'"))[0].payment_status, 'refunded');
    await assert.rejects(service.attachReminder(source.customer_id, id, next[0].reminder_id, 7), { code: 'SUBSCRIPTION_NOT_PAID' });
    await service.cancel(source.customer_id, id);
    await service.completeRecurringReminder(source.customer_id, next[0].reminder_id);
    assert.equal((await query('SELECT COUNT(*)::int AS n FROM customer_refill_reminders WHERE previous_reminder_id=:id', { id: next[0].reminder_id }))[0].n, 0);
    console.log('PASS: ownership, verified payment reconciliation, recurring refill interval, duplicate webhook/payment, invalid signature, refund protection and cancellation.');
  } finally {
    await transaction.rollback(); await sequelize.close();
    console.log('All verification records rolled back. PayPal provider was mocked; no real payment or subscription created.');
  }
})().catch(error => { console.error(error.code || error.message);
  if (error.original?.position && error.sql) {
    const position = Number(error.original.position) - 1;
    console.error('SQL near error: ' + error.sql.slice(Math.max(0,position-70),position+70));
  }
  process.exitCode = 1; });
