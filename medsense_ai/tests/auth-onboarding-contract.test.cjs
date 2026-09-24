const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

const authServiceSource = read('src', 'services', 'authService.js');
const loginSource = read('src', 'pages', 'auth', 'LoginPage.jsx');
const registerSource = read('src', 'pages', 'auth', 'RegisterPage.jsx');
const customerAuthSource = read('src', 'context', 'AuthContext.jsx');
const customerSessionSource = read('src', 'services', 'customerAuthSession.js');
const pharmacistSessionSource = read('src', 'services', 'pharmacistAuthSession.js');

test('Google onboarding token is stored only in sessionStorage', () => {
  assert.match(
    authServiceSource,
    /PHARMACIST_GOOGLE_ONBOARDING_KEY[\s\S]*medsense_pharmacist_google_onboarding/
  );
  assert.match(
    authServiceSource,
    /sessionStorage\.setItem\([\s\S]{0,100}PHARMACIST_GOOGLE_ONBOARDING_KEY/
  );
  assert.doesNotMatch(
    authServiceSource,
    /localStorage\.(?:setItem|getItem)\([\s\S]{0,100}PHARMACIST_GOOGLE_ONBOARDING_KEY/
  );
});

test('Google incomplete-profile flows preserve onboardingToken', () => {
  assert.match(loginSource, /savePharmacistGoogleOnboarding\(r\.data\)/);
  assert.match(registerSource, /savePharmacistGoogleOnboarding\(result\.data\)/);
  assert.match(registerSource, /getPharmacistGoogleOnboarding\(\)/);
});

test('complete-profile sends onboarding token in Authorization', () => {
  assert.match(
    authServiceSource,
    /updateGooglePharmacistDetails:[\s\S]{0,300}Authorization: `Bearer \$\{onboardingToken\}`/
  );
  assert.match(registerSource, /context\.onboardingToken/);
});

test('successful completion clears onboarding state', () => {
  assert.match(
    registerSource,
    /if \(result\?\.data\?\.token\) \{[\s\S]{0,120}clearPharmacistGoogleOnboarding\(\)/
  );
});

test('malformed and expired onboarding state is cleared', () => {
  assert.match(authServiceSource, /payload\.exp \* 1000 > Date\.now\(\)/);
  assert.match(
    authServiceSource,
    /catch \{[\s\S]{0,100}clearPharmacistGoogleOnboarding\(\)/
  );
  assert.match(registerSource, /navigate\('\/pharmacist\/login'/);
});

test('normal pharmacist and customer auth storage contracts remain unchanged', () => {
  assert.match(
    loginSource,
    /writePharmacistAuth\([\s\S]{0,150}rememberMe/
  );
  assert.match(pharmacistSessionSource, /PHARMACIST_AUTH_KEY = 'medsense_auth_user'/);
  assert.match(customerSessionSource, /CUSTOMER_AUTH_KEY = 'medsense_customer_auth'/);
  assert.match(customerAuthSource, /writeCustomerAuth/);
  assert.match(customerAuthSource, /clearCustomerAuth/);
});
