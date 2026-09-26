const {
  sequelize,
} = require('../config/database');

const {
  QueryTypes,
} = require('sequelize');

const ddiService =
  require('./ddiService');

const governedRegistry =
  require('../data/governedMedicineAlternatives.json');

const SCHEMA_VERSION =
  'medsense-interaction-aware-recommendation-v1';

const MAX_CART_PRODUCTS = 25;
const MAX_RECOMMENDATIONS = 10;

function recommendationError(
  code,
  message,
  status = 400
) {
  const error =
    new Error(message);

  error.code =
    code;

  error.status =
    status;

  return error;
}

function positiveInteger(
  value,
  code =
    'RECOMMENDATION_INVALID_PRODUCT_ID'
) {
  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw recommendationError(
      code,
      'A positive product id is required'
    );
  }

  return parsed;
}

function normalizeLimit(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return 5;
  }

  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    parsed > MAX_RECOMMENDATIONS
  ) {
    throw recommendationError(
      'RECOMMENDATION_INVALID_LIMIT',
      `Recommendation limit must be between 1 and ${MAX_RECOMMENDATIONS}`
    );
  }

  return parsed;
}

function normalizeCartProductIds(
  value
) {
  if (!Array.isArray(value)) {
    throw recommendationError(
      'RECOMMENDATION_INVALID_CART',
      'cart_product_ids must be an array'
    );
  }

  const ids =
    [
      ...new Set(
        value.map(
          (item) =>
            positiveInteger(
              item,
              'RECOMMENDATION_INVALID_CART_PRODUCT_ID'
            )
        )
      ),
    ];

  if (ids.length < 2) {
    throw recommendationError(
      'RECOMMENDATION_INVALID_CART',
      'Interaction-aware recommendation requires at least two cart products'
    );
  }

  if (
    ids.length >
    MAX_CART_PRODUCTS
  ) {
    throw recommendationError(
      'RECOMMENDATION_INVALID_CART',
      `Cart cannot contain more than ${MAX_CART_PRODUCTS} unique products for this check`
    );
  }

  return ids;
}

function normalizeText(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      ' '
    );
}

function ingredientIdentity(
  product
) {
  return normalizeText(
    product?.product_salt ||
    product?.product_generic_name
  );
}

function mapProduct(
  row
) {
  return {
    product_id:
      Number(
        row.product_id
      ),

    product_title:
      row.product_title ||
      null,

    product_generic_name:
      row.product_generic_name ||
      null,

    product_salt:
      row.product_salt ||
      null,

    product_category:
      row.product_category ||
      null,

    product_price:
      row.product_price === null
        ? null
        : Number(
            row.product_price
          ),

    product_pack_price:
      row.product_pack_price === null
        ? null
        : Number(
            row.product_pack_price
          ),

    product_discount:
      row.product_discount === null
        ? null
        : Number(
            row.product_discount
          ),

    product_requires_rx:
      Boolean(
        row.product_requires_rx
      ),

    product_status:
      Number(
        row.product_status
      ),

    available_stock:
      Number(
        row.available_stock || 0
      ),
  };
}

