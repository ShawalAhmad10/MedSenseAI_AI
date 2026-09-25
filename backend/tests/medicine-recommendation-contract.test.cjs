const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const recommendationService =
  require('../src/services/medicineRecommendationService');

const {
  selectAlternatives,
  chooseIdentity,
  exactNameMatches,
} = recommendationService._private;

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      __dirname,
      '..',
      relativePath
    ),
    'utf8'
  );
}

function product({
  id,
  salt,
  generic,
  stock = 10,
  status = 1,
}) {
  return {
    product_id: id,
    product_title:
      `Product ${id}`,
    product_generic_name:
      generic ?? null,
    product_salt:
      salt ?? null,
    product_category:
      'Test',
    product_price:
      100,
    product_pack_price:
      null,
    product_discount:
      0,
    product_requires_rx:
      false,
    product_status:
      status,
    available_stock:
      stock,
  };
}

test(
  'same salt is the primary recommendation identity',
  () => {
    const identity =
      chooseIdentity(
        product({
          id: 1,
          salt: 'Digoxin',
          generic:
            'Digoxin Generic',
        })
      );

    assert.deepEqual(
      identity,
      {
        basis:
          'SAME_SALT',
        identity:
          'digoxin',
      }
    );
  }
);

test(
  'generic is used only when salt identity is absent',
  () => {
    const identity =
      chooseIdentity(
        product({
          id: 1,
          salt: null,
          generic:
            'Metformin',
        })
      );

    assert.equal(
      identity.basis,
      'SAME_GENERIC'
    );

    assert.equal(
      identity.identity,
      'metformin'
    );
  }
);

test(
  'same-category different-ingredient medicine is never an alternative',
  () => {
    const source =
      product({
        id: 1,
        salt:
          'Digoxin',
        generic:
          'Digoxin',
      });

    const result =
      selectAlternatives(
        source,
        [
          source,

          product({
            id: 2,
            salt:
              'Warfarin',
            generic:
              'Warfarin',
          }),
        ]
      );

    assert.equal(
      result.status,
      'NO_ALTERNATIVES'
    );

    assert.equal(
      result.recommendations.length,
      0
    );
  }
);

test(
  'same-salt active in-stock products are eligible alternatives',
  () => {
    const source =
      product({
        id: 1,
        salt:
          'Digoxin',
        generic:
          'Digoxin',
      });

    const result =
      selectAlternatives(
        source,
        [
          source,

          product({
            id: 2,
            salt:
              ' digoxin ',
            generic:
              'Brand Digoxin',
            stock: 5,
          }),
        ]
      );

    assert.equal(
      result.status,
      'ALTERNATIVES_FOUND'
    );

    assert.equal(
      result.match_basis,
      'SAME_SALT'
    );

    assert.deepEqual(
      result.recommendations.map(
        (item) =>
          item.product_id
      ),
      [2]
    );
  }
);

test(
  'inactive and out-of-stock candidates are excluded',
  () => {
    const source =
      product({
        id: 1,
        salt:
          'Digoxin',
        generic:
          'Digoxin',
      });

    const result =
      selectAlternatives(
        source,
        [
          source,

          product({
            id: 2,
            salt:
              'Digoxin',
            generic:
              'Digoxin',
            stock: 0,
          }),

          product({
            id: 3,
            salt:
              'Digoxin',
            generic:
              'Digoxin',
            status: 0,
          }),
        ]
      );

    assert.equal(
      result.recommendations.length,
      0
    );
  }
);

test(
  'source without salt or generic fails closed',
  () => {
    const source =
      product({
        id: 1,
        salt: null,
        generic: null,
      });

    const result =
      selectAlternatives(
        source,
        [source]
      );

    assert.equal(
      result.status,
      'SOURCE_IDENTITY_UNAVAILABLE'
    );
  }
);

test(
  'corrected or manual confirmed names use exact catalogue identity only',
  () => {
    const products = [
      product({
        id: 1,
        salt:
          'Digoxin',
        generic:
          'Digoxin',
      }),

      product({
        id: 2,
        salt:
          'Warfarin',
        generic:
          'Warfarin',
      }),
    ];

    assert.deepEqual(
      exactNameMatches(
        ' digoxin ',
        products
      ).map(
        (item) =>
          item.product_id
      ),
      [1]
    );

    assert.deepEqual(
      exactNameMatches(
        'cardiac medicine',
        products
      ),
      []
    );
  }
);

test(
  'product recommendation route is public but prescription route requires customer auth',
  () => {
    const routes =
      read(
        'src/routes/medicineRecommendationRoutes.js'
      );

    assert.match(
      routes,
      /'\/products\/:productId'[\s\S]*recommendationController\.byProduct/
    );

    assert.match(
      routes,
      /'\/prescriptions\/:prescriptionId'[\s\S]*verifyCustomerToken[\s\S]*recommendationController\.byPrescription/
    );
  }
);

test(
  'recommendation service is read-only and contains no commerce mutation',
  () => {
    const source =
      read(
        'src/services/medicineRecommendationService.js'
      );

    assert.doesNotMatch(
      source,
      /\bINSERT\s+INTO\b/i
    );

    assert.doesNotMatch(
      source,
      /\bUPDATE\s+(invoice|orders?|stock_history|product)\b/i
    );

    assert.doesNotMatch(
      source,
      /\bDELETE\s+FROM\b/i
    );
  }
);

test(
  'recommendation contract does not claim clinical safety or equivalence',
  () => {
    const source =
      read(
        'src/services/medicineRecommendationService.js'
      );

    assert.match(
      source,
      /clinical substitutability are not established/
    );

    assert.match(
      source,
      /authoritative DDI checkout gate/
    );

    assert.doesNotMatch(
      source,
      /guaranteed safe/i
    );

    assert.doesNotMatch(
      source,
      /clinically equivalent/i
    );
  }
);

test(
  'server exposes recommendation API',
  () => {
    const server =
      read(
        'src/server.js'
      );

    assert.match(
      server,
      /app\.use\('\/api\/recommendations',\s*medicineRecommendationRoutes\)/
    );
  }
);
