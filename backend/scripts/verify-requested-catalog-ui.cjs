// Read-only verification of the imported catalogue against running APIs and Edge.
// Existing account tokens are held in memory; no credentials or commerce data are saved.
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { chromium, expect } = require('../../medsense_ai/node_modules/@playwright/test');
const { sequelize } = require('../src/config/database');
const { Pharmacist, Customer } = require('../src/models');
const directory = require('../data/requested-business-directory.json');
const categories = require('../data/requested-categories.json');
const { products: originalProducts } = require('../data/requested-products.json');
const { products: additionalProducts } = require('../data/additional-products-101-150.json');
const requestedProducts = [...originalProducts, ...additionalProducts];

const API_BASE = 'http://127.0.0.1:5005/api';
const FRONTEND_BASE = 'http://127.0.0.1:5173';
const check = expect.configure({ timeout: 45000 });
sequelize.options.logging = false;

async function getJSON(url, token) {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(45000),
  });
  assert.equal(response.status, 200, `GET ${new URL(url).pathname} returned HTTP ${response.status}`);
  return response.json();
}

async function catalogueCounts() {
  const rows = await sequelize.query(`SELECT
    (SELECT count(*)::int FROM product) AS products,
    (SELECT count(*)::int FROM stock_history) AS batches,
    (SELECT count(*)::int FROM invoice) AS invoices,
    (SELECT count(*)::int FROM brand) AS brands,
    (SELECT count(*)::int FROM supplier_info) AS suppliers`,
  { type: sequelize.QueryTypes.SELECT });
  return rows[0];
}

function assertProducts(rows) {
  assert.ok(Array.isArray(rows), 'Products API must return an array');
  assert.equal(rows.length, 117, 'Requested inventory contains 117 individual product records');
  const titles = new Set(rows.map(row => row.title));
  assert.equal(titles.size, 117, 'Inventory product titles must match the supplied entries');
  for (const expected of requestedProducts) {
    const actual = rows.find(row => row.title === expected.title);
    assert.ok(actual, `Missing product: ${expected.title}`);
    assert.equal(actual.brandName, expected.brand, `Brand: ${expected.title}`);
    assert.equal(actual.supplierName, expected.supplier, `Supplier: ${expected.title}`);
    assert.equal(actual.salt, expected.salt, `Salt: ${expected.title}`);
    assert.equal(actual.category, expected.category, `Category: ${expected.title}`);
    assert.equal(Number(actual.price), expected.price, `Unit sale price: ${expected.title}`);
    assert.equal(Number(actual.packPrice), expected.packPrice, `Pack sale price: ${expected.title}`);
    assert.equal(Number(actual.packSize), expected.packSize, `Pack size: ${expected.title}`);
    assert.equal(Number(actual.minThreshold), expected.minThreshold, `Threshold: ${expected.title}`);
    assert.equal(Number(actual.discount), expected.discount, `Discount: ${expected.title}`);
    assert.equal(actual.requiresRx, expected.requiresRx, `Prescription flag: ${expected.title}`);
    assert.equal(actual.purchasePrice, null, `No purchase cost was supplied: ${expected.title}`);
    assert.equal(actual.stockQty, 0, `No stock quantity was supplied: ${expected.title}`);
    assert.equal(actual.status, 'inactive', `Zero-stock status: ${expected.title}`);
    assert.ok(Number.isSafeInteger(Number(actual.brandId)) && Number(actual.brandId) > 0);
    assert.ok(Number.isSafeInteger(Number(actual.supplierId)) && Number(actual.supplierId) > 0);
  }
}

