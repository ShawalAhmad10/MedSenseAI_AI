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

const baseService =
  fs.readFileSync(
    path.join(
      root,
      'src/services/storefrontRecommendationService.js'
    ),
    'utf8'
  );

const interactionService =
  fs.readFileSync(
    path.join(
      root,
      'src/services/storefrontInteractionAwareRecommendationService.js'
    ),
    'utf8'
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
  'original catalogue recommendation client remains read-only',
  () => {
    assert.doesNotMatch(
      baseService,
      /axios\.(post|patch|delete)/
    );

    assert.match(
      baseService,
      /axios\.get/
    );
  }
);

test(
  'isolated interaction-aware client posts authoritative cart ids to additive endpoint',
  () => {
    assert.match(
      interactionService,
      /axios\.post/
    );

    assert.match(
      interactionService,
      /products\/\$\{sourceId\}\/interaction-aware/
    );

    assert.match(
      interactionService,
      /cart_product_ids/
    );

    assert.match(
      interactionService,
      /getInteractionAwareRecommendations/
    );

    assert.match(
      interactionService,
      /'\/api\/recommendations'/
    );
  }
);

test(
  'interaction-aware candidate copy never claims same-ingredient substitution',
  () => {
    assert.match(
      interactionService,
      /Governed DDI-rechecked candidate/
    );

    assert.match(
      interactionService,
      /does not establish therapeutic equivalence or clinical substitutability/
    );
  }
);

test(
  'cart identifies only exact non-minor DDI pair members for governed alternative review',
  () => {
    assert.match(
      cart,
      /pair\?\.interaction_found !==\s*true/
    );

    assert.match(
      cart,
      /severity ===\s*'minor'/
    );

    assert.match(
      cart,
      /product_ids_a/
    );

    assert.match(
      cart,
      /product_ids_b/
    );

    assert.match(
      cart,
      /harmfulProductIds/
    );
  }
);

test(
  'cart alternative UI remains pharmacist governed and never auto substitutes',
  () => {
    assert.match(
      cart,
      /Governed alternative review/
    );

    assert.match(
      cart,
      /Pharmacist review required/
    );

    assert.match(
      cart,
      /Pharmacist confirmation required/
    );

    assert.match(
      cart,
      /No medicine is replaced or added automatically/
    );

    assert.doesNotMatch(
      cart,
      /handleGovernedAlternativeCheck[\s\S]{0,2500}addItem\s*\(/
    );
  }
);

test(
  'interaction-aware result is bound to the current cart signature',
  () => {
    assert.match(
      cart,
      /cartSignature/
    );

    assert.match(
      cart,
      /alternativeReview\?\.cartSignature/
    );
  }
);