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

const routes =
  read('src/routes/authRoutes.js');

const controller =
  read('src/controllers/authController.js');

const middleware =
  read('src/middleware/pharmacistStatusAuth.js');


test(
  'status route requires rate limit and trusted status JWT middleware',
  () => {
    assert.match(
      routes,
      /\/pharmacist\/status'[\s\S]{0,200}pharmacistStatusLimiter[\s\S]{0,200}verifyPharmacistStatusToken[\s\S]{0,200}authController\.checkStatus/
    );
  }
);


test(
  'status middleware binds token to authoritative pharmacist record',
  () => {
    assert.match(
      middleware,
      /verifyToken/
    );

    assert.match(
      middleware,
      /Pharmacist\.findByPk/
    );

    assert.match(
      middleware,
      /decoded\.email/
    );

    assert.match(
      middleware,
      /pharmacist\.email/
    );

    assert.match(
      middleware,
      /decoded\?\.role/
    );

    assert.doesNotMatch(
      middleware,
      /req\.query/
    );
  }
);


test(
  'pending approval itself is not rejected by status middleware',
  () => {
    assert.doesNotMatch(
      middleware,
      /if\s*\([^)]*!pharmacist\.isApproved/
    );

    assert.doesNotMatch(
      middleware,
      /if\s*\([^)]*pharmacist\.isApproved\s*===\s*false/
    );
  }
);


test(
  'status controller has no arbitrary email lookup',
  () => {
    const start =
      controller.indexOf(
        'exports.checkStatus'
      );

    const end =
      controller.indexOf(
        'exports.selectPlan',
        start
      );

    const scope =
      controller.slice(
        start,
        end
      );

    assert.match(
      scope,
      /req\.statusPharmacist/
    );

    assert.doesNotMatch(
      scope,
      /req\.query/
    );

    assert.doesNotMatch(
      scope,
      /Pharmacist\.findOne/
    );

    assert.doesNotMatch(
      scope,
      /where:\s*\{\s*email/
    );

    assert.doesNotMatch(
      scope,
      /User not found/
    );
  }
);
