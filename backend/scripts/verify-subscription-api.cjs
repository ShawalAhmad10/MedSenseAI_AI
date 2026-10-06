const assert = require('node:assert/strict');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { sequelize } = require('../src/config/database');
const { Customer } = require('../src/models');
(async () => {
  sequelize.options.logging = false;
  try {
    const health = await fetch('http://127.0.0.1:5005/health'); assert.equal(health.status, 200);
    const anonymous = await fetch('http://127.0.0.1:5005/api/subscriptions'); assert.equal(anonymous.status, 401);
    const customers = await Customer.findAll();
    const customer = customers.find(row => row.is_active !== false && row.is_active !== 0 && row.status !== 0);
    assert.ok(customer, 'An active customer is required for read-only API verification');
    const token = jwt.sign({ id: customer.customer_id, type: 'customer' }, process.env.JWT_SECRET, { expiresIn: '2m' });
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const list = await fetch('http://127.0.0.1:5005/api/subscriptions', { headers }); assert.equal(list.status, 200);
    const records = await list.json(); assert.ok(Array.isArray(records.data.subscriptions));
    const config = await fetch('http://127.0.0.1:5005/api/subscriptions/config', { headers }); assert.equal(config.status, 200);
    const settings = (await config.json()).data;
    assert.ok(Array.isArray(settings.plans));
    const refills = await fetch('http://127.0.0.1:5005/api/refills', { headers }); assert.equal(refills.status, 200);
    const nonexistent = await fetch('http://127.0.0.1:5005/api/subscriptions/900001/refresh', { method: 'POST', headers });
    assert.equal(nonexistent.status, 404);
    const forged = await fetch('http://127.0.0.1:5005/api/paypal/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'UNVERIFIED-RUNTIME-CHECK', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-FAKE' } }) });
    assert.equal(forged.status, 400);
    console.log(JSON.stringify({ backend: 'healthy', customerAuthentication: 'PASS', subscriptionList: 'PASS', refillAPI: 'PASS',
      nonexistentSubscription: 'rejected', unsignedWebhook: 'rejected', enabledPayPalPlans: settings.plans.length,
      providerIssues: [...new Set((settings.unavailable || []).map(item => item.code))] }));
    console.log('Read-only checks complete; no real subscription, payment or reminder was created.');
  } finally { await sequelize.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
