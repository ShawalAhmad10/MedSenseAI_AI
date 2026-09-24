import { test, expect } from '@playwright/test';

const pharmacistKey = 'medsense_auth_user';
const customerKey = 'medsense_customer_auth';
const onboardingKey = 'medsense_pharmacist_google_onboarding';
const pharmacistPage = '/pharmacist/dashboard/settings';
const customerPage = '/cart';
const pharmacist = {
  id: 41,
  role: 'pharmacist',
  email: 'real.pharmacist@example.test',
  fullName: 'Real Pharmacist',
  status: 'approved',
};
const customer = {
  id: 82,
  name: 'Real Customer',
  email: 'real.customer@example.test',
  phone: '03000000000',
};

function token(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload })}.test-signature`;
}

const pharmacistJwt = token({ id: pharmacist.id, role: 'pharmacist' });
const customerJwt = token({ id: customer.id, type: 'customer' });
const onboardingJwt = token({ id: pharmacist.id, type: 'pharmacist_onboarding' });
const expiredJwt = token({ id: pharmacist.id, role: 'pharmacist', exp: 1 });

async function seed(page, key, value, store = 'local') {
  await page.goto('/pharmacist/login');
  await page.evaluate(({ key, value, store }) => {
    const storage = store === 'session' ? sessionStorage : localStorage;
    storage.setItem(key, JSON.stringify(value));
  }, { key, value, store });
}

async function stored(page, key, store = 'local') {
  return page.evaluate(({ key, store }) => {
    const raw = (store === 'session' ? sessionStorage : localStorage).getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, { key, store });
}

async function mockApi(page, { pharmacistStatus = 200, customerStatus = 200 } = {}) {
  const calls = { pharmacist: [], customer: [] };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/pharmacist/me') {
      calls.pharmacist.push(request.headers().authorization ?? null);
      await route.fulfill({ status: pharmacistStatus, json: pharmacistStatus === 200
        ? { success: true, data: pharmacist }
        : { success: false, message: 'Forbidden' } });
    } else if (path === '/api/customer/auth/profile') {
      calls.customer.push(request.headers().authorization ?? null);
      await route.fulfill({ status: customerStatus, json: customerStatus === 200
        ? { success: true, data: customer }
        : { success: false, message: 'Forbidden' } });
    } else if (path === '/api/staff') {
      await route.fulfill({ json: { success: true, data: [] } });
    } else {
      await route.fulfill({ json: { success: true, data: {} } });
    }
  });
  return calls;
}

async function expectPharmacistDenied(page) {
  await expect(page).toHaveURL(/\/pharmacist\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome Back!' })).toBeVisible();
  expect(await stored(page, pharmacistKey)).toBeNull();
  expect(await stored(page, pharmacistKey, 'session')).toBeNull();
}

for (const role of ['admin', 'superadmin', 'customer']) {
  test(`edited pharmacist role ${role} is replaced by /me`, async ({ page }) => {
    const calls = await mockApi(page);
    await seed(page, pharmacistKey, { ...pharmacist, role, token: pharmacistJwt, privileged: true });
    await page.goto(pharmacistPage);
    await expect(page).toHaveURL(/\/pharmacist\/dashboard\/settings$/);
    await expect(page.getByText(pharmacist.email).first()).toBeVisible();
    await expect.poll(() => stored(page, pharmacistKey)).toMatchObject(pharmacist);
    expect(await stored(page, pharmacistKey)).not.toHaveProperty('privileged');
    expect(calls.pharmacist).toContain(`Bearer ${pharmacistJwt}`);
  });
}

test('edited pharmacist ID and email are replaced by /me', async ({ page }) => {
  const calls = await mockApi(page);
  await seed(page, pharmacistKey, { ...pharmacist, id: 999, email: 'attacker@example.test', token: pharmacistJwt });
  await page.goto(pharmacistPage);
  await expect(page).toHaveURL(/\/pharmacist\/dashboard\/settings$/);
  await expect(page.getByText(pharmacist.email).first()).toBeVisible();
  await expect.poll(() => stored(page, pharmacistKey)).toMatchObject(pharmacist);
  expect(calls.pharmacist).toContain(`Bearer ${pharmacistJwt}`);
});

test('malformed pharmacist JWT is removed without calling /me', async ({ page }) => {
  const calls = await mockApi(page);
  await seed(page, pharmacistKey, { ...pharmacist, token: 'broken.jwt' });
  await page.goto(pharmacistPage);
  await expectPharmacistDenied(page);
  expect(calls.pharmacist).toHaveLength(0);
});

test('pharmacist auth object missing JWT is removed', async ({ page }) => {
  const calls = await mockApi(page);
  await seed(page, pharmacistKey, { ...pharmacist });
  await page.goto(pharmacistPage);
  await expectPharmacistDenied(page);
  expect(calls.pharmacist).toHaveLength(0);
});

test('customer JWT in pharmacist storage is rejected by /me', async ({ page }) => {
  const calls = await mockApi(page, { pharmacistStatus: 403 });
  await seed(page, pharmacistKey, { ...pharmacist, token: customerJwt });
  await page.goto(pharmacistPage);
  await expectPharmacistDenied(page);
  expect(calls.pharmacist).toContain(`Bearer ${customerJwt}`);
});

test('pharmacist JWT in customer storage is rejected before customer profile', async ({ page }) => {
  const calls = await mockApi(page);
  await seed(page, customerKey, { ...customer, token: pharmacistJwt });
  await page.goto(customerPage);
  await expect(page).toHaveURL(/localhost:5173\/$/);
  expect(await stored(page, customerKey)).toBeNull();
  expect(calls.customer).toHaveLength(0);
  expect(calls.pharmacist).toHaveLength(0);
});

test('onboarding JWT cannot enter the normal pharmacist route', async ({ page }) => {
  const calls = await mockApi(page, { pharmacistStatus: 403 });
  await seed(page, pharmacistKey, { ...pharmacist, token: onboardingJwt });
  await page.goto(pharmacistPage);
  await expectPharmacistDenied(page);
  expect(calls.pharmacist).toContain(`Bearer ${onboardingJwt}`);
});

test('onboarding JWT cannot enter the customer route', async ({ page }) => {
  const calls = await mockApi(page);
  await seed(page, customerKey, { ...customer, token: onboardingJwt });
  await page.goto(customerPage);
  await expect(page).toHaveURL(/localhost:5173\/$/);
  expect(await stored(page, customerKey)).toBeNull();
  expect(calls.customer).toHaveLength(0);
});

test('customer identity edits are replaced by token owner profile', async ({ page }) => {
  const calls = await mockApi(page);
  await seed(page, customerKey, { ...customer, id: 999, email: 'attacker@example.test', token: customerJwt, isAdmin: true });
  await page.goto(customerPage);
  await expect(page).toHaveURL(/\/cart$/);
  await expect.poll(() => stored(page, customerKey)).toMatchObject(customer);
  expect(await stored(page, customerKey)).not.toHaveProperty('isAdmin');
  expect(calls.customer).toContain(`Bearer ${customerJwt}`);
  expect(calls.pharmacist).toHaveLength(0);
});

test('remembered logout propagates across two tabs', async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  const firstCalls = await mockApi(first);
  const secondCalls = await mockApi(second);
  await seed(first, pharmacistKey, { ...pharmacist, token: pharmacistJwt });
  await first.goto(pharmacistPage);
  await second.goto(pharmacistPage);
  await expect(first.getByText('Logout')).toBeVisible();
  await expect(second.getByText('Logout')).toBeVisible();
  expect(firstCalls.pharmacist).toContain(`Bearer ${pharmacistJwt}`);
  expect(secondCalls.pharmacist).toContain(`Bearer ${pharmacistJwt}`);
  await first.getByText('Logout').click();
  await expect(first).toHaveURL(/\/pharmacist\/login$/);
  await expect(second).toHaveURL(/\/pharmacist\/login$/);
  expect(await stored(first, pharmacistKey)).toBeNull();
  expect(await stored(second, pharmacistKey)).toBeNull();
});

test('fake customer auth object without token cannot open protected route', async ({ page }) => {
  const calls = await mockApi(page);
  await seed(page, customerKey, { ...customer, role: 'admin' });
  await page.goto(customerPage);
  await expect(page).toHaveURL(/localhost:5173\/$/);
  expect(await stored(page, customerKey)).toBeNull();
  expect(calls.customer).toHaveLength(0);
});

test('expired pharmacist JWT is removed before /me', async ({ page }) => {
  const calls = await mockApi(page);
  await seed(page, pharmacistKey, { ...pharmacist, token: expiredJwt });
  await page.goto(pharmacistPage);
  await expectPharmacistDenied(page);
  expect(calls.pharmacist).toHaveLength(0);
});

test('expired customer JWT is removed before profile', async ({ page }) => {
  const calls = await mockApi(page);
  await seed(page, customerKey, { ...customer, token: token({ id: customer.id, type: 'customer', exp: 1 }) });
  await page.goto(customerPage);
  await expect(page).toHaveURL(/localhost:5173\/$/);
  expect(await stored(page, customerKey)).toBeNull();
  expect(calls.customer).toHaveLength(0);
});

test('direct protected URL after logout redirects to login', async ({ page }) => {
  const calls = await mockApi(page);
  await seed(page, pharmacistKey, { ...pharmacist, token: pharmacistJwt });
  await page.goto(pharmacistPage);
  await expect(page.getByText('Logout')).toBeVisible();
  await page.getByText('Logout').click();
  await expectPharmacistDenied(page);
  const callsAtLogout = calls.pharmacist.length;
  await page.goto(pharmacistPage);
  await expectPharmacistDenied(page);
  expect(calls.pharmacist).toHaveLength(callsAtLogout);
  expect(await stored(page, onboardingKey, 'session')).toBeNull();
});
