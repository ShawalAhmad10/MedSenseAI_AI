import { test, expect } from '@playwright/test';
test.use({ channel: 'msedge' });

const staff = { id: 41, role: 'pharmacist', email: 'verification@example.test', fullName: 'Verification', status: 'approved' };
const customer = { id: 82, name: 'Verification', email: 'customer@example.test' };
const jwt = payload => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload })).toString('base64url'), 'test'].join('.');
const batch = (id, purchase, sale, stock, active) => ({ id: 'stk-line-' + id, batchId: id, productId: 1,
  name: 'Verification Panadol', batchNumber: 'B00' + id, qty: stock, bonus: 0, totalQty: stock,
  remainingQty: stock, purchasePrice: purchase, salePrice: sale, activeForCustomers: active,
  productExpiry: '2030-12-31', batchStatus: 'ACTIVE' });
const product = { id: 'prod-1', title: 'Verification Panadol', genericName: 'Paracetamol', salt: 'Paracetamol',
  category: 'Analgesics', status: 'active', price: 120, purchasePrice: 100, stockQty: 70,
  packSize: 1, packDescription: 'Tablet', activeBatchId: 2, activeBatchPrice: 130, activeBatchQty: 50,
  activeBatchNumber: 'B002', minThreshold: 5, discount: 0, requiresRx: false };

test('storefront card and cart carry the customer batch price and ID', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/products') && !url.pathname.includes('stock-check')) {
      expect(url.searchParams.get('view')).toBe('storefront');
      return route.fulfill({ json: [{ ...product, price: 130, stockQty: 50 }] });
    }
    if (url.pathname.includes('stock-check')) return route.fulfill({ json: { stockQty: 50, price: 130, batchId: 2 } });
    if (url.pathname === '/api/customer/auth/profile') return route.fulfill({ json: { success: true, data: customer } });
    if (url.pathname.includes('check-ddi')) return route.fulfill({ json: { success: true, data: { checkout_allowed: true, interactions: [] } } });
    return route.fulfill({ json: { success: true, data: [] } });
  });
  await page.addInitScript(({ customer, token }) => localStorage.setItem('medsense_customer_auth', JSON.stringify({ ...customer, token })),
    { customer, token: jwt({ id: customer.id, type: 'customer' }) });
  await page.goto('/category/analgesics');
  const card = page.locator('.sf-product-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByText('PKR 130', { exact: true })).toBeVisible();
  await expect(card.getByText('In stock', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Add to cart' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('medsense_storefront_cart_v3_82') || '[]'))).toMatchObject([{ batchId: 2, price: 130, quantity: 1 }]);
});

test('seller preserves arrival prices and can reduce stock with a recorded correction', async ({ page }) => {
  const old = batch(1, 100, 120, 20, true);
  const newer = batch(2, 110, 130, 50, false);
  const receipts = [{ id: 'STK-1', stockNumber: 'STK-1', mode: 'stock-batch', supplierName: 'Verification Supplier',
    stockPrice: 7500, creationDate: '2026-02-01', createdAt: '2026-02-01T12:00:00Z', items: [old, newer] }];
  let edited = false;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/\/$/, '');
    if (path === '/api/auth/pharmacist/me') return route.fulfill({ json: { success: true, data: staff } });
    if (path === '/api/products') return route.fulfill({ json: [product] });
    if (path === '/api/brand' || path === '/api/suppliers') return route.fulfill({ json: [] });
    if (path === '/api/stock/batch') return route.fulfill({ json: { success: true, data: receipts } });
    if (path === '/api/stock/batch-items/1/stock') {
      expect(route.request().method()).toBe('PATCH');
      expect(route.request().postDataJSON()).toEqual({ productId: 1, stock: 19 });
      expect(route.request().headers().authorization).toMatch(/^Bearer /);
      old.remainingQty = 19; edited = true;
      return route.fulfill({ json: { success: true, data: { batchId: 1, stock: 19 } } });
    }
    return route.fulfill({ json: { success: true, data: [] } });
  });
  await page.addInitScript(({ staff, token }) => sessionStorage.setItem('medsense_auth_user', JSON.stringify({ ...staff, token })),
    { staff, token: jwt({ id: staff.id, role: 'pharmacist' }) });
  await page.goto('/pharmacist/dashboard/inventory');
  await page.getByRole('button', { name: 'Stock Batches', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add New Batch' })).toBeVisible();
  await page.getByRole('button', { name: 'View Batches', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'B001' });
  await expect(row.getByRole('button', { name: 'Edit Sale Price', exact: true })).toHaveCount(0);
  await row.getByRole('button', { name: 'Edit Stock', exact: true }).click();
  await page.getByRole('spinbutton').fill('19');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => edited).toBe(true);
  await expect(row.getByText('PKR 120', { exact: true })).toBeVisible();
  const newRow = page.getByRole('row').filter({ hasText: 'B002' });
  await expect(newRow.getByText('PKR 130', { exact: true })).toBeVisible();
  await expect(row.getByText('Active for Customers')).toBeVisible();
  await expect(row.getByText('PKR 100', { exact: true })).toBeVisible();
});