async function loadProductsByIds(
  productIds
) {
  if (
    !Array.isArray(productIds) ||
    productIds.length === 0
  ) {
    return [];
  }

  const rows =
    await sequelize.query(
      `
        SELECT
          p.product_id,
          p.product_title,
          p.product_generic_name,
          p.product_salt,
          p.product_category,
          p.product_price,
          p.product_pack_price,
          p.product_discount,
          p.product_requires_rx,
          p.product_status,

          COALESCE(
            SUM(
              CASE
                WHEN
                  sh.expiry_date >= CURRENT_DATE
                  AND
                  sh.remaining_quantity > 0
                THEN
                  sh.remaining_quantity
                ELSE
                  0
              END
            ),
            0
          )::int AS available_stock

        FROM product p

        LEFT JOIN stock_history sh
          ON sh.product_id =
             p.product_id
         AND sh.status = 1

        WHERE
          p.product_status = 1
          AND
          p.product_id IN (:productIds)

        GROUP BY
          p.product_id,
          p.product_title,
          p.product_generic_name,
          p.product_salt,
          p.product_category,
          p.product_price,
          p.product_pack_price,
          p.product_discount,
          p.product_requires_rx,
          p.product_status

        ORDER BY
          p.product_id
      `,
      {
        replacements: {
          productIds,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  return rows.map(
    mapProduct
  );
}

function toDdiProduct(
  product
) {
  return {
    product_id:
      Number(
        product.product_id
      ),

    product_title:
      product.product_title ||
      null,

    product_generic_name:
      product.product_generic_name ||
      null,

    product_salt:
      product.product_salt ||
      null,

    product_requires_rx:
      product.product_requires_rx ==
      null
        ? null
        : Boolean(
            product.product_requires_rx
          ),

    product_status:
      Number(
        product.product_status
      ),
  };
}

function summarizeDdi(
  response
) {
  const result =
    response?.result &&
    typeof response.result ===
      'object'
      ? response.result
      : response;

  return {
    status:
      result?.status ||
      null,

    checkout_allowed:
      result?.checkout_allowed ===
      true,

    review_required:
      result?.review_required ===
      true,

    pharmacist_flag_required:
      result?.pharmacist_flag_required ===
      true,

    highest_severity:
      result?.highest_severity ??
      null,

    workflow_action:
      result?.workflow_action ||
      null,

    pairs:
      Array.isArray(
        result?.pairs
      )
        ? result.pairs
        : [],
  };
}

function isNonMinorExactInteraction(
  pair
) {
  if (
    pair?.interaction_found !==
    true
  ) {
    return false;
  }

  const severity =
    normalizeText(
      pair?.severity
    );

  if (!severity) {
    return true;
  }

  return severity !==
    'minor';
}

function hasHarmfulExactInteraction(
  ddi
) {
  return (
    Array.isArray(
      ddi?.pairs
    ) &&
    ddi.pairs.some(
      isNonMinorExactInteraction
    )
  );
}

function pairContainsProduct(
  pair,
  productId
) {
  const target =
    Number(
      productId
    );

  const sideA =
    Array.isArray(
      pair?.product_ids_a
    )
      ? pair.product_ids_a
      : [];

  const sideB =
    Array.isArray(
      pair?.product_ids_b
    )
      ? pair.product_ids_b
      : [];

  return [
    ...sideA,
    ...sideB,
  ].some(
    (value) =>
      Number(value) ===
      target
  );
}

function sourceHasHarmfulExactInteraction(
  ddi,
  sourceProductId
) {
  return (
    Array.isArray(
      ddi?.pairs
    ) &&
    ddi.pairs.some(
      (pair) =>
        isNonMinorExactInteraction(
          pair
        ) &&
        pairContainsProduct(
          pair,
          sourceProductId
        )
    )
  );
}

function candidateDdiCleared(
  ddi
) {
  return (
    ddi?.status ===
      'CLEAR_WITH_LIMITATIONS' &&
    ddi?.checkout_allowed ===
      true &&
    ddi?.review_required ===
      false &&
    ddi?.pharmacist_flag_required ===
      false &&
    !hasHarmfulExactInteraction(
      ddi
    )
  );
}

function validGovernedMapping(
  mapping,
  sourceProductId
) {
  return (
    mapping &&
    Number(
      mapping.source_product_id
    ) ===
      sourceProductId &&
    Array.isArray(
      mapping.candidate_product_ids
    ) &&
    mapping.candidate_product_ids.length >
      0 &&
    typeof mapping.approval_reference ===
      'string' &&
    mapping.approval_reference.trim().length >
      0
  );
}

function findGovernedMapping(
  registry,
  sourceProductId
) {
  const mappings =
    Array.isArray(
      registry?.mappings
    )
      ? registry.mappings
      : [];

  return (
    mappings.find(
      (mapping) =>
        validGovernedMapping(
          mapping,
          sourceProductId
        )
    ) ||
    null
  );
}

function governanceView(
  mapping
) {
  return {
    approval_reference:
      mapping.approval_reference,

    approved_by:
      mapping.approved_by ||
      null,

    reviewed_at:
      mapping.reviewed_at ||
      null,
  };
}

function baseResponse(
  {
    source,
    baselineDdi,
    status,
    reason,
    recommendations = [],
    message,
  }
) {
  return {
    schema_version:
      SCHEMA_VERSION,

    source_type:
      'ddi_interaction',

    status,

    reason,

    source_product:
      source,

    baseline_ddi:
      {
        status:
          baselineDdi.status,

        checkout_allowed:
          baselineDdi.checkout_allowed,

        review_required:
          baselineDdi.review_required,

        pharmacist_flag_required:
          baselineDdi.pharmacist_flag_required,

        highest_severity:
          baselineDdi.highest_severity,

        workflow_action:
          baselineDdi.workflow_action,
      },

    recommendations,

    recommendation_count:
      recommendations.length,

    requires_pharmacist_confirmation:
      true,

    message,

    limitations: [
      'Only explicit pharmacist- or pharmacy-governed product mappings may enter this workflow.',
      'Same-salt, same-generic, category similarity, brand similarity, language models, and DDI model scores are not used to infer therapeutic substitution.',
      'A candidate is shown only after the authoritative cart DDI workflow returns CLEAR for the simulated replacement.',
      'A CLEAR DDI re-check does not establish dose equivalence, therapeutic equivalence, diagnosis suitability, or clinical substitutability.',
      'A pharmacist must confirm any actual substitution.',
    ],
  };
}

async function recommendForInteraction(
  input,
  dependencies = {}
) {
  const sourceProductId =
    positiveInteger(
      input?.sourceProductId
    );

  const cartProductIds =
    normalizeCartProductIds(
      input?.cartProductIds
    );

  const limit =
    normalizeLimit(
      input?.limit
    );

  if (
    !cartProductIds.includes(
      sourceProductId
    )
  ) {
    throw recommendationError(
      'RECOMMENDATION_SOURCE_NOT_IN_CART',
      'Source product must be present in the current cart'
    );
  }

  const registry =
    dependencies.registry ||
    governedRegistry;

  const mapping =
    findGovernedMapping(
      registry,
      sourceProductId
    );

  const governedCandidateIds =
    mapping
      ? [
          ...new Set(
            mapping.candidate_product_ids.map(
              (candidateId) =>
                positiveInteger(
                  candidateId,
                  'RECOMMENDATION_INVALID_GOVERNED_CANDIDATE'
                )
            )
          ),
        ]
      : [];

  const idsToLoad =
    [
      ...new Set([
        ...cartProductIds,
        ...governedCandidateIds,
      ]),
    ];

  const loadProducts =
    dependencies.loadProducts ||
    loadProductsByIds;

  const checkCart =
    dependencies.checkCart ||
    ddiService.checkCart;

  const products =
    await loadProducts(
      idsToLoad
    );

  const byId =
    new Map(
      products.map(
        (product) => [
          Number(
            product.product_id
          ),
          product,
        ]
      )
    );

  const cartProducts =
    cartProductIds.map(
      (productId) =>
        byId.get(
          productId
        )
    );

  if (
    cartProducts.some(
      (product) =>
        !product
    )
  ) {
    throw recommendationError(
      'RECOMMENDATION_CART_PRODUCT_UNAVAILABLE',
      'One or more cart products are not active authoritative catalogue products',
      409
    );
  }

  const source =
    byId.get(
      sourceProductId
    );

  if (!source) {
    throw recommendationError(
      'RECOMMENDATION_PRODUCT_NOT_FOUND',
      'Active source product not found',
      404
    );
  }

  const baselineRaw =
    await checkCart(
      cartProducts.map(
        toDdiProduct
      )
    );

  const baselineDdi =
    summarizeDdi(
      baselineRaw
    );

  const harmfulExactInteraction =
    hasHarmfulExactInteraction(
      baselineDdi
    );

  if (
    !harmfulExactInteraction &&
    baselineDdi.review_required !==
      true &&
    baselineDdi.checkout_allowed ===
      true
  ) {
    return baseResponse({
      source,
      baselineDdi,

      status:
        'NO_INTERACTION_ALTERNATIVE_NEEDED',

      reason:
        'NO_HARMFUL_EXACT_INTERACTION',

      message:
        'The authoritative DDI workflow does not currently require an interaction-driven alternative for this cart.',
    });
  }

  if (
    !harmfulExactInteraction
  ) {
    return baseResponse({
      source,
      baselineDdi,

      status:
        'PHARMACIST_REVIEW_REQUIRED',

      reason:
        'DDI_REVIEW_WITHOUT_EXACT_INTERACTION',

      message:
        'The cart requires governed DDI review, but there is not enough exact interaction evidence to generate an interaction-driven alternative. Pharmacist review is required.',
    });
  }

  if (
    !sourceHasHarmfulExactInteraction(
      baselineDdi,
      sourceProductId
    )
  ) {
    return baseResponse({
      source,
      baselineDdi,

      status:
        'PHARMACIST_REVIEW_REQUIRED',

      reason:
        'SOURCE_NOT_IN_HARMFUL_DDI_PAIR',

      message:
        'A harmful interaction exists in the cart, but the selected source medicine is not part of that harmful pair. No substitution recommendation was generated.',
    });
  }

  if (!mapping) {
    return baseResponse({
      source,
      baselineDdi,

      status:
        'PHARMACIST_REVIEW_REQUIRED',

      reason:
        'NO_GOVERNED_ALTERNATIVE_MAPPING',

      message:
        'No pharmacist-governed therapeutic alternative mapping is available for this medicine. Pharmacist review is required.',
    });
  }

  const sourceIdentity =
    ingredientIdentity(
      source
    );

  const eligibleCandidates =
    governedCandidateIds
      .map(
        (candidateId) =>
          byId.get(
            candidateId
          )
      )
      .filter(Boolean)
      .filter(
        (candidate) =>
          Number(
            candidate.product_id
          ) !==
            sourceProductId &&
          Number(
            candidate.product_status
          ) ===
            1 &&
          Number(
            candidate.available_stock
          ) >
            0
      )
      .filter(
        (candidate) => {
          const candidateIdentity =
            ingredientIdentity(
              candidate
            );

          return (
            candidateIdentity &&
            sourceIdentity &&
            candidateIdentity !==
              sourceIdentity
          );
        }
      )
      .slice(
        0,
        limit
      );

  if (
    eligibleCandidates.length ===
    0
  ) {
    return baseResponse({
      source,
      baselineDdi,

      status:
        'PHARMACIST_REVIEW_REQUIRED',

      reason:
        'NO_ELIGIBLE_GOVERNED_ALTERNATIVE',

      message:
        'Governed mappings exist, but no mapped different-ingredient alternative is currently active and in stock. Pharmacist review is required.',
    });
  }

  const cleared =
    [];

  for (
    const candidate
    of eligibleCandidates
  ) {
    const simulatedCart =
      cartProducts.map(
        (product) =>
          Number(
            product.product_id
          ) ===
          sourceProductId
            ? candidate
            : product
      );

    let recheckRaw;

    try {
      recheckRaw =
        await checkCart(
          simulatedCart.map(
            toDdiProduct
          )
        );
    } catch {
      continue;
    }

    const ddiRecheck =
      summarizeDdi(
        recheckRaw
      );

    if (
      !candidateDdiCleared(
        ddiRecheck
      )
    ) {
      continue;
    }

    cleared.push({
      ...candidate,

      recommendation_basis:
        'GOVERNED_MAPPING_DDI_RECHECK',

      governance:
        governanceView(
          mapping
        ),

      ddi_recheck: {
        status:
          ddiRecheck.status,

        checkout_allowed:
          ddiRecheck.checkout_allowed,

        review_required:
          ddiRecheck.review_required,

        pharmacist_flag_required:
          ddiRecheck.pharmacist_flag_required,

        highest_severity:
          ddiRecheck.highest_severity,

        workflow_action:
          ddiRecheck.workflow_action,
      },

      requires_pharmacist_confirmation:
        true,
    });
  }

  if (
    cleared.length ===
    0
  ) {
    return baseResponse({
      source,
      baselineDdi,

      status:
        'PHARMACIST_REVIEW_REQUIRED',

      reason:
        'NO_GOVERNED_ALTERNATIVE_CLEARED_DDI_RECHECK',

      message:
        'No governed candidate cleared the authoritative DDI re-check for the current cart. Pharmacist review is required.',
    });
  }

  return baseResponse({
    source,
    baselineDdi,

    status:
      'INTERACTION_CHECKED_ALTERNATIVES_AVAILABLE',

    reason:
      'GOVERNED_CANDIDATE_DDI_CLEAR',

    recommendations:
      cleared,

    message:
      'Governed alternative candidate(s) cleared the current cart DDI re-check. Pharmacist confirmation is still required before substitution.',
  });
}

module.exports = {
  recommendForInteraction,

  _private: {
    normalizeCartProductIds,
    ingredientIdentity,
    toDdiProduct,
    summarizeDdi,
    hasHarmfulExactInteraction,
    pairContainsProduct,
    sourceHasHarmfulExactInteraction,
    candidateDdiCleared,
    findGovernedMapping,
  },
};