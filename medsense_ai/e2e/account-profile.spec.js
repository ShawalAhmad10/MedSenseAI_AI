import { test, expect } from '@playwright/test';
test.use({ channel: 'msedge' });
const customer = { id: 82, name: 'Account tester', email: 'account@example.test', phone: '03000000000', city: 'Lahore', address: 'Test address' };
const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ id: 82, type: 'customer', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test'].join('.');
async function setup(page, { storage = 'localStorage', fail = false } = {}) {
  let current = { ...customer };
  let updates = 0;
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.addInitScript(({ customer, token, storage }) => {
    window[storage].setItem('medsense_customer_auth', JSON.stringify({ ...customer, token }));
    localStorage.setItem('medsense_auth_user', JSON.stringify({ token: 'wrong-staff-token' }));
  }, { customer, token, storage });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/customer/auth/profile') {
      if (route.request().method() === 'PUT') {
        updates++;
        expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
        if (fail) return route.fulfill({ status: 401, json: { success: false, code: 'TOKEN_EXPIRED', message: 'Token expired.' } });
        current = { ...current, ...route.request().postDataJSON() };
      }
      return route.fulfill({ json: { success: true, data: current } });
    }
    if (path === '/api/customer/auth/account') {
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      return route.fulfill({ json: { success: true, data: { customer: current, account: null, ledgerEntries: [] } } });
    }
    if (/^\/api\/customer\/\d+/.test(path)) throw new Error('Unexpected pharmacist customer-management request');
    if (path === '/api/products') return route.fulfill({ json: [] });
    if (path === '/api/orders/my-orders') return route.fulfill({ json: { success: true, data: { orders: [] } } });
    return route.fulfill({ json: { success: true, data: [] } });
  });
  return { updates: () => updates, dialogs };
}
for (const storage of ['localStorage', 'sessionStorage']) {
  test(`customer profile saves from ${storage} and persists without a popup`, async ({ page }) => {
    const state = await setup(page, { storage });
    await page.goto('/account'); await page.getByRole('button', { name: 'Edit Profile' }).click();
    await page.getByLabel('Full Name', { exact: true }).fill('Updated account name');
    await page.getByLabel('City', { exact: true }).fill('Karachi');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('status')).toHaveText('Profile updated successfully.');
    await expect(page.getByRole('heading', { name: 'Updated account name', exact: true })).toBeVisible();
    expect(state.updates()).toBe(1); expect(state.dialogs).toEqual([]);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Updated account name', exact: true })).toBeVisible();
    await expect(page.getByText('Karachi', { exact: true })).toBeVisible();
  });
}
test('expired session shows an inline error and preserves unsaved form values', async ({ page }) => {
  const state = await setup(page, { fail: true });
  await page.goto('/account'); await page.getByRole('button', { name: 'Edit Profile' }).click();
  await page.getByLabel('Full Name', { exact: true }).fill('Unsaved name');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('alert')).toHaveText('Your session has expired. Please sign in again.');
  await expect(page.getByLabel('Full Name', { exact: true })).toHaveValue('Unsaved name');
  await expect(page.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
  expect(state.dialogs).toEqual([]);
});
