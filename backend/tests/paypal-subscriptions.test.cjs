const test = require('node:test');
const assert = require('node:assert/strict');
const { createPayPalClient } = require('../src/services/paypalClient');
const { createSubscriptionService, approvalURL, detailsFor, validPayment, refundSaleId } = require('../src/services/customerSubscriptionService');
const env = { PAYPAL_MODE: 'sandbox', PAYPAL_CLIENT_ID: 'test-client', PAYPAL_CLIENT_SECRET: 'test-secret',
  PAYPAL_DAILY_PLAN_ID: 'P-DAILY', PAYPAL_WEEKLY_PLAN_ID: 'P-WEEKLY', PAYPAL_MONTHLY_PLAN_ID: 'P-MONTHLY',
  PAYPAL_WEBHOOK_ID: 'WH-TEST', PAYPAL_PUBLIC_URL: 'https://example.test', FRONTEND_URL: 'http://localhost:5173' };
const row = { subscription_id: 7, customer_id: 4, environment: 'sandbox', paypal_subscription_id: 'I-TEST',
  paypal_plan_id: 'P-MONTHLY', subscription_status: 'approval_pending', currency: 'USD', request_id: 'fixed-request' };
const details = status => ({ id: 'I-TEST', plan_id: 'P-MONTHLY', custom_id: 'medsense:7:4', status });
const fakePlan = interval => ({ id: env[`PAYPAL_${interval.toUpperCase()}_PLAN_ID`], name: interval, status: 'ACTIVE',
  billing_cycles: [{ tenure_type: 'REGULAR', frequency: { interval_unit: { daily: 'DAY', weekly: 'WEEK', monthly: 'MONTH' }[interval], interval_count: 1 },
    pricing_scheme: { fixed_price: { value: '1.00', currency_code: 'USD' } } }] });

