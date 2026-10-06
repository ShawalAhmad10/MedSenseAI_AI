import { test, expect } from '@playwright/test';
test.use({ channel: 'msedge' });
const staff = { id: 41, role: 'pharmacist', fullName: 'Lead tester', email: 'staff@example.test', status: 'approved' };
const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
  Buffer.from(JSON.stringify({ id: 41, role: 'pharmacist', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test'].join('.');
const result = { success: true, data: { refresh_mode: 'read_only_on_demand', persisted_scores: false,
  leads: [{ customer_id: 1, customer_name: 'Test customer history', order_count: 0,
    scoring: { status: 'insufficient_data', lead_score: null, model_probability: null } }] } };
async function setup(page, { delay = 0, failFirst = false } = {}) {
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('Real lead scoring load failed')) errors.push(message.text());
  });
  await page.addInitScript(({ staff, token }) => localStorage.setItem('medsense_auth_user', JSON.stringify({ ...staff, token })), { staff, token });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/pharmacist/me') return route.fulfill({ json: { success: true, data: staff } });
    if (path === '/api/leads' || path === '/api/leads/recalculate') {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (failFirst && path === '/api/leads') return route.fulfill({ status: 503, json: { message: 'Lead service is temporarily unavailable.' } });
      return route.fulfill({ json: result });
    }
    return route.fulfill({ json: { success: true, data: [] } });
  });
  return errors;
}
test('slow scoring response beyond the old 15s timeout loads without a timeout', async ({ page }) => {
  const errors = await setup(page, { delay: 16000 });
  await page.goto('/pharmacist/dashboard/leads');
  await expect(page.getByText('Test customer history', { exact: true })).toBeVisible({ timeout: 25000 });
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Refresh Analysis' }).click();
  await expect(page.getByRole('button', { name: 'Refresh Analysis' })).toBeVisible({ timeout: 25000 });
  expect(errors).toEqual([]);
});
test('upstream failure stays visible and Refresh recovers', async ({ page }) => {
  await setup(page, { failFirst: true });
  await page.goto('/pharmacist/dashboard/leads');
  await expect(page.getByText('Lead service is temporarily unavailable.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh Analysis' }).click();
  await expect(page.getByText('Test customer history', { exact: true })).toBeVisible();
});
