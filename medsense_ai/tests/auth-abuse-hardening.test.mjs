import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const register =
  fs.readFileSync(
    'src/pages/auth/RegisterPage.jsx',
    'utf8'
  );

const service =
  fs.readFileSync(
    'src/services/authService.js',
    'utf8'
  );


test(
  'OTP JWT is retained only in registration component memory',
  () => {
    assert.match(
      register,
      /registrationToken/
    );

    assert.match(
      register,
      /result\?\.data\?\.token/
    );

    const start =
      register.indexOf(
        'async function handleVerify'
      );

    const end =
      register.indexOf(
        'async function handleSelectPlan'
      );

    const scope =
      register.slice(
        start,
        end
      );

    assert.doesNotMatch(
      scope,
      /localStorage\.setItem/
    );

    assert.doesNotMatch(
      scope,
      /sessionStorage\.setItem/
    );

    assert.doesNotMatch(
      scope,
      /writePharmacistAuth/
    );
  }
);


test(
  'selectPlan sends Bearer JWT and no email identity',
  () => {
    const start =
      service.indexOf(
        'selectPlan:'
      );

    const end =
      service.indexOf(
        'forgotPassword:',
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
      /registrationToken/
    );

    assert.doesNotMatch(
      scope,
      /email/
    );

    assert.doesNotMatch(
      scope,
      /pharmacyName/
    );
  }
);
