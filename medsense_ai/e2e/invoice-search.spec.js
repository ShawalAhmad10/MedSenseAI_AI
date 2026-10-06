import { test, expect } from '@playwright/test';
test.use({ channel: 'msedge' });

const staff = { id: 41, role: 'pharmacist', email: 'verification@example.test', fullName: 'Verification', status: 'approved' };
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ id: 41, role: 'pharmacist', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test'].join('.');
const products = [{
  id: 'prod-1', title: 'Panadol verification', salt: 'Paracetamol', brandName: 'Verification Brand',
  category: 'Analgesics', status: 'active', price: 999, stockQty: 25, packSize: 10,
  activeBatchId: 2, activeBatchPrice: 130, activeBatchQty: 5,
  batches: [{ batchId: 2, batchNumber: 'B002', salePrice: 130, stockQty: 5, available: true },
    { batchId: 1, batchNumber: 'B001', salePrice: 120, stockQty: 20, available: true }]
}, {
  id: 'prod-3', title: 'Out of stock medicine', salt: 'Unavailable', status: 'active',
  price: 50, stockQty: 0, activeBatchQty: 0, activeBatchId: null, packSize: 1
}];

async function openInvoice(page) {
  let submitted;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path === '/api/auth/pharmacist/me') return route.fulfill({ json: { success: true, data: staff } });
    if (path === '/api/products') return route.fulfill({ json: products });
    if (path === '/api/invoice' && route.request().method() === 'POST') {
      submitted = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { success: true, data: { invoice_id: 999 } } });
    }
    return route.fulfill({ json: { success: true, data: [] } });
  });
  await page.addInitScript(({ staff, token }) =>
    sessionStorage.setItem('medsense_auth_user', JSON.stringify({ ...staff, token })), { staff, token });
  await page.goto('/pharmacist/dashboard/orders');
  await page.getByRole('button', { name: 'Invoices / POS', exact: true }).click();
  await page.getByRole('button', { name: 'New Invoice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create New Invoice' })).toBeVisible();
  return () => submitted;
}

test('search → select → quantity validates stock, merges repeated items and submits exact batch price', async ({ page }) => {
  const submitted = await openInvoice(page);
  const search = page.getByLabel('Search Items', { exact: true });
  const results = page.getByRole('table', { name: 'Medicine search results' });
  await search.fill('Paracetamol');
  await expect(results.getByRole('button')).toHaveCount(1);
  await expect(results.getByText('PKR 130', { exact: true })).toBeVisible();
  await expect(results.getByText('25', { exact: true })).toBeVisible();
  await expect(results.getByText('10', { exact: true })).toBeVisible();
  await results.getByRole('button', { name: 'Panadol verification' }).click();
  const quantity = page.getByLabel('Quantity', { exact: true });
  await expect(quantity).toBeFocused();
  await quantity.fill('26');
  await page.getByRole('button', { name: 'Add to Invoice', exact: true }).click();
  await expect(page.getByText('Enter a whole quantity between 1 and 25 for this batch.')).toBeVisible();
  await quantity.fill('2');
  await quantity.press('Enter');
  await expect(quantity).toHaveCount(0);
  const items = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Discount %' }) });
  await expect(items.locator('tbody tr')).toHaveCount(1);
  await expect(items.getByText('PKR 260', { exact: true })).toBeVisible();
  await search.fill('Panadol');
  await results.getByRole('button', { name: 'Panadol verification' }).click();
  await expect(page.getByText('Sale Price: PKR 130 per unit · Available to add: 23')).toBeVisible();
  await quantity.fill('3');
  await page.getByRole('button', { name: 'Add to Invoice', exact: true }).click();
  await expect(items.locator('tbody tr')).toHaveCount(1);
  await expect(items.getByText('PKR 650', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Ahmed Khan').fill('Verification Customer');
  await page.getByRole('button', { name: 'Create Invoice', exact: true }).click();
  await expect.poll(() => submitted()).toMatchObject({
    customerName: 'Verification Customer',
    items: [{ productId: '1', batchId: 2, quantity: 5, unitPrice: 130 }]
  });
});

test('empty search, unavailable medicine, cancel and removing last item keep invoice editable', async ({ page }) => {
  await openInvoice(page);
  const search = page.getByLabel('Search Items', { exact: true });
  const results = page.getByRole('table', { name: 'Medicine search results' });
  await search.fill('no-match-123');
  await expect(results.getByText('No medicines match your search.')).toBeVisible();
  await search.fill('Out of stock');
  await expect(results.getByRole('button', { name: 'Out of stock medicine' })).toBeDisabled();
  await search.fill('Panadol');
  await search.press('Enter');
  await expect(page.getByLabel('Quantity', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel selection' }).click();
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveCount(0);
  await results.getByRole('button', { name: 'Panadol verification' }).click();
  await page.getByLabel('Quantity', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Add to Invoice', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Panadol verification', exact: true }).click();
  await expect(page.getByText('Search and select a medicine above to enter its quantity.')).toBeVisible();
});
