const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Pharmacist, Customer } = require('../src/models');

const ROOT = path.resolve(__dirname, '..');

const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  throw new Error(
    'JWT_SECRET must be defined for auth hardening tests'
  );
}

const authSource = fs.readFileSync(
  path.join(
    ROOT,
    'src',
    'middleware',
    'auth.js'
  ),
  'utf8'
);

const customerRoutesSource = fs.readFileSync(
  path.join(
    ROOT,
    'src',
    'routes',
    'customerAuthRoutes.js'
  ),
  'utf8'
);

const authRoutesSource = fs.readFileSync(
  path.join(ROOT, 'src', 'routes', 'authRoutes.js'),
  'utf8'
);

const authControllerSource = fs.readFileSync(
  path.join(ROOT, 'src', 'controllers', 'authController.js'),
  'utf8'
);

const {
  authenticate,
  verifyPharmacistOnboardingToken
} = require('../src/middleware/auth');

const {
  verifyCustomerToken,
  optionalCustomerToken
} = require('../src/middleware/customerAuth');

const originalStaffFindByPk = Pharmacist.findByPk;
const originalCustomerFindByPk = Customer.findByPk;

let staffLookup;
let customerLookup;

function activeStaff(id, overrides = {}) {
  return {
    id,
    email: `${id}@current.example.com`,
    role: String(id).startsWith('admin') ? 'admin' : 'pharmacist',
    isActive: true,
    isEmailVerified: true,
    isApproved: true,
    toPublicJSON() {
      return { id: this.id, email: this.email, role: this.role };
    },
    ...overrides
  };
}

function activeCustomer(id, overrides = {}) {
  return {
    customer_id: Number(id),
    email: `customer-${id}@current.example.com`,
    is_active: true,
    status: 1,
    ...overrides
  };
}

test.beforeEach(() => {
  staffLookup = async (id) => activeStaff(id);
  customerLookup = async (id) => activeCustomer(id);
  Pharmacist.findByPk = (id) => staffLookup(id);
  Customer.findByPk = (id) => customerLookup(id);
});

test.after(() => {
  Pharmacist.findByPk = originalStaffFindByPk;
  Customer.findByPk = originalCustomerFindByPk;
});


function invokeAuth(token) {
  return new Promise((resolve, reject) => {
    const req = {
      headers: token
        ? {
            authorization:
              `Bearer ${token}`
          }
        : {}
    };

    const result = {
      nextCalled: false,
      statusCode: null,
      body: null,
      user: null
    };

    const res = {
      status(code) {
        result.statusCode = code;
        return this;
      },

      json(body) {
        result.body = body;
        result.user = req.user || null;
        resolve(result);
        return this;
      }
    };

    const next = () => {
      result.nextCalled = true;
      result.user = req.user || null;
      resolve(result);
    };

    try {
      authenticate(req, res, next);
    } catch (error) {
      reject(error);
    }
  });
}

function invokeOnboardingAuth(token) {
  return new Promise((resolve, reject) => {
    const req = {
      headers: token
        ? { authorization: `Bearer ${token}` }
        : {}
    };
    const result = {
      nextCalled: false,
      statusCode: null,
      body: null,
      onboardingUser: null
    };
    const res = {
      status(code) {
        result.statusCode = code;
        return this;
      },
      json(body) {
        result.body = body;
        resolve(result);
        return this;
      }
    };
    const next = () => {
      result.nextCalled = true;
      result.onboardingUser = req.onboardingUser || null;
      resolve(result);
    };

    try {
      verifyPharmacistOnboardingToken(req, res, next);
    } catch (error) {
      reject(error);
    }
  });
}

function invokeCustomerAuth(middleware, authorization) {
  return new Promise((resolve, reject) => {
    const req = {
      headers: authorization === undefined
        ? {}
        : { authorization }
    };
    const result = {
      nextCalled: false,
      statusCode: null,
      body: null,
      user: null,
      customerUser: null
    };
    const res = {
      status(code) {
        result.statusCode = code;
        return this;
      },
      json(body) {
        result.body = body;
        result.user = req.user || null;
        result.customerUser = req.customerUser || null;
        resolve(result);
        return this;
      }
    };
    const next = () => {
      result.nextCalled = true;
      result.user = req.user || null;
      result.customerUser = req.customerUser || null;
      resolve(result);
    };

    Promise.resolve(middleware(req, res, next)).catch(reject);
  });
}