async function assertAutocomplete(page, placeholder, names) {
  const input = page.getByPlaceholder(placeholder, { exact: true });
  const options = input.locator('..').locator('.autocomplete-item');
  const observed = new Set();
  for (const prefix of new Set(names.map(name => name[0]))) {
    await input.fill(prefix);
    const expected = names.filter(name => name.toLowerCase().includes(prefix.toLowerCase())).sort();
    await check(options).toHaveCount(expected.length);
    const actual = (await options.allTextContents()).map(name => name.trim()).sort();
    assert.deepEqual(actual, expected, `Saved options for ${placeholder}`);
    actual.forEach(name => observed.add(name));
  }
  assert.deepEqual([...observed].sort(), [...names].sort());
}

async function readOnlyContext(browser, authKey, token, blockedWrites) {
  const context = await browser.newContext();
  await context.addInitScript(({ authKey, token }) => {
    localStorage.setItem(authKey, JSON.stringify({ token }));
  }, { authKey, token });
  // Browsing may emit analytics automatically. Prevent every non-read API request.
  await context.route('**/api/**', route => {
    const request = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue();
    blockedWrites.push({ method: request.method(), path: new URL(request.url()).pathname });
    return route.abort('blockedbyclient');
  });
  return context;
}

(async () => {
  let browser;
  try {
    assert.equal(originalProducts.length, 67);
    assert.equal(additionalProducts.length, 50);
    assert.equal(requestedProducts.length, 117);
    assert.equal(categories.length, 35);
    const before = await catalogueCounts();
    assert.equal(before.products, 117);
    assert.equal(before.batches, 0);
    const staff = (await Pharmacist.findAll({
      attributes: ['id', 'role', 'isActive', 'isApproved', 'isEmailVerified'],
    })).find(row => row.role === 'pharmacist' && row.isActive && row.isApproved && row.isEmailVerified);
    const customer = (await Customer.findAll({
      attributes: ['customer_id', 'is_active', 'status'],
    })).find(row => row.is_active && row.status !== 0);
    assert.ok(staff, 'An approved active pharmacist is required for UI verification');
    assert.ok(customer, 'An active customer is required for storefront verification');
    const staffToken = jwt.sign({ id: staff.id, role: staff.role }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const customerToken = jwt.sign({ id: customer.customer_id, type: 'customer' }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const [apiProducts, proxyProducts, brandRows, supplierRows, categoryResponse, storefrontProducts] = await Promise.all([
      getJSON(`${API_BASE}/products`, staffToken),
      getJSON(`${FRONTEND_BASE}/api/products`, staffToken),
      getJSON(`${API_BASE}/brand`, staffToken),
      getJSON(`${API_BASE}/suppliers`, staffToken),
      getJSON(`${API_BASE}/products/categories`),
      getJSON(`${API_BASE}/products?view=storefront`),
    ]);
    assertProducts(apiProducts);
    assertProducts(proxyProducts);
    assert.deepEqual(brandRows.map(row => row.name).sort(), [...directory.brands].sort());
    assert.deepEqual(supplierRows.map(row => row.name).sort(), [...directory.suppliers].sort());
    assert.ok([...brandRows, ...supplierRows].every(row => row.status === 'active'));
    assert.deepEqual(categoryResponse.data.categories, categories);
    assert.equal(storefrontProducts.length, 116, 'Piriton names share one FIFO customer card');
    assert.ok(storefrontProducts.every(row => row.stockQty === 0 && row.status === 'inactive'));
    const medicineFamilyIds = storefrontProducts.flatMap(row => row.versionIds);
    assert.equal(medicineFamilyIds.length, 117);
    assert.equal(new Set(medicineFamilyIds).size, 117, 'Every inventory entry belongs to exactly one storefront family');
    assert.equal(storefrontProducts.filter(row => (row.versionIds || []).length === 2).length, 1);
    console.log(JSON.stringify({ check: 'catalogue APIs and frontend proxy', products: 117,
      storefrontFamilies: 116, brands: 20, suppliers: 5, categories: 35, stock: 0, result: 'PASS' }));

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const blockedWrites = [];
    const staffContext = await readOnlyContext(browser, 'medsense_auth_user', staffToken, blockedWrites);
    const staffPage = await staffContext.newPage();
    staffPage.setDefaultTimeout(45000);
    await staffPage.goto(`${FRONTEND_BASE}/pharmacist/dashboard/products`);
    await check(staffPage.getByRole('heading', { name: 'Product Management', exact: true })).toBeVisible();
    await check(staffPage.getByText(/117 total products/)).toBeVisible();
    await staffPage.getByPlaceholder('Search products', { exact: true }).fill('');
    await staffPage.locator('select').filter({ has: staffPage.locator('option[value="all"]') }).selectOption('all');
    const editButtons = staffPage.getByRole('button', { name: 'Edit product', exact: true });
    await check(editButtons).toHaveCount(117);
    const productRows = editButtons.locator('..').locator('..');
    await check(productRows.getByText('inactive', { exact: true })).toHaveCount(117);
    for (const expected of requestedProducts) {
      await check(productRows.filter({ has: staffPage.getByText(expected.title, { exact: true }) })).toHaveCount(1);
    }
    console.log(JSON.stringify({ check: 'Product Management actual table', rows: 117, inactive: 117, result: 'PASS' }));
    await staffPage.getByRole('button', { name: 'Add Product', exact: true }).click();
    await assertAutocomplete(staffPage, 'Type to search category...', categories);
    await assertAutocomplete(staffPage, 'Type to search brand...', directory.brands);
    await assertAutocomplete(staffPage, 'Type to search supplier...', directory.suppliers);
    await staffPage.getByRole('button', { name: 'Cancel', exact: true }).click();
    console.log(JSON.stringify({ check: 'Add Product saved master options', categories: 35, brands: 20,
      suppliers: 5, formSaved: false, result: 'PASS' }));

    const customerContext = await readOnlyContext(browser, 'medsense_customer_auth', customerToken, blockedWrites);
    const customerPage = await customerContext.newPage();
    customerPage.setDefaultTimeout(45000);
    await customerPage.goto(`${FRONTEND_BASE}/search`);
    await check(customerPage.getByRole('heading', { name: 'All Products', exact: true })).toBeVisible();
    const cards = customerPage.locator('.sf-product-card');
    await check(cards).toHaveCount(116);
    await check(cards.getByRole('button', { name: 'Out of stock', exact: true })).toHaveCount(116);
    assert.ok((await cards.getByRole('button', { name: 'Out of stock', exact: true }).evaluateAll(
      buttons => buttons.every(button => button.disabled))));
    for (const product of storefrontProducts) {
      await check(cards.getByText(product.title, { exact: true })).toHaveCount(1);
    }
    const nav = customerPage.getByRole('navigation', { name: 'Store categories' });
    await check(nav.getByRole('link')).toHaveCount(36);
    await nav.getByRole('link', { name: 'NSAID / Painkiller', exact: true }).click();
    await check(customerPage).toHaveURL(/\/category\/nsaid-painkiller$/);
    await check(customerPage.getByRole('heading', { name: 'NSAID / Painkiller', exact: true })).toBeVisible();
    const expectedInCategory = storefrontProducts.filter(row => row.category === 'NSAID / Painkiller');
    assert.ok(expectedInCategory.length > 0);
    await check(cards).toHaveCount(expectedInCategory.length);
    console.log(JSON.stringify({ check: 'customer storefront', allProductCards: 116, allOutOfStock: true,
      punctuationRoute: '/category/nsaid-painkiller', categoryCards: expectedInCategory.length, result: 'PASS' }));
    assert.deepEqual(await catalogueCounts(), before, 'Verification must preserve products, orders and stock');
    console.log(JSON.stringify({ check: 'read-only verification', blockedWriteRequests: blockedWrites.length, result: 'PASS' }));
    console.log('PASS: requested catalogue is loaded in real pharmacist and customer pages; no form was saved.');
  } finally {
    await browser?.close();
    await sequelize.close();
  }
})().catch(error => {
  console.error('Catalogue verification failed:', error.message);
  process.exitCode = 1;
});
