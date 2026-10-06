const { randomUUID } = require('node:crypto');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { paypalClient, paypalError } = require('./paypalClient');

const statuses = { APPROVAL_PENDING: 'approval_pending', APPROVED: 'approved', ACTIVE: 'active',
  SUSPENDED: 'suspended', CANCELLED: 'cancelled', EXPIRED: 'expired' };
const positiveId = value => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw paypalError('SUBSCRIPTION_INVALID_ID', 'Invalid record ID.', 400);
  return id;
};
function approvalURL(value, mode) {
  let url;
  try { url = new URL(value); } catch { throw paypalError('PAYPAL_APPROVAL_INVALID', 'PayPal did not provide an approval link.', 502); }
  const host = mode === 'sandbox' ? 'www.sandbox.paypal.com' : 'www.paypal.com';
  if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port) {
    throw paypalError('PAYPAL_APPROVAL_INVALID', 'PayPal returned an unexpected approval link.', 502);
  }
  return url.href;
}
function detailsFor(row, details) {
  if (details.id !== row.paypal_subscription_id || details.plan_id !== row.paypal_plan_id ||
      details.custom_id !== `medsense:${row.subscription_id}:${row.customer_id}` || !statuses[details.status]) {
    throw paypalError('PAYPAL_SUBSCRIPTION_MISMATCH', 'PayPal subscription details do not match this account.', 409);
  }
  return { status: statuses[details.status], started: details.start_time || null,
    next: details.billing_info?.next_billing_time || null, failed: Number(details.billing_info?.failed_payments_count || 0) };
}
function validPayment(payment) {
  const money = payment.amount || payment.gross_amount;
  const amount = money?.total ?? money?.value;
  const currency = money?.currency ?? money?.currency_code;
  if (typeof payment.id !== 'string' || payment.id.length > 100 || !/^(\d+)(\.\d{1,2})?$/.test(String(amount)) ||
      Number(amount) <= 0 || !/^[A-Z]{3}$/.test(currency || '')) {
    throw paypalError('PAYPAL_PAYMENT_INVALID', 'PayPal returned invalid payment details.', 502);
  }
  const paid = payment.time || payment.create_time;
  if (!paid || Number.isNaN(Date.parse(paid))) throw paypalError('PAYPAL_PAYMENT_INVALID', 'PayPal payment date is missing.', 502);
  return { id: payment.id, amount: String(amount), currency, paid };
}
function refundSaleId(event) {
  if (event.event_type === 'PAYMENT.SALE.REVERSED') return event.resource?.id;
  if (event.resource?.sale_id) return event.resource.sale_id;
  const link = event.resource?.links?.find(item => item.rel === 'sale');
  if (link) {
    try {
      const url = new URL(link.href);
      if (url.protocol === 'https:' && ['api.paypal.com','api-m.paypal.com','api.sandbox.paypal.com','api-m.sandbox.paypal.com'].includes(url.hostname)) {
        return /^\/v1\/payments\/sale\/([A-Z0-9]+)$/.exec(url.pathname)?.[1];
      }
    } catch { return null; }
  }
  return null;
}

