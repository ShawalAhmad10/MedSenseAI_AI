import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const root =
  path.resolve(__dirname, '..');

const page =
  fs.readFileSync(
    path.join(
      root,
      'src/pages/storefront/PharmacistConsultPage.jsx'
    ),
    'utf8'
  );

test(
  'continuation requires exact active checkout lifecycle',
  () => {
    assert.match(
      page,
      /readStoredCartInstanceId/
    );

    assert.match(
      page,
      /getBuyNowCheckoutSession/
    );

    assert.match(
      page,
      /consultationCartInstanceId ===\s*activeLifecycleId/
    );

    assert.match(
      page,
      /approvalMatchesActiveLifecycle/
    );
  }
);

test(
  'Buy Now approval preserves Buy Now mode',
  () => {
    assert.match(
      page,
      /startsWith\(\s*'buy-now-'/
    );

    assert.match(
      page,
      /\/checkout\?mode=buy-now&ddi_consultation_id=/
    );
  }
);

test(
  'normal cart approval uses normal checkout',
  () => {
    assert.match(
      page,
      /startsWith\(\s*'cart-safe-'/
    );

    assert.match(
      page,
      /\/checkout\?ddi_consultation_id=/
    );
  }
);

test(
  'stale inactive or consumed approval has no continuation target',
  () => {
    assert.match(
      page,
      /approvedCheckoutTarget/
    );

    assert.match(
      page,
      /!approvalConsumed/
    );

    assert.match(
      page,
      /not linked to the currently active checkout lifecycle/
    );
  }
);
