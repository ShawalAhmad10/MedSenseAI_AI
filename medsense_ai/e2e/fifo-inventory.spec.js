import { test, expect } from '@playwright/test';
test.use({ channel: 'msedge' });
const jwt = payload => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload })).toString('base64url'), 'test'].join('.');
const customer = { id: 82, name: 'FIFO verification', email: 'fifo@example.test', phone: '03000000000' };
const fifoBatches = [{ batchId: 1, stockQty: 2, salePrice: 5, name: 'Panadol', available: true },
  { batchId: 2, stockQty: 10, salePrice: 8, name: 'Panadol 500mg', available: true }];
const product = { id: 'prod-1', title: 'Panadol', canonicalTitle: 'Panadol', category: 'Analgesics',
  price: 5, stockQty: 12, status: 'active', activeBatchId: 1, activeBatchPrice: 5,
  activeBatchQty: 2, fifoBatches, batches: fifoBatches, packSize: 1, salt: 'Paracetamol' };

test('cart and checkout display the full mixed FIFO price before order placement', async ({ page }) => {
  await page.addInitScript(({ customer, token }) => {
    localStorage.setItem('medsense_customer_auth', JSON.stringify({ ...customer, token }));
    localStorage.setItem('medsense_storefront_cart_v3_82', JSON.stringify([
      { id: 'prod-1', name: 'Panadol', price: 5, quantity: 3, stockQty: 12 }
    ]));
  }, { customer, token: jwt({ id: 82, type: 'customer' }) });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/customer/auth/profile') return route.fulfill({ json: { success: true, data: customer } });
    if (path === '/api/customer/82') return route.fulfill({ json: { success: true, data: { customer } } });
    if (path === '/api/products') return route.fulfill({ json: [product] });
    if (path.includes('stock-check')) return route.fulfill({ json: {
      stockQty: 12, batchId: 1, price: 5, activeProductId: 1, name: 'Panadol', fifoBatches } });
    if (path.includes('ddi-check')) return route.fulfill({ json: { success: true, data: {
      status: 'CLEAR_WITH_LIMITATIONS', checkout_allowed: true, interactions: [] } } });
    return route.fulfill({ json: { success: true, data: [] } });
  });
  await page.goto('/cart');
  await expect(page.getByText('Price breakdown: 2 × PKR 5.00 + 1 × PKR 8.00', { exact: true })).toBeVisible();
  await expect(page.getByText('PKR 18.00', { exact: true })).toHaveCount(2);
  await page.getByRole('link', { name: 'Secure Checkout', exact: true }).click();
  await expect(page.getByText('2 × PKR 5.00 + 1 × PKR 8.00', { exact: true })).toBeVisible();
  await expect(page.getByText('PKR 18.00', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('2 × PKR 5.00 + 1 × PKR 8.00', { exact: true })).toBeVisible();
});

test('stock intake accepts a new arrival name and price for an existing sold-out medicine', async ({ page }) => {
  const staff = { id: 41, role: 'pharmacist', email: 'fifo-staff@example.test', fullName: 'FIFO Staff', status: 'approved' };
  let saved;
  await page.addInitScript(({ staff, token }) => sessionStorage.setItem('medsense_auth_user', JSON.stringify({ ...staff, token })),
    { staff, token: jwt({ id: 41, role: 'pharmacist' }) });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path === '/api/auth/pharmacist/me') return route.fulfill({ json: { success: true, data: staff } });
    if (path === '/api/products') return route.fulfill({ json: [{ ...product, supplierId: 7, status: 'inactive', stockQty: 0 }] });
    if (path === '/api/suppliers') return route.fulfill({ json: [{ id: 'sup-7', name: 'Open Market', status: 'active' }] });
    if (path === '/api/brand') return route.fulfill({ json: [] });
    if (path === '/api/stock/batch' && route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { success: true, data: { stock_id: 999, items: [] } } });
    }
    return route.fulfill({ json: { success: true, data: [] } });
  });
  await page.goto('/pharmacist/dashboard/inventory');
  await page.getByRole('button', { name: 'Stock Batches', exact: true }).click();
  await page.getByRole('button', { name: 'Add New Batch', exact: true }).click();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save Stock Batch', exact: true }) });
  await form.locator('select').first().selectOption('sup-7');
  await form.getByPlaceholder('Type to search product...').fill('Panadol');
  await form.locator('.product-autocomplete-item').click();
  await form.getByLabel('Arrival name row 1', { exact: true }).fill('Panadol 500mg');
  const cells = form.locator('tbody tr').first().locator('td');
  await cells.nth(3).locator('input').fill('50');
  await cells.nth(6).locator('input').fill('2030-12-31');
  await cells.nth(8).locator('input').fill('6');
  await cells.nth(9).locator('input').fill('8');
  await form.getByRole('button', { name: 'Save Stock Batch', exact: true }).click();
  await expect.poll(() => saved).toMatchObject({ supplierId: 7, supplierName: 'Open Market', items: [
    { productId: '1', name: 'Panadol 500mg', qty: '50', purchasePrice: '6', salePrice: '8' }
  ] });
});

test('product controls activate, deactivate and delete entries with receipt history', async ({ page }) => {
  const staff = { id: 41, role: 'pharmacist', email: 'fifo-staff@example.test', fullName: 'FIFO Staff', status: 'approved' };
  let rows = [{ ...product, batches: [{ batchId: 1, stockQty: 12 }], brandName: 'GSK', supplierName: 'Supplier' }];
  await page.addInitScript(({ staff, token }) => sessionStorage.setItem('medsense_auth_user', JSON.stringify({ ...staff, token })),
    { staff, token: jwt({ id: 41, role: 'pharmacist' }) });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path === '/api/auth/pharmacist/me') return route.fulfill({ json: { success: true, data: staff } });
    if (path === '/api/products') return route.fulfill({ json: rows });
    if (path.endsWith('/toggle-status')) {
      rows[0].status = rows[0].status === 'active' ? 'inactive' : 'active';
      return route.fulfill({ json: rows[0] });
    }
    if (path === '/api/products/prod-1' && route.request().method() === 'DELETE') {
      rows = []; return route.fulfill({ json: { message: 'Product deleted successfully' } });
    }
    if (path === '/api/brand' || path === '/api/suppliers') return route.fulfill({ json: [] });
    return route.fulfill({ json: { success: true, data: [] } });
  });
  await page.goto('/pharmacist/dashboard/products');
  await expect(page.getByRole('button', { name: 'Deactivate product', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Deactivate product', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Activate product', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Activate product', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Deactivate product', exact: true })).toBeEnabled();
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete product', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete product', exact: true })).toHaveCount(0);
});