test(
  'staff auth has no hardcoded JWT fallback secret',
  () => {
    assert.doesNotMatch(
      authSource,
      /medsense_secret_key_2024/
    );

    assert.match(
      authSource,
      /JWT_SECRET environment variable is required/
    );
  }
);


test(
  'valid pharmacist token is accepted by staff middleware',
  async () => {
    const token = jwt.sign(
      {
        id: 'staff-test-1',
        email: 'staff@example.com',
        role: 'pharmacist'
      },
      SECRET,
      { expiresIn: '5m' }
    );

    const result =
      await invokeAuth(token);

    assert.equal(
      result.nextCalled,
      true
    );

    assert.equal(
      result.user.role,
      'pharmacist'
    );
  }
);


test(
  'valid admin token is accepted by staff middleware',
  async () => {
    const token = jwt.sign(
      {
        id: 'admin-test-1',
        email: 'admin@example.com',
        role: 'admin'
      },
      SECRET,
      { expiresIn: '5m' }
    );

    const result =
      await invokeAuth(token);

    assert.equal(
      result.nextCalled,
      true
    );

    assert.equal(
      result.user.role,
      'admin'
    );
  }
);


test(
  'valid customer JWT is rejected by staff middleware',
  async () => {
    const token = jwt.sign(
      {
        id: 2,
        email: 'customer@example.com',
        type: 'customer'
      },
      SECRET,
      { expiresIn: '5m' }
    );

    const result =
      await invokeAuth(token);

    assert.equal(
      result.nextCalled,
      false
    );

    assert.equal(
      result.statusCode,
      403
    );

    assert.equal(
      result.body?.code,
      'STAFF_ACCESS_REQUIRED'
    );
  }
);

test('pharmacist onboarding JWT is rejected by staff middleware', async () => {
  const token = jwt.sign(
    {
      id: 'onboarding-staff-boundary',
      email: 'onboarding@example.com',
      type: 'pharmacist_onboarding'
    },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeAuth(token);

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'STAFF_ACCESS_REQUIRED');
});


test(
  'token with forged unsupported role is rejected',
  async () => {
    const token = jwt.sign(
      {
        id: 'fake-user',
        email: 'fake@example.com',
        role: 'customer'
      },
      SECRET,
      { expiresIn: '5m' }
    );

    const result =
      await invokeAuth(token);

    assert.equal(
      result.statusCode,
      403
    );

    assert.equal(
      result.body?.code,
      'STAFF_ACCESS_REQUIRED'
    );
  }
);


test(
  'expired staff token is rejected explicitly',
  async () => {
    const token = jwt.sign(
      {
        id: 'staff-expired',
        role: 'pharmacist'
      },
      SECRET,
      { expiresIn: -1 }
    );

    const result =
      await invokeAuth(token);

    assert.equal(
      result.statusCode,
      401
    );

    assert.equal(
      result.body?.code,
      'TOKEN_EXPIRED'
    );
  }
);


test(
  'invalid token is rejected explicitly',
  async () => {
    const result =
      await invokeAuth(
        'definitely-not-a-jwt'
      );

    assert.equal(
      result.statusCode,
      401
    );

    assert.equal(
      result.body?.code,
      'INVALID_TOKEN'
    );
  }
);


test(
  'missing token is rejected',
  async () => {
    const result =
      await invokeAuth(null);

    assert.equal(
      result.statusCode,
      401
    );

    assert.equal(
      result.body?.code,
      'AUTH_REQUIRED'
    );
  }
);


test(
  'dashboard customer list requires staff authentication',
  () => {
    assert.match(
      customerRoutesSource,
      /'\/list',[\s\S]{0,120}authenticateToken/
    );
  }
);


test(
  'dashboard customer creation requires staff authentication',
  () => {
    assert.match(
      customerRoutesSource,
      /'\/create',[\s\S]{0,120}authenticateToken/
    );
  }
);


test(
  'dashboard customer update requires staff authentication',
  () => {
    assert.match(
      customerRoutesSource,
      /'\/update\/:customerId',[\s\S]{0,120}authenticateToken/
    );
  }
);


test(
  'customer-owned profile routes still require customer token',
  () => {
    assert.match(
      customerRoutesSource,
      /'\/profile',[\s\S]{0,120}verifyCustomerToken/
    );

    assert.match(
      customerRoutesSource,
      /'\/change-password',[\s\S]{0,120}verifyCustomerToken/
    );
  }
);