test('PayPal uses all three existing plan keys and confines API requests to matching mode', () => {
  const client = createPayPalClient({ env });
  for (const interval of ['daily','weekly','monthly']) assert.equal(client.config({ plan: true, interval }).planId, env[`PAYPAL_${interval.toUpperCase()}_PLAN_ID`]);
  assert.throws(() => client.config({ interval: 'attacker' }), { code: 'PAYPAL_INTERVAL_INVALID' });
  assert.throws(() => createPayPalClient({ env: { ...env, PAYPAL_BASE_URL: 'https://evil.test' } }).config(), { code: 'PAYPAL_BASE_URL_INVALID' });
});
test('OAuth token is cached and concurrent requests share one authentication call', async () => {
  let calls = 0;
  const client = createPayPalClient({ env, http: { request: async () => { calls++; return { data: { access_token: 'private-token', expires_in: 3600 } }; } } });
  await Promise.all([client.accessToken(), client.accessToken(), client.accessToken()]);
  assert.equal(calls, 1);
  await client.accessToken(); assert.equal(calls, 1);
});
test('authentication errors do not expose provider request config, secrets or tokens', async () => {
  const client = createPayPalClient({ env, http: { request: async () => { throw { response: { status: 401, data: { error: 'invalid_client', secret: 'test-secret' } }, config: { auth: 'test-secret' } }; } } });
  await assert.rejects(client.accessToken(), error => error.code === 'PAYPAL_AUTH_FAILED' && !JSON.stringify(error).includes('test-secret') && error.providerStatus === 401);
});
test('approval URL validation rejects redirects to unexpected sites or modes', () => {
  assert.equal(approvalURL('https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=I-TEST', 'sandbox').startsWith('https://www.sandbox.paypal.com/'), true);
  for (const url of ['javascript:alert(1)', 'https://evil.test/', 'https://www.paypal.com/', 'https://www.sandbox.paypal.com@evil.test/']) {
    assert.throws(() => approvalURL(url, 'sandbox'), { code: 'PAYPAL_APPROVAL_INVALID' });
  }
});
test('authoritative subscription checks bind PayPal subscription to local customer and plan', () => {
  assert.equal(detailsFor(row, details('ACTIVE')).status, 'active');
  for (const bad of [{ ...details('ACTIVE'), custom_id: 'medsense:7:999' }, { ...details('ACTIVE'), plan_id: 'P-OTHER' }, { ...details('ACTIVE'), id: 'I-OTHER' }]) {
    assert.throws(() => detailsFor(row, bad), { code: 'PAYPAL_SUBSCRIPTION_MISMATCH' });
  }
});
test('payment parsing supports PayPal sale events and transaction reconciliation, rejects invalid amounts', () => {
  assert.equal(validPayment({ id: 'SALE', amount: { total: '1.50', currency: 'USD' }, create_time: '2026-10-02T00:00:00Z' }).amount, '1.50');
  assert.equal(validPayment({ id: 'SALE', gross_amount: { value: '1.50', currency_code: 'USD' }, time: '2026-10-02T00:00:00Z' }).currency, 'USD');
  for (const amount of ['-1','NaN','0','1.001']) assert.throws(() => validPayment({ id: 'SALE', amount: { total: amount, currency: 'USD' }, create_time: '2026-10-02T00:00:00Z' }));
});
test('webhook signature is verified using registered ID and invalid certificate hosts never reach provider', async () => {
  let calls = 0;
  const client = createPayPalClient({ env, http: { request: async options => {
    calls++;
    if (options.url.endsWith('/token')) return { data: { access_token: 'token', expires_in: 3600 } };
    assert.equal(options.data.webhook_id, 'WH-TEST');
    return { data: { verification_status: 'SUCCESS' } };
  } } });
  const headers = { 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-TEST',
    'paypal-transmission-id': 'transmission', 'paypal-transmission-sig': 'signature', 'paypal-transmission-time': '2026-10-02T00:00:00Z' };
  assert.equal(await client.verifyWebhook({ ...headers, 'paypal-cert-url': 'https://evil.test/cert' }, { id: 'event' }), false);
  assert.equal(calls, 0);
  assert.equal(await client.verifyWebhook(headers, { id: 'event' }), true);
  assert.equal(calls, 2);
});
test('public URL alias produces real listener path and rejects localhost and database hosts', () => {
  assert.equal(createPayPalClient({ env }).webhookURL(), 'https://example.test/api/paypal/webhook');
  for (const value of ['http://example.test', 'https://localhost', 'https://ep-example.neon.tech', 'https://example.test/wrong']) {
    assert.throws(() => createPayPalClient({ env: { ...env, PAYPAL_PUBLIC_URL: value } }).webhookURL(), { code: 'PAYPAL_WEBHOOK_URL_INVALID' });
  }
});
test('configuration resolves each plan server-side with correct billing intervals', async () => {
  const client = createPayPalClient({ env });
  const paypal = { config: client.config, request: async (_, path) => fakePlan(path.endsWith('DAILY') ? 'daily' : path.endsWith('WEEKLY') ? 'weekly' : 'monthly') };
  const service = createSubscriptionService({ paypal, env, db: {} });
  const config = await service.configuration();
  assert.equal(config.enabled, true); assert.equal(config.plans.length, 3);
  assert.deepEqual(config.plans.map(plan => plan.interval), ['daily','weekly','monthly']);
});
test('pending approval refresh checks provider identity and never marks it paid or requests transactions', async () => {
  const sql = [], api = [];
  const db = { query: async (query) => { sql.push(query); return query.includes('SELECT * FROM customer_subscriptions') ? [row] : []; }, transaction: work => work({}) };
  const paypal = { config: () => ({ mode: 'sandbox' }), request: async (_, path) => { api.push(path); return details('APPROVAL_PENDING'); } };
  const result = await createSubscriptionService({ db, paypal, env }).refresh(4, 7);
  assert.equal(result.subscription_status, 'approval_pending');
  assert.equal(api.length, 1); assert.ok(!sql.some(value => value.includes('INSERT INTO subscription_payments')));
});
test('subscription creation uses server-selected plan, stable request ID and the current allowed storefront origin', async () => {
  const saved = { ...row, paypal_subscription_id: null, approval_url: null };
  let creationCalls = 0;
  const client = createPayPalClient({ env });
  const db = { transaction: work => work({}), query: async (sql, options) => {
    if (sql.includes('SELECT * FROM customer_subscriptions')) return [{ ...saved }];
    if (sql.includes('UPDATE customer_subscriptions')) {
      saved.paypal_subscription_id = options.replacements.paypal;
      saved.approval_url = options.replacements.url;
      return [{ subscription_id: 7 }];
    }
    return [];
  } };
  const paypal = { config: client.config, request: async (method, path, payload, requestId) => {
    if (method === 'GET') return fakePlan('monthly');
    creationCalls++;
    assert.equal(payload.plan_id, 'P-MONTHLY');
    assert.equal(payload.custom_id, 'medsense:7:4');
    assert.equal(requestId, 'fixed-request');
    assert.equal(new URL(payload.application_context.return_url).origin, 'http://127.0.0.1:5173');
    return { id: 'I-TEST', links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/approve?ba_token=I-TEST' }] };
  } };
  const service = createSubscriptionService({ db, paypal, env });
  const result = await service.create(4, 'monthly', 'http://127.0.0.1:5173');
  assert.equal(result.subscription_id, 7);
  assert.deepEqual(await service.create(4, 'monthly', 'http://127.0.0.1:5173'), result);
  assert.equal(creationCalls, 1);
  await assert.rejects(service.create(4, 'monthly', 'https://evil.test'), { code: 'PAYPAL_RETURN_URL_INVALID' });
});
test('customer cannot refresh another account subscription', async () => {
  let requests = 0;
  const service = createSubscriptionService({ db: { query: async (_, options) => { assert.equal(options.replacements.customer, 99); return []; } },
    paypal: { config: () => ({ mode: 'sandbox' }), request: async () => { requests++; } }, env });
  await assert.rejects(service.refresh(99, 7), { code: 'SUBSCRIPTION_NOT_FOUND' }); assert.equal(requests, 0);
});
test('forged webhooks do not write database records', async () => {
  let writes = 0;
  const service = createSubscriptionService({ db: { query: async () => { writes++; } },
    paypal: { config: () => ({ mode: 'sandbox' }), verifyWebhook: async () => false }, env });
  await assert.rejects(service.webhook({}, { id: 'FAKE', event_type: 'PAYMENT.SALE.COMPLETED' }), { code: 'PAYPAL_SIGNATURE_INVALID' });
  assert.equal(writes, 0);
});
test('recurring reminder requires real completed payment even if last_payment_at exists', async () => {
  let updates = 0;
  const service = createSubscriptionService({ db: { query: async sql => {
    if (sql.includes('SELECT * FROM customer_subscriptions')) return [{ ...row, subscription_status: 'active', last_payment_at: '2026-10-02' }];
    if (sql.includes('UPDATE')) updates++;
    return [];
  } }, paypal: { config: () => ({ mode: 'sandbox' }) }, env });
  await assert.rejects(service.attachReminder(4, 7, 2, 30), { code: 'SUBSCRIPTION_NOT_PAID' }); assert.equal(updates, 0);
});
test('refund linkage uses sale ID rather than the unrelated parent payment ID', () => {
  assert.equal(refundSaleId({ event_type: 'PAYMENT.SALE.REFUNDED', resource: { parent_payment: 'PAY-WRONG', links: [{ rel: 'sale', href: 'https://api.sandbox.paypal.com/v1/payments/sale/SALE123' }] } }), 'SALE123');
  assert.equal(refundSaleId({ event_type: 'PAYMENT.SALE.REFUNDED', resource: { parent_payment: 'PAY-WRONG' } }), null);
});
