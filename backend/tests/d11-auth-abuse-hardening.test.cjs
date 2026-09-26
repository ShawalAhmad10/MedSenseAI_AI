const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

const limiter =
  read('src/middleware/authRateLimiters.js');

const authRoutes =
  read('src/routes/authRoutes.js');

const customerRoutes =
  read('src/routes/customerAuthRoutes.js');

const controller =
  read('src/controllers/authController.js');


test(
  'pharmacist sensitive auth endpoints use dedicated limiters',
  () => {
    for (const name of [
      'pharmacistLoginLimiter',
      'pharmacistOtpVerifyLimiter',
      'pharmacistOtpSendLimiter',
      'pharmacistResetLimiter',
      'pharmacistRegistrationLimiter'
    ]) {
      assert.match(
        authRoutes,
        new RegExp(name)
      );
    }
  }
);


test(
  'customer login and registration are separately rate limited',
  () => {
    assert.match(
      customerRoutes,
      /customerLoginLimiter/
    );

    assert.match(
      customerRoutes,
      /customerRegistrationLimiter/
    );
  }
);


test(
  'rate-limit response has stable machine code',
  () => {
    assert.match(
      limiter,
      /AUTH_RATE_LIMITED/
    );

    assert.match(
      limiter,
      /pharmacistOtpSendLimiter[\s\S]{0,300}max:\s*5/
    );

    assert.match(
      limiter,
      /pharmacistLoginLimiter[\s\S]{0,300}max:\s*10/
    );
  }
);


test(
  'select-plan route requires authenticateToken',
  () => {
    assert.match(
      authRoutes,
      /\/pharmacist\/select-plan'[\s\S]{0,150}authenticateToken[\s\S]{0,150}authController\.selectPlan/
    );
  }
);


test(
  'selectPlan uses req.user id and never request email authority',
  () => {
    const start =
      controller.indexOf(
        'exports.selectPlan'
      );

    const end =
      controller.indexOf(
        'exports.upgradePlan',
        start
      );

    const scope =
      controller.slice(
        start,
        end
      );

    assert.match(
      scope,
      /req\.user\.id/
    );

    assert.match(
      scope,
      /Pharmacist\.findByPk/
    );

    assert.doesNotMatch(
      scope,
      /req\.body\.email/
    );

    assert.doesNotMatch(
      scope,
      /where:\s*\{\s*email\s*\}/
    );
  }
);


test(
  'selectPlan validates plan and billing allowlists',
  () => {
    const start =
      controller.indexOf(
        'exports.selectPlan'
      );

    const end =
      controller.indexOf(
        'exports.upgradePlan',
        start
      );

    const scope =
      controller.slice(
        start,
        end
      );

    assert.match(scope, /validPlans/);
    assert.match(scope, /free/);
    assert.match(scope, /basic/);
    assert.match(scope, /pro/);

    assert.match(scope, /validBilling/);
    assert.match(scope, /monthly/);
    assert.match(scope, /annual/);
  }
);
