import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const service =
  fs.readFileSync(
    'src/services/authService.js',
    'utf8'
  );

const page =
  fs.readFileSync(
    'src/pages/auth/PendingApproval.jsx',
    'utf8'
  );


test(
  'status service sends JWT instead of arbitrary email query',
  () => {
    const start =
      service.indexOf(
        'checkApprovalStatus:'
      );

    const end =
      service.indexOf(
        'googleLogin:',
        start
      );

    const scope =
      service.slice(
        start,
        end
      );

    assert.match(
      scope,
      /Authorization/
    );

    assert.match(
      scope,
      /Bearer/
    );

    assert.doesNotMatch(
      scope,
      /params/
    );

    assert.doesNotMatch(
      scope,
      /email/
    );
  }
);


test(
  'pending approval page uses current pharmacist auth token',
  () => {
    assert.match(
      page,
      /user\?\.token/
    );

    assert.match(
      page,
      /statusToken/
    );

    assert.doesNotMatch(
      page,
      /lookupEmail/
    );

    assert.doesNotMatch(
      page,
      /location\.state\?\.email/
    );

    assert.doesNotMatch(
      page,
      /useLocation/
    );
  }
);
