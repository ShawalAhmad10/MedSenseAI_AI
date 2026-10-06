import { test, expect } from '@playwright/test';
import { MEDICINE_CATEGORIES } from '../src/constants/categories.js';

test.use({ channel: 'msedge' });

const products = [
  { id: 'prod-1', title: 'Catalogue NSAID', category: 'NSAID / Painkiller', status: 'inactive', stockQty: 0, price: 10 },
  { id: 'prod-2', title: 'Catalogue Cold & Flu', category: 'Cold & Flu', status: 'inactive', stockQty: 0, price: 20 },
  { id: 'prod-3', title: 'Catalogue Other', category: 'Other', status: 'inactive', stockQty: 0, price: 30 },
];

async function apiFixture(page, productList = []) {
  const customer = { id: 82, name: 'Catalogue verification', email: 'catalogue@example.test', phone: '03000000000' };
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ id: 82, type: 'customer', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test'].join('.');
  await page.addInitScript(({ customer, token }) => {
    localStorage.setItem('medsense_customer_auth', JSON.stringify({ ...customer, token }));
  }, { customer, token });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path === '/api/customer/auth/profile') {
      return route.fulfill({ json: { success: true, data: customer } });
    }
    if (path === '/api/products/categories') {
      return route.fulfill({ json: { success: true, data: { categories: MEDICINE_CATEGORIES } } });
    }
    if (path === '/api/products' || path === '/api/brand' || path === '/api/suppliers') {
      return route.fulfill({ json: path === '/api/products' ? productList : [] });
    }
    if (path === '/api/auth/pharmacist/me') {
      return route.fulfill({ json: { success: true, data: { id: 41, role: 'pharmacist', status: 'approved', fullName: 'Catalogue verification' } } });
    }
    return route.fulfill({ json: { success: true, data: [] } });
  });
}

test('all category masters remain visible without products and old category links are removed', async ({ page }) => {
  await apiFixture(page);
  await page.goto('/search');
  const nav = page.getByRole('navigation', { name: 'Store categories' });
  await expect(nav.getByRole('link')).toHaveCount(36);
  await expect(nav.getByRole('link', { name: 'NSAID / Painkiller', exact: true })).toHaveAttribute('href', '/category/nsaid-painkiller');
  await expect(nav.getByRole('link', { name: 'Cold & Flu', exact: true })).toHaveAttribute('href', '/category/cold-flu');
  await expect(nav.getByRole('link', { name: 'Other', exact: true })).toHaveAttribute('href', '/category/other');
  await expect(page.getByText('No products matched this category or search.')).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Analgesics', exact: true })).toHaveCount(0);
  await expect(page.locator('footer').getByRole('link', { name: 'Analgesic', exact: true })).toHaveAttribute('href', '/category/analgesic');
  await expect(page.locator('footer').getByRole('link', { name: 'Gastrointestinal', exact: true })).toHaveAttribute('href', '/category/gastrointestinal');
});

