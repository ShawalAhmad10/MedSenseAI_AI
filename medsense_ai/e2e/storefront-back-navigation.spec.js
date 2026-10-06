import { test, expect } from '@playwright/test';
test.use({ channel: 'msedge' });

const customer = { id: 82, name: 'Navigation verification', email: 'navigation@example.test', phone: '03000000000' };
const product = { id: 'prod-1', title: 'Panadol verification', category: 'Analgesics', status: 'active',
  price: 130, stockQty: 50, minThreshold: 5, packSize: 10, requiresRx: false,
  activeBatchId: 2, activeBatchPrice: 130, activeBatchQty: 50, discount: 0, salt: 'Paracetamol' };

async function setup(page, requiresRx = false) {
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ id: 82, type: 'customer', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test'].join('.');
  await page.addInitScript(({ customer, token }) => {
    localStorage.setItem('medsense_customer_auth', JSON.stringify({ ...customer, token }));
  }, { customer, token });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/customer/auth/profile') return route.fulfill({ json: { success: true, data: customer } });
    if (path === '/api/customer/82') return route.fulfill({ json: { success: true, data: { customer } } });
    if (path.includes('stock-check')) return route.fulfill({ json: { stockQty: 50, price: 130, batchId: 2 } });
    if (path === '/api/products') return route.fulfill({ json: [{ ...product, requiresRx }] });
    if (path.includes('ddi-check') || path.includes('check-ddi')) return route.fulfill({ json: { success: true, data: { status: 'CLEAR_WITH_LIMITATIONS', checkout_allowed: true, interactions: [] } } });
    return route.fulfill({ json: { success: true, data: [] } });
  });
}

test('product and cart return to the same medicine listing with search and sort preserved', async ({ page }) => {
  await setup(page);
  const listing = '/category/analgesics?q=Panadol&sort=priceHigh';
  await page.goto(listing);
  await page.locator('.sf-product-card').getByRole('link', { name: 'View', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Back to Products' })).toHaveAttribute('href', listing);
  await page.reload();
  await page.getByRole('link', { name: 'Back to Products' }).click();
  await expect(page).toHaveURL(new RegExp('category/analgesics\\?q=Panadol&sort=priceHigh$'));
  await page.goto('/cart');
  await expect(page.getByRole('link', { name: 'Continue Shopping', exact: true })).toHaveAttribute('href', listing);
  await page.getByRole('link', { name: 'Continue Shopping', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('category/analgesics\\?q=Panadol&sort=priceHigh$'));
});

test('prescription upload returns to cart and prescription history returns to upload or account', async ({ page }) => {
  test.setTimeout(60000);
  await setup(page, true);
  await page.goto('/category/analgesics');
  await page.locator('.sf-product-card').getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('medsense_storefront_cart_v3_82') || '[]').length)).toBe(1);
  await page.goto('/cart');
  await page.getByRole('link', { name: 'Upload prescription', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute('href', '/cart');
  await page.reload();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await page.getByRole('link', { name: 'Upload prescription', exact: true }).click();
  await page.getByRole('link', { name: 'Prescription history', exact: true }).click();
  await page.getByRole('link', { name: 'Back to Upload', exact: true }).click();
  await expect(page).toHaveURL(/\/prescription\/upload$/);
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: customer.name, exact: true })).toBeVisible();
  await page.goto('/prescription/history');
  await expect(page.getByRole('link', { name: 'Back to Account', exact: true })).toHaveAttribute('href', '/account');
});

test('checkout first-step buttons return to cart or the original Buy Now product', async ({ page }) => {
  await setup(page);
  await page.goto('/category/analgesics');
  await page.locator('.sf-product-card').getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('medsense_storefront_cart_v3_82') || '[]').length)).toBe(1);
  await page.getByRole('link', { name: 'Proceed to Checkout', exact: true }).click();
  await page.getByRole('link', { name: 'Back to Cart', exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await page.goto('/product/panadol-verification');
  await page.getByRole('button', { name: 'Buy Now', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Back to Product', exact: true })).toHaveAttribute('href', '/product/panadol-verification');
  await page.reload();
  await page.getByRole('link', { name: 'Back to Product', exact: true }).click();
  await expect(page).toHaveURL(/\/product\/panadol-verification$/);
});

test('pharmacist consultation always offers Back to Cart, including an API error', async ({ page }) => {
  await setup(page);
  await page.goto('/consult/pharmacist');
  await expect(page.getByRole('link', { name: 'Back to Cart', exact: true })).toHaveCount(1);
  await page.route('**/api/**consultations**', route => route.fulfill({ status: 500, json: { message: 'Verification unavailable' } }));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('Verification unavailable')).toBeVisible();
  await page.getByRole('link', { name: 'Back to Cart', exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
});
