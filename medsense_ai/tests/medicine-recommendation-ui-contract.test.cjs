const fs =
  require('node:fs');

const path =
  require('node:path');

const test =
  require('node:test');

const assert =
  require('node:assert/strict');

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

test(
  'storefront recommendation client uses governed same-origin API',
  () => {
    const source =
      read(
        'src/services/storefrontRecommendationService.js'
      );

    assert.match(
      source,
      /\/api\/recommendations/
    );

    assert.match(
      source,
      /getProductRecommendations/
    );

    assert.match(
      source,
      /getPrescriptionRecommendations/
    );

    assert.match(
      source,
      /axios\.get/
    );

    assert.doesNotMatch(
      source,
      /axios\.(post|patch|delete)/
    );
  }
);

test(
  'prescription recommendations use customer authentication only',
  () => {
    const source =
      read(
        'src/services/storefrontRecommendationService.js'
      );

    assert.match(
      source,
      /medsense_customer_auth/
    );

    assert.match(
      source,
      /Authorization:[\s\S]*Bearer/
    );

    assert.doesNotMatch(
      source,
      /medsense_auth_user/
    );
  }
);

test(
  'recommendation client never adds products to cart automatically',
  () => {
    const source =
      read(
        'src/services/storefrontRecommendationService.js'
      );

    assert.doesNotMatch(
      source,
      /\baddItem\s*\(/
    );

    assert.doesNotMatch(
      source,
      /useCart\s*\(/
    );
  }
);

test(
  'legacy same-category alternative engine is removed',
  () => {
    const source =
      read(
        'src/services/storefrontProductService.js'
      );

    assert.doesNotMatch(
      source,
      /export async function getAlternatives/
    );

    assert.doesNotMatch(
      source,
      /same category/i
    );

    assert.doesNotMatch(
      source,
      /alternativeProducts/
    );
  }
);

test(
  'product page uses governed recommendation results instead of mock alternatives',
  () => {
    const source =
      read(
        'src/pages/storefront/ProductPage.jsx'
      );

    assert.match(
      source,
      /getProductRecommendations/
    );

    assert.match(
      source,
      /SOURCE_IDENTITY_UNAVAILABLE/
    );

    assert.match(
      source,
      /No same-ingredient active, in-stock alternative/
    );

    assert.match(
      source,
      /does not bypass interaction checking/
    );

    assert.doesNotMatch(
      source,
      /Mock alternative recommendation logic/i
    );

    assert.doesNotMatch(
      source,
      /safer substitutions/i
    );

    assert.doesNotMatch(
      source,
      /alternativeProducts/
    );
  }
);

test(
  'prescription recommendations require confirmed lifecycle state',
  () => {
    const source =
      read(
        'src/pages/storefront/PrescriptionHistoryPage.jsx'
      );

    assert.match(
      source,
      /customer_verification_status[\s\S]*confirmed/
    );

    assert.match(
      source,
      /confirmation_required[\s\S]*false/
    );

    assert.match(
      source,
      /getPrescriptionRecommendations/
    );
  }
);

test(
  'review-required prescription flow remains separate',
  () => {
    const source =
      read(
        'src/pages/storefront/PrescriptionHistoryPage.jsx'
      );

    assert.match(
      source,
      /Extracted medicines awaiting confirmation/
    );

    assert.match(
      source,
      /Medicine recommendations/
    );

    assert.match(
      source,
      /Only same-ingredient catalogue matches are shown/
    );
  }
);

test(
  'prescription recommendation UI keeps DDI boundary explicit',
  () => {
    const source =
      read(
        'src/pages/storefront/PrescriptionHistoryPage.jsx'
      );

    assert.match(
      source,
      /does not bypass the cart interaction check/
    );

    assert.doesNotMatch(
      source,
      /safe substitute/i
    );

    assert.doesNotMatch(
      source,
      /clinically equivalent/i
    );
  }
);

test(
  'chat widget no longer claims pharmacist-reviewed substitution',
  () => {
    const source =
      read(
        'src/components/storefront/ChatWidget.jsx'
      );

    assert.doesNotMatch(
      source,
      /pharmacist-reviewed substitutes/i
    );

    assert.match(
      source,
      /same recorded ingredient/i
    );

    assert.match(
      source,
      /do not establish clinical equivalence/i
    );

    assert.match(
      source,
      /cart interaction checks still apply/i
    );
  }
);
