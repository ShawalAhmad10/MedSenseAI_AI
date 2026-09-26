const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root =
  path.resolve(
    __dirname,
    '..'
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      relativePath
    ),
    'utf8'
  );
}

const server =
  read('src/server.js');

const auth =
  read('src/controllers/authController.js');

const customerAuth =
  read('src/controllers/customerAuthController.js');

const customer =
  read('src/controllers/customerController.js');

const order =
  read('src/controllers/orderController.js');

const analytics =
  read('src/controllers/analyticsController.js');

const lead =
  read('src/controllers/leadController.js');

const sales =
  read('src/controllers/salesController.js');


test(
  'global error handler sanitizes server failures and never returns stack',
  () => {
    assert.match(
      server,
      /status >= 500[\s\S]{0,120}Internal server error/
    );

    assert.doesNotMatch(
      server,
      /message:\s*err\.message\s*\|\|\s*['"]Internal server error/
    );

    assert.doesNotMatch(
      server,
      /stack:\s*err\.stack/
    );
  }
);


test(
  'global handler still permits deliberate client-error messages',
  () => {
    assert.match(
      server,
      /status >= 500[\s\S]{0,220}err\?\.message/
    );

    assert.match(
      server,
      /err\.status >= 400/
    );
  }
);


test(
  'public pharmacist registration does not expose thrown exception text',
  () => {
    const start =
      auth.indexOf(
        'exports.register'
      );

    const end =
      auth.indexOf(
        'exports.verifyOtp',
        start
      );

    const scope =
      auth.slice(
        start,
        end
      );

    assert.match(
      scope,
      /message:\s*['"]Registration failed['"]/
    );

    assert.doesNotMatch(
      scope,
      /message:\s*error\.message/
    );
  }
);


test(
  'customer auth and profile 500 responses expose no raw error property',
  () => {
    assert.doesNotMatch(
      customerAuth,
      /error\s*:\s*error\.message/
    );
  }
);


test(
  'customer management 500 responses expose no raw error property',
  () => {
    assert.doesNotMatch(
      customer,
      /error\s*:\s*error\.message/
    );
  }
);


test(
  'order 500 responses expose neither raw exception nor development stack',
  () => {
    assert.doesNotMatch(
      order,
      /error\s*:\s*error\.message/
    );

    assert.doesNotMatch(
      order,
      /details:\s*process\.env\.NODE_ENV[\s\S]{0,120}error\.stack/
    );
  }
);


test(
  'controlled analytics Lead and Sales client-validation messages remain',
  () => {
    assert.match(
      analytics,
      /INVALID_ANALYTICS_PARAMETER/
    );

    assert.match(
      analytics,
      /message:\s*error\.message/
    );

    assert.match(
      lead,
      /LEAD_INVALID_LIMIT/
    );

    assert.match(
      lead,
      /message:\s*error\.message/
    );

    assert.match(
      sales,
      /INVALID_SALES_PARAMETER/
    );

    assert.match(
      sales,
      /message:\s*error\.message/
    );
  }
);
