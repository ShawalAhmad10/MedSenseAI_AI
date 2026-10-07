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
  normalizeSaltComposition,
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
  'in-stock source does not suppress same-salt alternatives',
  () => {
    const source = product({
      id: 1,
      salt: 'Paracetamol 500mg',
      stock: 20,
    });
    const result = selectAlternatives(source, [
      source,
      product({ id: 2, salt: 'Paracetamol 500mg', stock: 5 }),
    ]);

    assert.deepEqual(
      result.recommendations.map((item) => item.product_id),
      [2]
    );
  }
);

test(
  'out-of-stock source can still discover an available same-salt product',
  () => {
    const source = product({
      id: 1,
      salt: 'Paracetamol 500mg',
      stock: 0,
      status: 0,
    });
    const result = selectAlternatives(source, [
      source,
      product({ id: 2, salt: 'Paracetamol 500mg', stock: 4 }),
    ]);

    assert.deepEqual(
      result.recommendations.map((item) => item.product_id),
      [2]
    );
  }
);

test(
  'complete combination composition is order-insensitive but partial overlap is rejected',
  () => {
    assert.equal(
      normalizeSaltComposition('Amoxicillin + Clavulanic Acid'),
      normalizeSaltComposition('Clavulanic Acid + Amoxicillin')
    );
    assert.notEqual(
      normalizeSaltComposition('Amoxicillin + Clavulanic Acid'),
      normalizeSaltComposition('Amoxicillin')
    );

    const source = product({
      id: 1,
      salt: 'Amoxicillin + Clavulanic Acid',
    });
    const result = selectAlternatives(source, [
      source,
      product({ id: 2, salt: 'Clavulanic Acid + Amoxicillin' }),
      product({ id: 3, salt: 'Amoxicillin' }),
    ]);

    assert.deepEqual(
      result.recommendations.map((item) => item.product_id),
      [2]
    );
  }
);

test(
  'salt strength and slash notation remain exact and are not inferred',
  () => {
    assert.notEqual(
      normalizeSaltComposition('Paracetamol 500mg'),
      normalizeSaltComposition('Paracetamol 250mg')
    );
    assert.notEqual(
      normalizeSaltComposition('Cefixime 100mg/5ml'),
      normalizeSaltComposition('Cefixime 100mg')
    );
  }
);

test(
  'authoritative selection replaces the source and reruns existing DDI on the final cart',
  async () => {
    const source = product({ id: 1, salt: 'Paracetamol 500mg' });
    const alternative = product({ id: 2, salt: 'Paracetamol 500mg' });
    const other = product({ id: 3, salt: 'Ibuprofen 400mg' });
    let receivedProducts;

    const result = await recommendationService.validateAlternativeSelection(
      {
        sourceProductId: 1,
        alternativeProductId: 2,
        cartItems: [
          { product_id: 1, quantity: 1 },
          { product_id: 3, quantity: 1 },
        ],
      },
      {
        products: [source, alternative, other],
        checkCart: async (products) => {
          receivedProducts = products;
          return {
            httpStatus: 200,
            result: {
              status: 'CLEAR_WITH_LIMITATIONS',
              checkout_allowed: true,
              review_required: false,
            },
          };
        },
      }
    );

    assert.deepEqual(
      receivedProducts.map((item) => item.product_id),
      [2, 3]
    );
    assert.deepEqual(result.final_cart, [
      { product_id: 2, quantity: 1 },
      { product_id: 3, quantity: 1 },
    ]);
    assert.equal(result.ddi.checkout_allowed, true);
  }
);

test(
  'selection rejects spoofed salt and stale unavailable candidates',
  async () => {
    const source = product({ id: 1, salt: 'Paracetamol 500mg' });
    const wrongSalt = product({ id: 2, salt: 'Ibuprofen 400mg' });
    const noStock = product({ id: 3, salt: 'Paracetamol 500mg', stock: 0 });
    const input = {
      sourceProductId: 1,
      cartItems: [{ product_id: 1, quantity: 1, product_salt: 'spoofed' }],
    };

    await assert.rejects(
      recommendationService.validateAlternativeSelection(
        { ...input, alternativeProductId: 2 },
        { products: [source, wrongSalt] }
      ),
      (error) => error.code === 'RECOMMENDATION_SALT_MISMATCH'
    );
    await assert.rejects(
      recommendationService.validateAlternativeSelection(
        { ...input, alternativeProductId: 3 },
        { products: [source, noStock] }
      ),
      (error) => error.code === 'RECOMMENDATION_ALTERNATIVE_UNAVAILABLE'
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
      /'\/products\/:productId\/select'[\s\S]*recommendationController\.selectAlternative/
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