test('normal pharmacist JWT cannot pass onboarding middleware', async () => {
  const token = jwt.sign(
    { id: 'staff-1', email: 'staff@example.com', role: 'pharmacist' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeOnboardingAuth(token);

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'WRONG_ONBOARDING_TOKEN_TYPE');
});

test('missing onboarding JWT fails explicitly', async () => {
  const result = await invokeOnboardingAuth(null);

  assert.equal(result.statusCode, 401);
  assert.equal(result.body?.code, 'ONBOARDING_TOKEN_REQUIRED');
});

test('customer JWT cannot pass onboarding middleware', async () => {
  const token = jwt.sign(
    { id: 'customer-1', email: 'customer@example.com', type: 'customer' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeOnboardingAuth(token);

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'WRONG_ONBOARDING_TOKEN_TYPE');
});

test('correct pharmacist onboarding JWT passes with trusted identity only', async () => {
  const token = jwt.sign(
    {
      id: 'onboarding-1',
      email: 'onboarding@example.com',
      type: 'pharmacist_onboarding',
      role: 'admin'
    },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeOnboardingAuth(token);

  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.onboardingUser, {
    id: 'onboarding-1',
    email: 'onboarding@example.com'
  });
});

test('expired onboarding JWT fails explicitly', async () => {
  const token = jwt.sign(
    { id: 'onboarding-2', email: 'expired@example.com', type: 'pharmacist_onboarding' },
    SECRET,
    { expiresIn: -1 }
  );
  const result = await invokeOnboardingAuth(token);

  assert.equal(result.statusCode, 401);
  assert.equal(result.body?.code, 'ONBOARDING_TOKEN_EXPIRED');
});

test('malformed onboarding JWT fails explicitly', async () => {
  const result = await invokeOnboardingAuth('not-a-jwt');

  assert.equal(result.statusCode, 401);
  assert.equal(result.body?.code, 'INVALID_ONBOARDING_TOKEN');
});

test('wrong onboarding token type fails explicitly', async () => {
  const token = jwt.sign(
    { id: 'other-1', email: 'other@example.com', type: 'password_reset' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeOnboardingAuth(token);

  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'WRONG_ONBOARDING_TOKEN_TYPE');
});

test('complete-profile route requires onboarding middleware', () => {
  assert.match(
    authRoutesSource,
    /'\/pharmacist\/complete-profile',[\s\S]{0,120}verifyPharmacistOnboardingToken,[\s\S]{0,120}authController\.completeProfile/
  );
});

test('completeProfile selects only the trusted onboarding identity', () => {
  const completeProfileSource = authControllerSource.slice(
    authControllerSource.indexOf('exports.completeProfile'),
    authControllerSource.indexOf('exports.forgotPassword')
  );

  assert.match(
    completeProfileSource,
    /Pharmacist\.findByPk\(req\.onboardingUser\.id\)/
  );
  assert.match(
    completeProfileSource,
    /user\.email !== req\.onboardingUser\.email/
  );
  assert.doesNotMatch(
    completeProfileSource,
    /Pharmacist\.findOne\(\{ where: \{ email \} \}\)/
  );
  assert.doesNotMatch(completeProfileSource, /user\.isActive\s*=\s*true/);
  assert.match(completeProfileSource, /if \(!user\.isActive\)/);
});

test('Google suspension check precedes onboarding token issuance', () => {
  const googleLoginSource = authControllerSource.slice(
    authControllerSource.indexOf('exports.googleLogin'),
    authControllerSource.indexOf('exports.completeProfile')
  );

  assert.ok(
    googleLoginSource.indexOf('if (!pharmacist.isActive)') <
      googleLoginSource.indexOf('generatePharmacistOnboardingToken')
  );
});

test('valid JWT for a now-suspended pharmacist fails', async () => {
  staffLookup = async (id) => activeStaff(id, { isActive: false });
  const token = jwt.sign(
    { id: 'staff-suspended', email: 'stale@example.com', role: 'pharmacist' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeAuth(token);

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'ACCOUNT_SUSPENDED');
});

test('valid JWT for a now-unapproved pharmacist fails', async () => {
  staffLookup = async (id) => activeStaff(id, { isApproved: false });
  const token = jwt.sign(
    { id: 'staff-unapproved', email: 'stale@example.com', role: 'pharmacist' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeAuth(token);

  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'ACCOUNT_NOT_APPROVED');
});

test('valid JWT for a now-unverified pharmacist fails', async () => {
  staffLookup = async (id) => activeStaff(id, { isEmailVerified: false });
  const token = jwt.sign(
    { id: 'staff-unverified', email: 'stale@example.com', role: 'pharmacist' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeAuth(token);

  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'EMAIL_NOT_VERIFIED');
});

test('valid JWT for a deleted staff account fails', async () => {
  staffLookup = async () => null;
  const token = jwt.sign(
    { id: 'staff-deleted', email: 'stale@example.com', role: 'pharmacist' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeAuth(token);

  assert.equal(result.statusCode, 401);
  assert.equal(result.body?.code, 'STAFF_ACCOUNT_INVALID');
});

test('database role stops a stale incompatible staff token role', async () => {
  staffLookup = async (id) => activeStaff(id, { role: 'pharmacist' });
  const token = jwt.sign(
    { id: 'role-changed', email: 'stale@example.com', role: 'admin' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeAuth(token);

  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'STAFF_ACCESS_REQUIRED');
});

test('active admin does not require pharmacist approval fields', async () => {
  staffLookup = async (id) => activeStaff(id, {
    role: 'admin',
    isApproved: false,
    isEmailVerified: false
  });
  const token = jwt.sign(
    { id: 'admin-current', email: 'stale@example.com', role: 'admin' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeAuth(token);

  assert.equal(result.nextCalled, true);
  assert.equal(result.user.role, 'admin');
});

test('staff downstream identity is the current database model instance', async () => {
  const current = activeStaff('staff-current', {
    email: 'current-staff@example.com'
  });
  staffLookup = async () => current;
  const token = jwt.sign(
    { id: current.id, email: 'stale@example.com', role: 'pharmacist' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeAuth(token);

  assert.equal(result.nextCalled, true);
  assert.equal(result.user, current);
  assert.equal(result.user.email, 'current-staff@example.com');
  assert.equal(typeof result.user.toPublicJSON, 'function');
});

test('active customer JWT passes with authoritative identity', async () => {
  const current = activeCustomer(42, { email: 'current-customer@example.com' });
  customerLookup = async () => current;
  const token = jwt.sign(
    { id: 42, email: 'stale@example.com', type: 'customer' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeCustomerAuth(
    verifyCustomerToken,
    `Bearer ${token}`
  );

  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.user, {
    id: 42,
    email: 'current-customer@example.com',
    type: 'customer'
  });
});

test('legacy customer with null optional activity status remains valid', async () => {
  customerLookup = async (id) => activeCustomer(id, {
    is_active: null,
    status: null
  });
  const token = jwt.sign(
    { id: 51, email: 'legacy@example.com', type: 'customer' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeCustomerAuth(verifyCustomerToken, `Bearer ${token}`);

  assert.equal(result.nextCalled, true);
  assert.equal(result.user.id, 51);
});

test('deactivated customer with a valid JWT fails', async () => {
  customerLookup = async (id) => activeCustomer(id, { is_active: false });
  const token = jwt.sign(
    { id: 43, email: 'customer@example.com', type: 'customer' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeCustomerAuth(verifyCustomerToken, `Bearer ${token}`);

  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'CUSTOMER_ACCOUNT_INACTIVE');
});

test('customer with status zero fails', async () => {
  customerLookup = async (id) => activeCustomer(id, { status: 0 });
  const token = jwt.sign(
    { id: 44, email: 'customer@example.com', type: 'customer' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeCustomerAuth(verifyCustomerToken, `Bearer ${token}`);

  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'CUSTOMER_ACCOUNT_INACTIVE');
});

test('nonexistent customer with a valid JWT fails', async () => {
  customerLookup = async () => null;
  const token = jwt.sign(
    { id: 45, email: 'customer@example.com', type: 'customer' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeCustomerAuth(verifyCustomerToken, `Bearer ${token}`);

  assert.equal(result.statusCode, 401);
  assert.equal(result.body?.code, 'CUSTOMER_ACCOUNT_INVALID');
});

test('expired customer JWT fails', async () => {
  const token = jwt.sign(
    { id: 46, email: 'customer@example.com', type: 'customer' },
    SECRET,
    { expiresIn: -1 }
  );
  const result = await invokeCustomerAuth(verifyCustomerToken, `Bearer ${token}`);

  assert.equal(result.statusCode, 401);
  assert.equal(result.body?.code, 'TOKEN_EXPIRED');
});

test('wrong token type fails customer authentication', async () => {
  const token = jwt.sign(
    { id: 47, email: 'staff@example.com', role: 'pharmacist' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeCustomerAuth(verifyCustomerToken, `Bearer ${token}`);

  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'INVALID_TOKEN');
});

test('pharmacist onboarding token fails customer authentication', async () => {
  const token = jwt.sign(
    {
      id: 52,
      email: 'onboarding@example.com',
      type: 'pharmacist_onboarding'
    },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeCustomerAuth(verifyCustomerToken, `Bearer ${token}`);

  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'INVALID_TOKEN');
});

test('forged staff role with an invalid signature fails', async () => {
  const token = jwt.sign(
    { id: 'forged-admin', email: 'forged@example.com', role: 'admin' },
    'different-secret',
    { expiresIn: '5m' }
  );
  const result = await invokeAuth(token);

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 401);
  assert.equal(result.body?.code, 'INVALID_TOKEN');
});

test('customer token can resolve only its own authoritative database identity', async () => {
  let lookedUpId = null;
  customerLookup = async (id) => {
    lookedUpId = id;
    return activeCustomer(id, { email: 'customer-a@current.example.com' });
  };
  const token = jwt.sign(
    { id: 53, email: 'customer-b@tampered.example.com', type: 'customer' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeCustomerAuth(verifyCustomerToken, `Bearer ${token}`);

  assert.equal(lookedUpId, 53);
  assert.deepEqual(result.user, {
    id: 53,
    email: 'customer-a@current.example.com',
    type: 'customer'
  });
});

test('optional customer auth preserves requests with no Authorization header', async () => {
  const result = await invokeCustomerAuth(optionalCustomerToken, undefined);

  assert.equal(result.nextCalled, true);
  assert.equal(result.customerUser, null);
});

test('optional customer auth attaches current active customer identity', async () => {
  const current = activeCustomer(48, { email: 'optional-current@example.com' });
  customerLookup = async () => current;
  const token = jwt.sign(
    { id: 48, email: 'stale@example.com', type: 'customer' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeCustomerAuth(optionalCustomerToken, `Bearer ${token}`);

  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.customerUser, {
    id: 48,
    email: 'optional-current@example.com',
    type: 'customer'
  });
});

test('optional customer auth rejects an expired supplied token', async () => {
  const token = jwt.sign(
    { id: 49, email: 'customer@example.com', type: 'customer' },
    SECRET,
    { expiresIn: -1 }
  );
  const result = await invokeCustomerAuth(optionalCustomerToken, `Bearer ${token}`);

  assert.equal(result.nextCalled, false);
  assert.equal(result.body?.code, 'TOKEN_EXPIRED');
});

test('optional customer auth rejects an invalid supplied token', async () => {
  const result = await invokeCustomerAuth(
    optionalCustomerToken,
    'Bearer definitely-not-a-token'
  );

  assert.equal(result.nextCalled, false);
  assert.equal(result.body?.code, 'INVALID_TOKEN');
});

test('optional customer auth rejects a non-Bearer Authorization header', async () => {
  const result = await invokeCustomerAuth(optionalCustomerToken, 'Basic abc123');

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 401);
  assert.equal(result.body?.code, 'INVALID_TOKEN');
});

test('optional customer auth rejects a deactivated supplied customer', async () => {
  customerLookup = async (id) => activeCustomer(id, { is_active: false });
  const token = jwt.sign(
    { id: 50, email: 'customer@example.com', type: 'customer' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeCustomerAuth(optionalCustomerToken, `Bearer ${token}`);

  assert.equal(result.nextCalled, false);
  assert.equal(result.body?.code, 'CUSTOMER_ACCOUNT_INACTIVE');
});

test('optional customer auth rejects a wrong supplied token type', async () => {
  const token = jwt.sign(
    { id: 'staff-optional', email: 'staff@example.com', role: 'pharmacist' },
    SECRET,
    { expiresIn: '5m' }
  );
  const result = await invokeCustomerAuth(optionalCustomerToken, `Bearer ${token}`);

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.code, 'INVALID_TOKEN');
});
