import { test, expect } from '@playwright/test';
test.use({ channel: 'msedge' });
const customer = { id: 82, name: 'Subscription tester', email: 'subscription@example.test' };
const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
  Buffer.from(JSON.stringify({ id: 82, type: 'customer', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test'].join('.');
const plans = ['daily','weekly','monthly'].map(interval => ({ interval, environment: 'sandbox', id: `P-${interval.toUpperCase()}`,
  amount: '1.00', currency: 'USD', frequency: { interval_unit: { daily: 'DAY', weekly: 'WEEK', monthly: 'MONTH' }[interval], interval_count: 1 },
  cycles: [{ type: 'REGULAR', cycles: 0 }], name: interval }));
async function setup(page, options = {}) {
  await page.addInitScript(({ customer, token }) => localStorage.setItem('medsense_customer_auth', JSON.stringify({ ...customer, token })), { customer, token });
  let subscriptions = options.subscriptions || [];
  let refreshCalls = 0;
  let linkedDays = null;
  let reminder = { reminder_id: 3, product_title: 'Panadol', lifecycle_status: 'active', reminder_date: '2026-11-02', source_invoice_id: 8, product_id: 9, subscription_id: null };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    const method = route.request().method();
    if (path === '/api/customer/auth/profile') return route.fulfill({ json: { success: true, data: customer } });
    if (path === '/api/subscriptions/config') return route.fulfill({ json: { success: true, data: options.disabled ? { enabled: false, plans: [], unavailable: [{ code: 'PAYPAL_AUTH_FAILED', message: 'PayPal credentials could not be verified.' }] } : { enabled: true, plans } } });
    if (path === '/api/subscriptions') return route.fulfill({ json: { success: true, data: { subscriptions, payments: [] } } });
    if (path.endsWith('/refresh')) { refreshCalls++; subscriptions = subscriptions.map(row => ({ ...row, subscription_status: 'active', last_payment_at: '2026-10-02' }));
      return route.fulfill({ json: { success: true, data: { subscription_status: 'active' } } }); }
    if (path.endsWith('/cancel')) { subscriptions = subscriptions.map(row => ({ ...row, subscription_status: 'cancelled' }));
      return route.fulfill({ json: { success: true, data: { subscription_status: 'cancelled' } } }); }
    if (path === '/api/subscriptions/7/refills/3') { linkedDays = route.request().postDataJSON().recurrence_days;
      reminder = { ...reminder, subscription_id: 7, recurrence_days: linkedDays };
      return route.fulfill({ json: { success: true, data: reminder } }); }
    if (path === '/api/refills/sources') return route.fulfill({ json: { success: true, data: { sources: [] } } });
    if (path === '/api/refills') return route.fulfill({ json: { success: true, data: { reminders: [reminder] } } });
    if (path === '/api/products') return route.fulfill({ json: [] });
    return route.fulfill({ json: { success: true, data: [] } });
  });
  return { refreshCalls: () => refreshCalls, linkedDays: () => linkedDays };
}
test('customer sees daily, weekly and monthly Sandbox plans and setup failures remain readable', async ({ page }) => {
  await setup(page); await page.goto('/subscriptions');
  for (const interval of ['daily','weekly','monthly']) await expect(page.getByRole('heading', { name: new RegExp(`${interval} plan`, 'i') })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subscribe with PayPal' })).toHaveCount(3);
  await expect(page.getByText('No verified payments yet.')).toBeVisible();
});
test('return from PayPal verifies on server and cancellation requires explicit click', async ({ page }) => {
  const state = await setup(page, { subscriptions: [{ subscription_id: 7, paypal_subscription_id: 'I-TEST', environment: 'sandbox', amount: '1.00', currency: 'USD', subscription_status: 'approval_pending' }] });
  await page.goto('/subscriptions?approval=returned&subscription=7');
  await expect(page.getByText('Subscription verified with PayPal.')).toBeVisible();
  expect(state.refreshCalls()).toBe(1);
  await page.getByRole('button', { name: 'Cancel subscription', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
  await expect(page.getByText('Subscription cancelled. Future recurring reminders are stopped.')).toBeVisible();
});
test('refill links use customer-chosen repeat days and retain manual reminder page', async ({ page }) => {
  const state = await setup(page, { subscriptions: [{ subscription_id: 7, subscription_status: 'active', last_payment_at: '2026-10-02' }] });
  await page.goto('/refills');
  await page.getByRole('spinbutton', { name: 'Repeat interval in days for Panadol' }).fill('14');
  await page.getByRole('button', { name: 'Enable recurring reminder' }).click();
  await expect(page.getByText('Linked reminder · repeats every 14 days while subscription is active.')).toBeVisible();
  expect(state.linkedDays()).toBe(14);
});
test('invalid provider configuration displays explanation without a payment button', async ({ page }) => {
  await setup(page, { disabled: true }); await page.goto('/subscriptions');
  await expect(page.getByText('PayPal credentials could not be verified.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subscribe with PayPal' })).toHaveCount(0);
});