test('category names containing slash or ampersand navigate and filter correctly', async ({ page }) => {
  await apiFixture(page, products);
  await page.goto('/search');
  const nav = page.getByRole('navigation', { name: 'Store categories' });
  await nav.getByRole('link', { name: 'NSAID / Painkiller', exact: true }).click();
  await expect(page).toHaveURL(/\/category\/nsaid-painkiller$/);
  await expect(page.getByRole('heading', { name: 'NSAID / Painkiller', exact: true })).toBeVisible();
  await expect(page.locator('.sf-product-card')).toHaveCount(1);
  await expect(page.locator('.sf-product-card').getByText('Catalogue NSAID', { exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Cold & Flu', exact: true }).click();
  await expect(page).toHaveURL(/\/category\/cold-flu$/);
  await expect(page.getByRole('heading', { name: 'Cold & Flu', exact: true })).toBeVisible();
  await expect(page.locator('.sf-product-card')).toHaveCount(1);
  await expect(page.locator('.sf-product-card').getByText('Catalogue Cold & Flu', { exact: true })).toBeVisible();
  await expect(page.locator('.sf-product-card').getByRole('button', { name: 'Out of stock' })).toBeDisabled();
  await nav.getByRole('link', { name: 'Other', exact: true }).click();
  await expect(page).toHaveURL(/\/category\/other$/);
  await expect(page.getByRole('heading', { name: 'Other', exact: true })).toBeVisible();
  await expect(page.locator('.sf-product-card')).toHaveCount(1);
  await expect(page.locator('.sf-product-card').getByText('Catalogue Other', { exact: true })).toBeVisible();
});

test('pharmacist product editor selects new categories and rejects old category options', async ({ page }) => {
  await apiFixture(page);
  const staff = { id: 41, role: 'pharmacist', status: 'approved', fullName: 'Catalogue verification' };
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ id: 41, role: 'pharmacist', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test'].join('.');
  await page.addInitScript(({ staff, token }) => {
    sessionStorage.setItem('medsense_auth_user', JSON.stringify({ ...staff, token }));
  }, { staff, token });
  await page.goto('/pharmacist/dashboard/products');
  await page.getByRole('button', { name: 'Add Product', exact: true }).click();
  const category = page.getByPlaceholder('Type to search category...');
  await category.fill('Analgesic');
  await expect(page.locator('.autocomplete-item')).toHaveText(['Analgesic / Antipyretic', 'Analgesic']);
  await page.locator('.autocomplete-item').getByText('Analgesic / Antipyretic', { exact: true }).click();
  await expect(category).toHaveValue('Analgesic / Antipyretic');
  await category.fill('Topical');
  await expect(page.getByText('No category found', { exact: true })).toBeVisible();
  await category.fill('Other');
  await page.locator('.autocomplete-item').getByText('Other', { exact: true }).click();
  await expect(category).toHaveValue('Other');
});

test('stock intake uses saved supplier IDs and only that supplier medicines', async ({ page }) => {
  const staff = { id: 41, role: 'pharmacist', status: 'approved', fullName: 'Catalogue verification' };
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ id: 41, role: 'pharmacist', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test'].join('.');
  const suppliers = [
    { id: 'sup-21', name: 'MedSenseAI_Traders', status: 'active' },
    { id: 'sup-22', name: 'Open Market', status: 'active' },
    { id: 'sup-23', name: 'Iman Fatima', status: 'active' },
    { id: 'sup-24', name: 'Amna Rana', status: 'active' },
    { id: 'sup-25', name: 'ShahAlmad', status: 'active' },
  ];
  let saved;
  await page.addInitScript(({ staff, token }) => {
    sessionStorage.setItem('medsense_auth_user', JSON.stringify({ ...staff, token }));
  }, { staff, token });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path === '/api/auth/pharmacist/me') return route.fulfill({ json: { success: true, data: staff } });
    if (path === '/api/products') return route.fulfill({ json: [
      { ...products[0], supplierId: 22, purchasePrice: 5 },
      { ...products[1], supplierId: 21, purchasePrice: 10 },
    ] });
    if (path === '/api/suppliers') return route.fulfill({ json: suppliers });
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
  const select = form.locator('select').first();
  await expect(select.locator('option')).toHaveText(['Select supplier', ...suppliers.map(supplier => supplier.name)]);
  await expect(select.locator('option[value="sup-0"]')).toHaveCount(0);
  await select.selectOption('sup-22');
  const search = form.getByPlaceholder('Type to search product...');
  await search.fill('Catalogue');
  await expect(form.locator('.product-autocomplete-item')).toHaveCount(1);
  await expect(form.locator('.product-autocomplete-item')).toContainText('Catalogue NSAID');
  await form.locator('.product-autocomplete-item').click();
  await select.selectOption('sup-21');
  await expect(search).toHaveValue('');
  await expect(form.getByLabel('Arrival name row 1', { exact: true })).toHaveCount(0);
  await search.fill('Catalogue');
  await expect(form.locator('.product-autocomplete-item')).toContainText('Catalogue Cold & Flu');
  await select.selectOption('sup-22');
  await search.fill('Catalogue');
  await form.locator('.product-autocomplete-item').click();
  const cells = form.locator('tbody tr').first().locator('td');
  await cells.nth(3).locator('input').fill('5');
  await cells.nth(6).locator('input').fill('2030-12-31');
  await cells.nth(8).locator('input').fill('5');
  await cells.nth(9).locator('input').fill('10');
  await form.getByRole('button', { name: 'Save Stock Batch', exact: true }).click();
  await expect.poll(() => saved).toMatchObject({
    supplierId: 22, supplierName: 'Open Market', items: [{ productId: '1', name: 'Catalogue NSAID' }],
  });
});

test('typing after selecting brand or supplier requires a fresh saved selection before submission', async ({ page }) => {
  await apiFixture(page);
  const staff = { id: 41, role: 'pharmacist', status: 'approved', fullName: 'Catalogue verification' };
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ id: 41, role: 'pharmacist', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test'].join('.');
  await page.addInitScript(({ staff, token }) => {
    sessionStorage.setItem('medsense_auth_user', JSON.stringify({ ...staff, token }));
  }, { staff, token });
  const submissions = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path === '/api/brand') {
      return route.fulfill({ json: [{ id: 'brand-101', name: 'GSK Pakistan', status: 'active' }] });
    }
    if (path === '/api/suppliers') {
      return route.fulfill({ json: [{ id: 'sup-102', name: 'MedSenseAI_Traders', status: 'active' }] });
    }
    if (path === '/api/products' && route.request().method() === 'POST') {
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { id: 'prod-999', ...submissions.at(-1) } });
    }
    return route.fallback();
  });
  await page.goto('/pharmacist/dashboard/products');
  await page.getByRole('button', { name: 'Add Product', exact: true }).click();
  await page.getByLabel('Product title').fill('Catalogue selection verification');
  await page.getByPlaceholder('Type to search category...').fill('Analgesic');
  await page.locator('.autocomplete-item').getByText('Analgesic', { exact: true }).click();
  const brand = page.getByPlaceholder('Type to search brand...');
  const supplier = page.getByPlaceholder('Type to search supplier...');
  await brand.fill('GSK');
  await page.locator('.autocomplete-item').getByText('GSK Pakistan', { exact: true }).click();
  await supplier.fill('MedSense');
  await page.locator('.autocomplete-item').getByText('MedSenseAI_Traders', { exact: true }).click();
  await page.getByLabel('Sale Pack Price (PKR)').fill('10');
  await page.getByLabel('Min threshold').fill('1');
  await page.getByLabel('Purchase Price (Per Unit)').fill('5');
  await brand.fill('GSK Pakistan typed without selection');
  await page.getByRole('button', { name: 'Save Product', exact: true }).click();
  await expect(page.getByText('Brand is required', { exact: true })).toBeVisible();
  expect(submissions).toHaveLength(0);
  await brand.fill('GSK');
  await page.locator('.autocomplete-item').getByText('GSK Pakistan', { exact: true }).click();
  await supplier.fill('MedSenseAI_Traders typed without selection');
  await page.getByRole('button', { name: 'Save Product', exact: true }).click();
  await expect(page.getByText('Supplier is required', { exact: true })).toBeVisible();
  expect(submissions).toHaveLength(0);
  await supplier.fill('MedSense');
  await page.locator('.autocomplete-item').getByText('MedSenseAI_Traders', { exact: true }).click();
  await page.getByRole('button', { name: 'Save Product', exact: true }).click();
  await expect.poll(() => submissions).toEqual([
    expect.objectContaining({ brandId: 101, supplierId: 102, title: 'Catalogue selection verification' }),
  ]);
});
