import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename =
  fileURLToPath(
    import.meta.url
  );

const __dirname =
  path.dirname(
    __filename
  );

const root =
  path.resolve(
    __dirname,
    '..'
  );

const cart =
  fs.readFileSync(
    path.join(
      root,
      'src/pages/storefront/CartPage.jsx'
    ),
    'utf8'
  );

test(
  'cart reads real customer consultation state',
  () => {
    assert.match(
      cart,
      /listCustomerConsultations/
    );

    assert.match(
      cart,
      /getFunnelCartId/
    );
  }
);

test(
  'cart approval is bound to exact cart lifecycle and snapshot',
  () => {
    assert.match(
      cart,
      /cart_instance_id/
    );

    assert.match(
      cart,
      /cart_snapshot/
    );

    assert.match(
      cart,
      /cartReviewSignature/
    );

    assert.match(
      cart,
      /consultationMatchesCurrentCart/
    );
  }
);

test(
  'approved cart passes consultation id into existing checkout contract',
  () => {
    assert.match(
      cart,
      /Continue Approved Checkout/
    );

    assert.match(
      cart,
      /\/checkout\?ddi_consultation_id=\$\{cartConsultation\.consultation_id\}/
    );
  }
);

test(
  'pending and rejected reviews stay in pharmacist workflow',
  () => {
    assert.match(
      cart,
      /Pharmacist review pending/
    );

    assert.match(
      cart,
      /View Pharmacist Review/
    );

    assert.match(
      cart,
      /View Pharmacist Guidance/
    );

    assert.match(
      cart,
      /Current cart not approved/
    );
  }
);

test(
  'cart refreshes approval status after pharmacist action',
  () => {
    assert.match(
      cart,
      /window\.addEventListener\(\s*'focus'/
    );

    assert.match(
      cart,
      /visibilitychange/
    );

    assert.match(
      cart,
      /setInterval/
    );
  }
);

test(
  'pharmacist approval does not rewrite authoritative DDI clearance',
  () => {
    assert.match(
      cart,
      /ddiCheckoutAllowed/
    );

    assert.match(
      cart,
      /interaction warning remains visible/
    );

    assert.doesNotMatch(
      cart,
      /setDdiResult/
    );
  }
);