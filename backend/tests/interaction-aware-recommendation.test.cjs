const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const service =
  require(
    '../src/services/interactionAwareRecommendationService'
  );

function product(
  id,
  salt,
  stock = 10,
  status = 1
) {
  return {
    product_id:
      id,

    product_title:
      `Product ${id}`,

    product_generic_name:
      salt,

    product_salt:
      salt,

    product_category:
      'Test',

    product_price:
      10,

    product_pack_price:
      10,

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

function blockedDdi() {
  return {
    httpStatus:
      200,

    result: {
      status:
        'WARNING_REVIEW_REQUIRED',

      checkout_allowed:
        false,

      review_required:
        true,

      pharmacist_flag_required:
        true,

      highest_severity:
        'Major',

      workflow_action:
        'BLOCK_AND_REVIEW',

      pairs: [
        {
          product_ids_a:
            [1],

          product_ids_b:
            [2],

          interaction_found:
            true,

          severity:
            'Major',
        },
      ],
    },
  };
}

function clearDdi() {
  return {
    httpStatus:
      200,

    result: {
      status:
        'CLEAR_WITH_LIMITATIONS',

      checkout_allowed:
        true,

      review_required:
        false,

      pharmacist_flag_required:
        false,

      highest_severity:
        null,

      workflow_action:
        'ALLOW',

      pairs:
        [],
    },
  };
}

const cart =
  [
    product(
      1,
      'ibuprofen'
    ),

    product(
      2,
      'aspirin'
    ),

    product(
      3,
      'acetaminophen'
    ),
  ];

test(
  'harmful DDI without governed mapping fails closed to pharmacist review',
  async () => {
    let checks = 0;

    const result =
      await service
        .recommendForInteraction(
          {
            sourceProductId:
              1,

            cartProductIds:
              [1, 2],
          },
          {
            registry: {
              mappings:
                [],
            },

            loadProducts:
              async () =>
                cart,

            checkCart:
              async () => {
                checks += 1;

                return blockedDdi();
              },
          }
        );

    assert.equal(
      result.status,
      'PHARMACIST_REVIEW_REQUIRED'
    );

    assert.equal(
      result.reason,
      'NO_GOVERNED_ALTERNATIVE_MAPPING'
    );

    assert.equal(
      result.recommendation_count,
      0
    );

    assert.equal(
      checks,
      1
    );
  }
);

test(
  'governed different-ingredient candidate must clear authoritative DDI re-check',
  async () => {
    let checks = 0;

    const result =
      await service
        .recommendForInteraction(
          {
            sourceProductId:
              1,

            cartProductIds:
              [1, 2],
          },
          {
            registry: {
              mappings: [
                {
                  source_product_id:
                    1,

                  candidate_product_ids:
                    [3],

                  approval_reference:
                    'TEST-PHARMACY-APPROVAL-001',

                  approved_by:
                    'contract-test-pharmacist',

                  reviewed_at:
                    '2026-09-24',
                },
              ],
            },

            loadProducts:
              async () =>
                cart,

            checkCart:
              async () => {
                checks += 1;

                return checks === 1
                  ? blockedDdi()
                  : clearDdi();
              },
          }
        );

    assert.equal(
      result.status,
      'INTERACTION_CHECKED_ALTERNATIVES_AVAILABLE'
    );

    assert.equal(
      result.recommendation_count,
      1
    );

    assert.equal(
      result.recommendations[0]
        .product_id,
      3
    );

    assert.equal(
      result.recommendations[0]
        .ddi_recheck.status,
      'CLEAR_WITH_LIMITATIONS'
    );

    assert.equal(
      result.requires_pharmacist_confirmation,
      true
    );

    assert.equal(
      checks,
      2
    );
  }
);

test(
  'candidate that does not clear DDI is never returned',
  async () => {
    const result =
      await service
        .recommendForInteraction(
          {
            sourceProductId:
              1,

            cartProductIds:
              [1, 2],
          },
          {
            registry: {
              mappings: [
                {
                  source_product_id:
                    1,

                  candidate_product_ids:
                    [3],

                  approval_reference:
                    'TEST-PHARMACY-APPROVAL-002',
                },
              ],
            },

            loadProducts:
              async () =>
                cart,

            checkCart:
              async () =>
                blockedDdi(),
          }
        );

    assert.equal(
      result.status,
      'PHARMACIST_REVIEW_REQUIRED'
    );

    assert.equal(
      result.reason,
      'NO_GOVERNED_ALTERNATIVE_CLEARED_DDI_RECHECK'
    );

    assert.equal(
      result.recommendation_count,
      0
    );
  }
);

test(
  'same-ingredient mapped product is excluded from DDI alternative workflow',
  async () => {
    const sameIngredientProducts =
      [
        product(
          1,
          'ibuprofen'
        ),

        product(
          2,
          'aspirin'
        ),

        product(
          4,
          'ibuprofen'
        ),
      ];

    const result =
      await service
        .recommendForInteraction(
          {
            sourceProductId:
              1,

            cartProductIds:
              [1, 2],
          },
          {
            registry: {
              mappings: [
                {
                  source_product_id:
                    1,

                  candidate_product_ids:
                    [4],

                  approval_reference:
                    'TEST-PHARMACY-APPROVAL-003',
                },
              ],
            },

            loadProducts:
              async () =>
                sameIngredientProducts,

            checkCart:
              async () =>
                blockedDdi(),
          }
        );

    assert.equal(
      result.reason,
      'NO_ELIGIBLE_GOVERNED_ALTERNATIVE'
    );

    assert.equal(
      result.recommendation_count,
      0
    );
  }
);

test(
  'clear cart does not invent an interaction-driven alternative',
  async () => {
    const result =
      await service
        .recommendForInteraction(
          {
            sourceProductId:
              1,

            cartProductIds:
              [1, 2],
          },
          {
            registry: {
              mappings: [
                {
                  source_product_id:
                    1,

                  candidate_product_ids:
                    [3],

                  approval_reference:
                    'TEST-PHARMACY-APPROVAL-004',
                },
              ],
            },

            loadProducts:
              async () =>
                cart,

            checkCart:
              async () =>
                clearDdi(),
          }
        );

    assert.equal(
      result.status,
      'NO_INTERACTION_ALTERNATIVE_NEEDED'
    );

    assert.equal(
      result.recommendation_count,
      0
    );
  }
);

test(
  'source outside harmful pair never receives an interaction-driven alternative',
  async () => {
    let checks = 0;

    const products =
      [
        product(
          1,
          'ibuprofen'
        ),

        product(
          2,
          'aspirin'
        ),

        product(
          3,
          'acetaminophen'
        ),

        product(
          4,
          'naproxen'
        ),
      ];

    const result =
      await service
        .recommendForInteraction(
          {
            sourceProductId:
              3,

            cartProductIds:
              [1, 2, 3],
          },
          {
            registry: {
              mappings: [
                {
                  source_product_id:
                    3,

                  candidate_product_ids:
                    [4],

                  approval_reference:
                    'TEST-PHARMACY-APPROVAL-PAIR-GUARD',
                },
              ],
            },

            loadProducts:
              async () =>
                products,

            checkCart:
              async () => {
                checks += 1;

                return blockedDdi();
              },
          }
        );

    assert.equal(
      result.status,
      'PHARMACIST_REVIEW_REQUIRED'
    );

    assert.equal(
      result.reason,
      'SOURCE_NOT_IN_HARMFUL_DDI_PAIR'
    );

    assert.equal(
      result.recommendation_count,
      0
    );

    assert.equal(
      checks,
      1
    );
  }
);

test(
  'DDI receives only strict PartnerProductRecord fields',
  async () => {
    let received =
      null;

    await service
      .recommendForInteraction(
        {
          sourceProductId:
            1,

          cartProductIds:
            [1, 2],
        },
        {
          registry: {
            mappings:
              [],
          },

          loadProducts:
            async () =>
              cart,

          checkCart:
            async (
              products
            ) => {
              received =
                products;

              return blockedDdi();
            },
        }
      );

    assert.ok(
      Array.isArray(
        received
      )
    );

    assert.equal(
      received.length,
      2
    );

    const allowed =
      [
        'product_generic_name',
        'product_id',
        'product_requires_rx',
        'product_salt',
        'product_status',
        'product_title',
      ];

    for (
      const item
      of received
    ) {
      assert.deepEqual(
        Object.keys(item)
          .sort(),
        allowed
      );
    }
  }
);

test(
  'production governed registry is empty by default and cannot fake clinical mappings',
  () => {
    const registry =
      require(
        '../src/data/governedMedicineAlternatives.json'
      );

    assert.equal(
      registry.schema_version,
      'medsense-governed-alternatives-v1'
    );

    assert.deepEqual(
      registry.mappings,
      []
    );
  }
);

test(
  'route exposes additive interaction-aware recommendation contract',
  () => {
    const routes =
      fs.readFileSync(
        path.join(
          __dirname,
          '../src/routes/medicineRecommendationRoutes.js'
        ),
        'utf8'
      );

    const controller =
      fs.readFileSync(
        path.join(
          __dirname,
          '../src/controllers/medicineRecommendationController.js'
        ),
        'utf8'
      );

    assert.match(
      routes,
      /products\/:productId\/interaction-aware/
    );

    assert.match(
      routes,
      /recommendationController\.interactionAware/
    );

    assert.match(
      controller,
      /recommendForInteraction/
    );
  }
);