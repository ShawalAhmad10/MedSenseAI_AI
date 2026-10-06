require('dotenv').config();
const { paypalClient } = require('../src/services/paypalClient');
(async () => {
  const config = paypalClient.config();
  if (config.mode !== 'sandbox') throw new Error('This read-only diagnostic only runs in Sandbox mode.');
  await paypalClient.accessToken();
  console.log('PASS: Sandbox Client ID and Secret authenticated. Secret not displayed.');
  let configuredPlans = 0;
  for (const interval of ['daily','weekly','monthly']) {
    const planId = paypalClient.config({ interval }).planId;
    if (!planId) continue;
    configuredPlans++;
    const plan = await paypalClient.request('GET', '/v1/billing/plans/' + encodeURIComponent(planId));
    console.log(JSON.stringify({ interval, planStatus: plan.status, cycles: plan.billing_cycles?.map(c => ({ type: c.tenure_type, frequency: c.frequency, price: c.pricing_scheme?.fixed_price })) }));
  }
  if (!configuredPlans) {
    const plans = await paypalClient.request('GET', '/v1/billing/plans?page_size=20');
    console.log(JSON.stringify({ planConfigured: false, availablePlans: (plans.plans || []).map(p => ({ id: p.id, status: p.status, name: p.name })) }));
  }
  console.log('Webhook ID configured: ' + Boolean(process.env.PAYPAL_WEBHOOK_ID?.trim()));
  const listener = paypalClient.webhookURL();
  console.log('Public HTTPS listener configured: ' + Boolean(listener));
  if (process.env.PAYPAL_WEBHOOK_ID?.trim()) {
    const webhook = await paypalClient.request('GET', '/v1/notifications/webhooks/' + encodeURIComponent(process.env.PAYPAL_WEBHOOK_ID.trim()));
    if (!listener || webhook.url !== listener) throw new Error('Registered PayPal webhook URL does not match PAYPAL_PUBLIC_URL.');
    const expected = ['BILLING.SUBSCRIPTION.ACTIVATED','BILLING.SUBSCRIPTION.CANCELLED','BILLING.SUBSCRIPTION.SUSPENDED',
      'BILLING.SUBSCRIPTION.EXPIRED','BILLING.SUBSCRIPTION.PAYMENT.FAILED','PAYMENT.SALE.COMPLETED','PAYMENT.SALE.REFUNDED','PAYMENT.SALE.REVERSED'];
    const events = webhook.event_types?.map(event => event.name) || [];
    if (!events.includes('*') && expected.some(event => !events.includes(event))) throw new Error('Webhook is missing required subscription/payment events.');
    console.log('PASS: Webhook belongs to this app, listener URL matches, required events registered.');
  }
})().catch(error => { console.error(error.code || 'CONFIG_ERROR', error.message);
  if (error.providerStatus) console.error(JSON.stringify({ httpStatus: error.providerStatus, providerCode: error.providerCode }));
  process.exitCode = 1; });