function createSubscriptionService({ db = sequelize, paypal = paypalClient, env = process.env } = {}) {
  const query = (sql, replacements = {}, transaction) => db.query(sql, { replacements, transaction, type: QueryTypes.SELECT, logging: false });
  async function owned(customer, id) {
    const rows = await query(`SELECT * FROM customer_subscriptions WHERE subscription_id=:id
      AND customer_id=:customer AND environment=:environment`,
    { id: positiveId(id), customer: positiveId(customer), environment: paypal.config().mode });
    if (!rows.length) throw paypalError('SUBSCRIPTION_NOT_FOUND', 'Subscription not found.', 404);
    return rows[0];
  }
  async function plan(interval = 'monthly') {
    const { mode, planId } = paypal.config({ plan: true, interval });
    const result = await paypal.request('GET', `/v1/billing/plans/${encodeURIComponent(planId)}`);
    if (result.id !== planId || result.status !== 'ACTIVE') throw paypalError('PAYPAL_PLAN_INACTIVE', 'The subscription plan is not active.');
    const regular = result.billing_cycles?.find(c => c.tenure_type === 'REGULAR');
    if (!regular?.pricing_scheme?.fixed_price) throw paypalError('PAYPAL_PLAN_UNSUPPORTED', 'A fixed-price subscription plan is required.');
    const expectedUnit = { daily: 'DAY', weekly: 'WEEK', monthly: 'MONTH' }[interval];
    if (regular.frequency?.interval_unit !== expectedUnit || regular.frequency?.interval_count !== 1) {
      throw paypalError('PAYPAL_PLAN_INTERVAL_MISMATCH', `The ${interval} plan has a different billing frequency.`);
    }
    return { interval, environment: mode, id: result.id, name: result.name, cycles: result.billing_cycles.map(c => ({
      type: c.tenure_type, cycles: c.total_cycles, frequency: c.frequency, price: c.pricing_scheme?.fixed_price || null })),
    amount: regular.pricing_scheme.fixed_price.value, currency: regular.pricing_scheme.fixed_price.currency_code,
    frequency: regular.frequency, setup_fee: result.payment_preferences?.setup_fee || null,
    taxes: result.taxes || null };
  }
  async function configuration() {
    const plans = [];
    const unavailable = [];
    for (const interval of ['daily','weekly','monthly']) {
      try { plans.push(await plan(interval)); }
      catch (error) { unavailable.push({ interval, code: error.code || 'PAYPAL_UNAVAILABLE',
        message: error.code ? error.message : 'Subscription setup is unavailable.' }); }
    }
    let webhookReady = false;
    try { webhookReady = Boolean(env.PAYPAL_WEBHOOK_ID?.trim() && paypal.webhookURL?.()); } catch { /* Settings stay usable while listener configuration is corrected. */ }
    return { enabled: plans.length > 0, plans, unavailable, webhook_ready: webhookReady };
  }
  async function list(customer) {
    const environment = paypal.config().mode;
    const subscriptions = await query(`SELECT subscription_id, paypal_subscription_id, paypal_plan_id, subscription_status,
      environment, amount, currency, started_at, last_payment_at, next_billing_at, payment_failure_at, cancelled_at, created_at,
      approval_url FROM customer_subscriptions WHERE customer_id=:customer AND environment=:environment ORDER BY created_at DESC`,
    { customer: positiveId(customer), environment });
    const payments = await query(`SELECT p.payment_id, p.subscription_id, p.amount, p.currency, p.payment_status, p.paid_at
      FROM subscription_payments p JOIN customer_subscriptions s ON s.subscription_id=p.subscription_id
      WHERE s.customer_id=:customer AND s.environment=:environment ORDER BY p.created_at DESC LIMIT 100`,
    { customer: positiveId(customer), environment });
    return { subscriptions, payments };
  }
  async function create(customer, interval = 'monthly', returnOrigin) {
    const customerId = positiveId(customer);
    const currentPlan = await plan(interval);
    let origin;
    try { origin = new URL(env.FRONTEND_URL || 'http://127.0.0.1:5173'); } catch { throw paypalError('PAYPAL_RETURN_URL_INVALID', 'Storefront URL is not configured correctly.'); }
    if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password ||
        (currentPlan.environment === 'live' && origin.protocol !== 'https:')) {
      throw paypalError('PAYPAL_RETURN_URL_INVALID', 'Storefront URL is not configured correctly.');
    }
    if (returnOrigin) {
      const allowed = [origin.origin, ...(currentPlan.environment === 'sandbox' ? ['http://127.0.0.1:5173', 'http://localhost:5173'] : [])];
      if (!allowed.includes(returnOrigin)) throw paypalError('PAYPAL_RETURN_URL_INVALID', 'Unexpected storefront return URL.', 400);
      origin = new URL(returnOrigin);
    }
    const row = await db.transaction(async transaction => {
      await query('SELECT pg_advisory_xact_lock(71391, :customer)', { customer: customerId }, transaction);
      const existing = await query(`SELECT * FROM customer_subscriptions WHERE customer_id=:customer
        AND environment=:environment AND subscription_status IN ('approval_pending','approved','active','suspended') FOR UPDATE`,
      { customer: customerId, environment: currentPlan.environment }, transaction);
      if (existing.length) return existing[0];
      const inserted = await query(`INSERT INTO customer_subscriptions
        (customer_id, environment, paypal_plan_id, subscription_type, amount, currency, request_id)
        VALUES (:customer,:environment,:plan,'membership',:amount,:currency,:request) RETURNING *`,
      { customer: customerId, environment: currentPlan.environment, plan: currentPlan.id,
        amount: currentPlan.amount, currency: currentPlan.currency, request: randomUUID() }, transaction);
      return inserted[0];
    });
    if (row.subscription_status !== 'approval_pending') throw paypalError('SUBSCRIPTION_EXISTS', 'You already have a subscription. Manage it below.', 409);
    if (row.paypal_subscription_id && row.approval_url) return { subscription_id: row.subscription_id, approval_url: approvalURL(row.approval_url, row.environment) };
    if (row.paypal_plan_id !== currentPlan.id) throw paypalError('SUBSCRIPTION_PLAN_CHANGED', 'Cancel the previous pending subscription before starting the new plan.', 409);
    const returnURL = new URL('/subscriptions', origin.origin);
    returnURL.searchParams.set('subscription', row.subscription_id);
    returnURL.searchParams.set('approval', 'returned');
    const cancelURL = new URL('/subscriptions', origin.origin);
    cancelURL.searchParams.set('approval', 'cancelled');
    const result = await paypal.request('POST', '/v1/billing/subscriptions', {
      plan_id: row.paypal_plan_id, custom_id: `medsense:${row.subscription_id}:${customerId}`,
      application_context: { brand_name: 'MedSenseAI', shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW',
        return_url: returnURL.href, cancel_url: cancelURL.href },
    }, row.request_id);
    if (typeof result.id !== 'string' || !/^I-[A-Z0-9]+$/.test(result.id)) throw paypalError('PAYPAL_SUBSCRIPTION_INVALID', 'PayPal did not provide a valid subscription.', 502);
    const url = approvalURL(result.links?.find(link => link.rel === 'approve')?.href, row.environment);
    const updated = await query(`UPDATE customer_subscriptions SET paypal_subscription_id=:paypal, approval_url=:url,
      updated_at=NOW() WHERE subscription_id=:id AND subscription_status='approval_pending' RETURNING subscription_id`,
    { paypal: result.id, url, id: row.subscription_id });
    if (!updated.length) throw paypalError('SUBSCRIPTION_CHANGED', 'Subscription changed. Refresh your subscription status.', 409);
    return { subscription_id: row.subscription_id, approval_url: url };
  }
  async function recordPayment(row, payment, transaction, paymentStatus = 'completed') {
    const value = validPayment(payment);
    if (value.currency !== row.currency) throw paypalError('PAYPAL_PAYMENT_CURRENCY_MISMATCH', 'Payment currency does not match the subscription.', 409);
    // Refunds can arrive before their completion event. Consult the verified event ledger.
    const previousRefunds = await query(`SELECT event_type,event_payload FROM paypal_webhook_events
      WHERE environment=:environment AND signature_verified=TRUE AND is_simulated=FALSE
      AND event_type IN ('PAYMENT.SALE.REFUNDED','PAYMENT.SALE.REVERSED')`, { environment: row.environment }, transaction);
    for (const event of previousRefunds) {
      if (refundSaleId({ event_type: event.event_type, resource: event.event_payload?.resource }) === value.id) {
        paymentStatus = event.event_type.endsWith('REVERSED') ? 'reversed' : (paymentStatus === 'reversed' ? paymentStatus : 'refunded');
      }
    }
    const inserted = await query(`INSERT INTO subscription_payments
      (subscription_id, environment, paypal_payment_id, amount, currency, payment_status, paid_at)
      VALUES (:subscription,:environment,:payment,:amount,:currency,:status,:paid)
      ON CONFLICT (environment,paypal_payment_id) DO UPDATE SET
        payment_status=CASE WHEN subscription_payments.payment_status='reversed' THEN 'reversed'
          WHEN EXCLUDED.payment_status IN ('refunded','reversed') THEN EXCLUDED.payment_status ELSE subscription_payments.payment_status END,
        updated_at=NOW()
      WHERE subscription_payments.subscription_id=EXCLUDED.subscription_id
      RETURNING payment_id,payment_status`,
    { subscription: row.subscription_id, environment: row.environment, payment: value.id, amount: value.amount, currency: value.currency, paid: value.paid, status: paymentStatus }, transaction);
    // Duplicate delivery cannot overwrite a later refund or reverse its status.
    if (inserted[0]?.payment_status === 'completed') await query(`UPDATE customer_subscriptions SET
      last_payment_at=GREATEST(last_payment_at,CAST(:paid AS timestamptz)),
      payment_failure_at=CASE WHEN CAST(:paid AS timestamptz) >= payment_failure_at THEN NULL ELSE payment_failure_at END,
      updated_at=NOW() WHERE subscription_id=:subscription`,
    { paid: value.paid, subscription: row.subscription_id }, transaction);
  }
  async function refresh(customer, id) {
    const row = await owned(customer, id);
    if (!row.paypal_subscription_id) return { subscription_status: row.subscription_status };
    const details = await paypal.request('GET', `/v1/billing/subscriptions/${encodeURIComponent(row.paypal_subscription_id)}`);
    const state = detailsFor(row, details);
    const end = new Date().toISOString();
    const start = new Date(Date.now() - 30 * 86400000).toISOString();
    const transactions = ['approval_pending','approved'].includes(state.status) ? { transactions: [] } :
      await paypal.request('GET', `/v1/billing/subscriptions/${encodeURIComponent(row.paypal_subscription_id)}/transactions?start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`);
    await db.transaction(async transaction => {
      await query('SELECT subscription_id FROM customer_subscriptions WHERE subscription_id=:id FOR UPDATE', { id: row.subscription_id }, transaction);
      await query(`UPDATE customer_subscriptions SET subscription_status=CASE WHEN subscription_status IN ('cancelled','expired')
          THEN subscription_status ELSE :status END, started_at=COALESCE(:started,started_at),
        next_billing_at=CASE WHEN subscription_status IN ('cancelled','expired') THEN NULL ELSE CAST(:next AS timestamptz) END,
        payment_failure_at=CASE WHEN :failed > 0 THEN COALESCE(payment_failure_at,NOW()) ELSE payment_failure_at END,
        cancelled_at=CASE WHEN :status = 'cancelled' THEN COALESCE(cancelled_at,NOW()) ELSE cancelled_at END,
        updated_at=NOW() WHERE subscription_id=:id`, { ...state, id: row.subscription_id }, transaction);
      for (const payment of transactions.transactions || []) {
        const status = { COMPLETED: 'completed', REFUNDED: 'refunded', PARTIALLY_REFUNDED: 'refunded' }[payment.status];
        if (status) await recordPayment(row, payment, transaction, status);
      }
    });
    return { subscription_status: state.status };
  }
  async function cancel(customer, id) {
    const row = await owned(customer, id);
    if (['cancelled','expired'].includes(row.subscription_status)) return { subscription_status: row.subscription_status };
    if (row.paypal_subscription_id) {
      const details = await paypal.request('GET', `/v1/billing/subscriptions/${encodeURIComponent(row.paypal_subscription_id)}`);
      const state = detailsFor(row, details);
      if (!['cancelled','expired'].includes(state.status)) {
        await paypal.request('POST', `/v1/billing/subscriptions/${encodeURIComponent(row.paypal_subscription_id)}/cancel`, { reason: 'Cancelled by the customer in MedSenseAI' });
      }
    }
    await query(`UPDATE customer_subscriptions SET subscription_status='cancelled', approval_url=NULL,
      cancelled_at=NOW(), updated_at=NOW() WHERE subscription_id=:id`, { id: row.subscription_id });
    return { subscription_status: 'cancelled' };
  }
  async function attachReminder(customer, id, reminderId, days) {
    const row = await owned(customer, id);
    const interval = Number(days);
    if (!Number.isInteger(interval) || interval < 1 || interval > 365) throw paypalError('REFILL_INTERVAL_INVALID', 'Choose a repeat interval between 1 and 365 days.', 400);
    const paid = await query(`SELECT payment_id FROM subscription_payments
      WHERE subscription_id=:subscription AND environment=:environment AND payment_status='completed' LIMIT 1`,
    { subscription: row.subscription_id, environment: row.environment });
    if (row.subscription_status !== 'active' || row.payment_failure_at || !paid.length) throw paypalError('SUBSCRIPTION_NOT_PAID', 'An active subscription with a verified payment is required for recurring reminders.', 409);
    const result = await query(`UPDATE customer_refill_reminders SET subscription_id=:subscription,
      recurrence_days=:days, updated_at=NOW() WHERE reminder_id=:reminder AND customer_id=:customer
      AND lifecycle_status='active' RETURNING reminder_id`,
    { subscription: row.subscription_id, days: interval, reminder: positiveId(reminderId), customer: positiveId(customer) });
    if (!result.length) throw paypalError('REFILL_NOT_FOUND', 'Active refill reminder not found.', 404);
    return { reminder_id: result[0].reminder_id, recurrence_days: interval };
  }
  async function detachReminder(customer, reminderId) {
    const rows = await query(`UPDATE customer_refill_reminders SET subscription_id=NULL, recurrence_days=NULL,
      updated_at=NOW() WHERE reminder_id=:reminder AND customer_id=:customer AND lifecycle_status='active' RETURNING reminder_id`,
    { customer: positiveId(customer), reminder: positiveId(reminderId) });
    if (!rows.length) throw paypalError('REFILL_NOT_FOUND', 'Active refill reminder not found.', 404);
    return { reminder_id: rows[0].reminder_id };
  }
  async function completeRecurringReminder(customer, reminderId) {
    return db.transaction(async transaction => {
      const rows = await query(`SELECT r.*, s.subscription_status, s.environment, s.payment_failure_at FROM customer_refill_reminders r
        JOIN customer_subscriptions s ON s.subscription_id=r.subscription_id AND s.customer_id=r.customer_id
        WHERE r.reminder_id=:reminder AND r.customer_id=:customer AND r.recurrence_days IS NOT NULL FOR UPDATE OF r,s`,
      { reminder: positiveId(reminderId), customer: positiveId(customer) }, transaction);
      if (!rows.length) return null;
      const row = rows[0];
      if (row.lifecycle_status !== 'active') throw paypalError('REFILL_NOT_ACTIVE', 'Only an active refill reminder can be changed.', 409);
      await query(`UPDATE customer_refill_reminders SET lifecycle_status='completed', updated_at=NOW()
        WHERE reminder_id=:reminder RETURNING reminder_id`, { reminder: row.reminder_id }, transaction);
      if (row.subscription_status === 'active' && !row.payment_failure_at && row.environment === paypal.config().mode) {
        // The interval is chosen by the customer, never inferred from doses or purchase quantity.
        await query(`INSERT INTO customer_refill_reminders
          (customer_id,source_invoice_id,product_id,reminder_date,subscription_id,recurrence_days,previous_reminder_id)
          SELECT :customer,:invoice,:product,GREATEST(CURRENT_DATE,CAST(:date AS date)) + CAST(:days AS integer),:subscription,:days,:previous
          WHERE EXISTS (SELECT 1 FROM subscription_payments WHERE subscription_id=:subscription AND payment_status='completed')
          AND EXISTS (SELECT 1 FROM invoice i JOIN invoice_report ir ON ir.invoice_id=i.invoice_id
            WHERE i.invoice_id=:invoice AND i.customer_id=:customer AND ir.product_id=:product
            AND COALESCE(i.status,1)=1 AND COALESCE(ir.status,1)=1
            AND LOWER(COALESCE(i.delivery_status,'')) IN ('delivered','returned')
            GROUP BY i.invoice_id HAVING SUM(COALESCE(ir.quantity,0))>0)
          ON CONFLICT DO NOTHING RETURNING reminder_id`,
        { customer: row.customer_id, invoice: row.source_invoice_id, product: row.product_id, date: row.reminder_date,
          days: row.recurrence_days, subscription: row.subscription_id, previous: row.reminder_id }, transaction);
      }
      return row.reminder_id;
    });
  }
  async function webhook(headers, event) {
    paypal.config({ webhook: true });
    if (!event || typeof event.id !== 'string' || event.id.length > 100 || typeof event.event_type !== 'string' || event.event_type.length > 100) {
      throw paypalError('PAYPAL_EVENT_INVALID', 'Invalid PayPal event.', 400);
    }
    if (!await paypal.verifyWebhook(headers, event)) throw paypalError('PAYPAL_SIGNATURE_INVALID', 'PayPal webhook signature could not be verified.', 400);
    const environment = paypal.config().mode;
    const subscriptionId = event.resource?.billing_agreement_id || (event.event_type.startsWith('BILLING.SUBSCRIPTION.') ? event.resource?.id : null);
    const rows = subscriptionId ? await query(`SELECT * FROM customer_subscriptions
      WHERE paypal_subscription_id=:id AND environment=:environment`, { id: subscriptionId, environment }) : [];
    let row = rows[0];
    const refund = ['PAYMENT.SALE.REFUNDED','PAYMENT.SALE.REVERSED'].includes(event.event_type);
    const saleId = refund ? refundSaleId(event) : event.resource?.id;
    if (!row && refund && saleId) {
      const matches = await query(`SELECT s.* FROM customer_subscriptions s JOIN subscription_payments p
        ON p.subscription_id=s.subscription_id WHERE p.paypal_payment_id=:sale AND p.environment=:environment`, { sale: saleId, environment });
      row = matches[0];
    }
    const details = row ? await paypal.request('GET', `/v1/billing/subscriptions/${encodeURIComponent(row.paypal_subscription_id)}`) : null;
    const state = row ? detailsFor(row, details) : null;
    await db.transaction(async transaction => {
      const inserted = await query(`INSERT INTO paypal_webhook_events
        (environment,paypal_event_id,event_type,subscription_id,signature_verified,event_payload)
        VALUES (:environment,:event,:type,:subscription,TRUE,CAST(:payload AS jsonb))
        ON CONFLICT (environment,paypal_event_id) DO NOTHING RETURNING webhook_event_id`,
      { environment, event: event.id, type: event.event_type, subscription: row?.subscription_id || null, payload: JSON.stringify(event) }, transaction);
      if (!inserted.length) return;
      let processed = false;
      if (row) {
        await query('SELECT subscription_id FROM customer_subscriptions WHERE subscription_id=:id FOR UPDATE', { id: row.subscription_id }, transaction);
        await query(`UPDATE customer_subscriptions SET subscription_status=CASE WHEN subscription_status IN ('cancelled','expired')
            THEN subscription_status ELSE :status END,
          started_at=COALESCE(:started,started_at), next_billing_at=CASE WHEN subscription_status IN ('cancelled','expired') THEN NULL ELSE CAST(:next AS timestamptz) END,
          payment_failure_at=CASE WHEN :failed > 0 THEN COALESCE(payment_failure_at,NOW()) ELSE payment_failure_at END,
          cancelled_at=CASE WHEN :status = 'cancelled' THEN COALESCE(cancelled_at,NOW()) ELSE cancelled_at END,
          updated_at=NOW() WHERE subscription_id=:id`, { ...state, id: row.subscription_id }, transaction);
        if (event.event_type === 'PAYMENT.SALE.COMPLETED') {
          if (event.resource?.state !== 'completed') throw paypalError('PAYPAL_PAYMENT_INVALID', 'Payment is not completed.', 400);
          await recordPayment(row, event.resource, transaction);
          processed = true;
        } else if (refund) {
          await query(`UPDATE subscription_payments SET payment_status=:status,updated_at=NOW()
            WHERE subscription_id=:subscription AND environment=:environment AND paypal_payment_id=:sale RETURNING payment_id`,
          { status: event.event_type.endsWith('REFUNDED') ? 'refunded' : 'reversed', subscription: row.subscription_id, environment, sale: saleId }, transaction);
          processed = true;
        } else if (event.event_type.startsWith('BILLING.SUBSCRIPTION.')) {
          if (event.event_type === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED' && state.failed > 0) {
            await query(`UPDATE customer_subscriptions SET payment_failure_at=COALESCE(payment_failure_at,NOW()) WHERE subscription_id=:id`, { id: row.subscription_id }, transaction);
          }
          processed = true;
        }
      }
      await query(`UPDATE paypal_webhook_events SET processing_status=:status,processed_at=NOW()
        WHERE webhook_event_id=:id`, { status: processed ? 'processed' : 'ignored', id: inserted[0].webhook_event_id }, transaction);
    });
    return { received: true };
  }
  return { configuration, list, create, refresh, cancel, attachReminder, detachReminder, completeRecurringReminder, webhook };
}
module.exports = { createSubscriptionService, subscriptionService: createSubscriptionService(), approvalURL, detailsFor, validPayment, refundSaleId };
