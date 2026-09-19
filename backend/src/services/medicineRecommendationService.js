const {
  QueryTypes,
} = require('sequelize');

const {
  sequelize,
} = require('../models');

const SCHEMA_VERSION =
  'medicine-recommendation-v1';

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;

const LIMITATION =
  'Recommendations are catalogue matches based on the same recorded active ingredient identity. Strength, dosage form, dose equivalence, therapeutic equivalence, and clinical substitutability are not established. Any cart change remains subject to the authoritative DDI checkout gate.';

function recommendationError(
  code,
  message,
  status = 400
) {
  const error =
    new Error(message);

  error.code = code;
  error.status = status;

  return error;
}

function positiveInteger(
  value,
  code = 'RECOMMENDATION_INVALID_PRODUCT_ID'
) {
  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw recommendationError(
      code,
      'A positive integer identifier is required',
      400
    );
  }

  return parsed;
}

function normalizeText(value) {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeLimit(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return DEFAULT_LIMIT;
  }

  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_LIMIT
  ) {
    throw recommendationError(
      'RECOMMENDATION_INVALID_LIMIT',
      `limit must be between 1 and ${MAX_LIMIT}`,
      400
    );
  }

  return parsed;
}

function mapProduct(row) {
  return {
    product_id:
      Number(row.product_id),

    product_title:
      row.product_title || '',

    product_generic_name:
      row.product_generic_name || null,

    product_salt:
      row.product_salt || null,

    product_category:
      row.product_category || null,

    product_price:
      Number(row.product_price || 0),

    product_pack_price:
      row.product_pack_price === null ||
      row.product_pack_price === undefined
        ? null
        : Number(
            row.product_pack_price
          ),

    product_discount:
      Number(
        row.product_discount || 0
      ),

    product_requires_rx:
      row.product_requires_rx === true,

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

function chooseIdentity(product) {
  const salt =
    normalizeText(
      product.product_salt
    );

  if (salt) {
    return {
      basis:
        'SAME_SALT',

      identity:
        salt,
    };
  }

  const generic =
    normalizeText(
      product.product_generic_name
    );

  if (generic) {
    return {
      basis:
        'SAME_GENERIC',

      identity:
        generic,
    };
  }

  return {
    basis: null,
    identity: '',
  };
}

function sameIdentity(
  candidate,
  sourceIdentity
) {
  if (
    sourceIdentity.basis ===
      'SAME_SALT'
  ) {
    return (
      normalizeText(
        candidate.product_salt
      ) ===
      sourceIdentity.identity
    );
  }

  if (
    sourceIdentity.basis ===
      'SAME_GENERIC'
  ) {
    return (
      normalizeText(
        candidate.product_generic_name
      ) ===
      sourceIdentity.identity
    );
  }

  return false;
}

function selectAlternatives(
  source,
  products,
  limitValue
) {
  const limit =
    normalizeLimit(
      limitValue
    );

  const sourceIdentity =
    chooseIdentity(source);

  if (!sourceIdentity.identity) {
    return {
      status:
        'SOURCE_IDENTITY_UNAVAILABLE',

      match_basis:
        null,

      recommendations:
        [],
    };
  }

  const recommendations =
    products
      .filter(
        (candidate) =>
          Number(
            candidate.product_id
          ) !==
            Number(
              source.product_id
            ) &&
          Number(
            candidate.product_status
          ) === 1 &&
          Number(
            candidate.available_stock
          ) > 0 &&
          sameIdentity(
            candidate,
            sourceIdentity
          )
      )
      .sort(
        (a, b) =>
          Number(a.product_id) -
          Number(b.product_id)
      )
      .slice(
        0,
        limit
      )
      .map(
        (candidate) => ({
          ...candidate,

          recommendation_basis:
            sourceIdentity.basis,
        })
      );

  return {
    status:
      recommendations.length > 0
        ? 'ALTERNATIVES_FOUND'
        : 'NO_ALTERNATIVES',

    match_basis:
      sourceIdentity.basis,

    recommendations,
  };
}

async function loadActiveProductSnapshot() {
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
                  sh.expiry_date >=
                    CURRENT_DATE
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

        WHERE p.product_status = 1

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

        ORDER BY p.product_id
      `,
      {
        type:
          QueryTypes.SELECT,
      }
    );

  return rows.map(
    mapProduct
  );
}

function mapProductRecommendation(
  source,
  result
) {
  const message =
    result.status ===
      'ALTERNATIVES_FOUND'
      ? 'Same-ingredient catalogue alternatives are available.'
      : result.status ===
          'SOURCE_IDENTITY_UNAVAILABLE'
        ? 'The selected product does not have enough authoritative ingredient identity to derive alternatives.'
        : 'No same-ingredient active in-stock alternative is currently available in the catalogue.';

  return {
    schema_version:
      SCHEMA_VERSION,

    source_type:
      'product',

    status:
      result.status,

    match_basis:
      result.match_basis,

    source_product:
      source,

    recommendations:
      result.recommendations,

    message,

    limitations: [
      LIMITATION,
    ],
  };
}

async function recommendByProductId(
  productIdValue,
  limitValue
) {
  const productId =
    positiveInteger(
      productIdValue
    );

  const products =
    await loadActiveProductSnapshot();

  const source =
    products.find(
      (product) =>
        Number(
          product.product_id
        ) === productId
    );

  if (!source) {
    throw recommendationError(
      'RECOMMENDATION_PRODUCT_NOT_FOUND',
      'Active source product not found',
      404
    );
  }

  const result =
    selectAlternatives(
      source,
      products,
      limitValue
    );

  return mapProductRecommendation(
    source,
    result
  );
}

function safeJsonObject(value) {
  if (
    value &&
    typeof value === 'object'
  ) {
    return value;
  }

  if (
    typeof value === 'string'
  ) {
    try {
      const parsed =
        JSON.parse(value);

      if (
        parsed &&
        typeof parsed === 'object'
      ) {
        return parsed;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function sourceProductIdForCandidate(
  aiResult,
  candidateId
) {
  if (
    !candidateId
  ) {
    return null;
  }

  const result =
    safeJsonObject(aiResult);

  const matches =
    Array.isArray(
      result.product_matches
    )
      ? result.product_matches
      : [];

  const entry =
    matches.find(
      (item) =>
        item &&
        item.candidate_id ===
          candidateId
    );

  const match =
    entry &&
    entry.product_match;

  if (
    !match ||
    match.status !==
      'UNIQUE_CANDIDATE' ||
    !Array.isArray(
      match.products
    ) ||
    match.products.length !== 1
  ) {
    return null;
  }

  const productId =
    Number(
      match.products[0]
        ?.product_id
    );

  if (
    !Number.isSafeInteger(
      productId
    ) ||
    productId <= 0
  ) {
    return null;
  }

  return productId;
}

function exactNameMatches(
  name,
  products,
  limitValue
) {
  const normalizedName =
    normalizeText(name);

  const limit =
    normalizeLimit(
      limitValue
    );

  if (!normalizedName) {
    return [];
  }

  return products
    .filter(
      (product) =>
        Number(
          product.product_status
        ) === 1 &&
        Number(
          product.available_stock
        ) > 0 &&
        (
          normalizeText(
            product.product_salt
          ) === normalizedName ||
          normalizeText(
            product.product_generic_name
          ) === normalizedName
        )
    )
    .sort(
      (a, b) =>
        Number(a.product_id) -
        Number(b.product_id)
    )
    .slice(
      0,
      limit
    );
}

async function recommendByPrescription(
  customerIdValue,
  prescriptionIdValue,
  limitValue
) {
  const customerId =
    positiveInteger(
      customerIdValue,
      'RECOMMENDATION_INVALID_CUSTOMER_ID'
    );

  const prescriptionId =
    positiveInteger(
      prescriptionIdValue,
      'RECOMMENDATION_INVALID_PRESCRIPTION_ID'
    );

  const limit =
    normalizeLimit(
      limitValue
    );

  const rows =
    await sequelize.query(
      `
        SELECT
          prescription_id,
          customer_id,
          customer_verification_status,
          confirmation_required,
          customer_corrections,
          ai_result

        FROM customer_prescriptions

        WHERE prescription_id =
              :prescription_id
          AND customer_id =
              :customer_id

        LIMIT 1
      `,
      {
        replacements: {
          prescription_id:
            prescriptionId,

          customer_id:
            customerId,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  if (rows.length !== 1) {
    throw recommendationError(
      'RECOMMENDATION_PRESCRIPTION_NOT_FOUND',
      'Prescription not found',
      404
    );
  }

  const prescription =
    rows[0];

  if (
    prescription
      .customer_verification_status !==
        'confirmed' ||
    prescription
      .confirmation_required !== false
  ) {
    throw recommendationError(
      'RECOMMENDATION_PRESCRIPTION_REVIEW_REQUIRED',
      'Prescription must be customer-confirmed before recommendations can be derived',
      409
    );
  }

  const corrections =
    safeJsonObject(
      prescription
        .customer_corrections
    );

  const medicines =
    Array.isArray(
      corrections.medicines
    )
      ? corrections.medicines
      : [];

  const products =
    await loadActiveProductSnapshot();

  const groups = [];

  for (const medicine of medicines) {
    if (
      !medicine ||
      medicine.action ===
        'rejected'
    ) {
      continue;
    }

    const group = {
      candidate_id:
        medicine.candidate_id ||
        null,

      name:
        typeof medicine.name ===
          'string'
          ? medicine.name
          : '',

      strength:
        typeof medicine.strength ===
          'string'
          ? medicine.strength
          : null,

      action:
        medicine.action || null,

      source_product_id:
        null,

      status:
        'SOURCE_IDENTITY_UNAVAILABLE',

      match_basis:
        null,

      recommendations:
        [],
    };

    let sourceProductId =
      null;

    if (
      medicine.action ===
        'confirmed'
    ) {
      sourceProductId =
        sourceProductIdForCandidate(
          prescription.ai_result,
          medicine.candidate_id
        );
    }

    const source =
      sourceProductId
        ? products.find(
            (product) =>
              Number(
                product.product_id
              ) ===
                Number(
                  sourceProductId
                )
          )
        : null;

    if (source) {
      const result =
        selectAlternatives(
          source,
          products,
          limit
        );

      group.source_product_id =
        source.product_id;

      group.status =
        result.status;

      group.match_basis =
        result.match_basis;

      group.recommendations =
        result.recommendations;

      groups.push(group);
      continue;
    }

    const exactMatches =
      exactNameMatches(
        group.name,
        products,
        limit
      );

    if (exactMatches.length > 0) {
      group.status =
        'CATALOGUE_MATCHES_FOUND';

      group.match_basis =
        'EXACT_CONFIRMED_NAME';

      group.recommendations =
        exactMatches.map(
          (product) => ({
            ...product,

            recommendation_basis:
              'EXACT_CONFIRMED_NAME',
          })
        );
    }

    groups.push(group);
  }

  const recommendationCount =
    groups.reduce(
      (total, group) =>
        total +
        group.recommendations.length,
      0
    );

  return {
    schema_version:
      SCHEMA_VERSION,

    source_type:
      'prescription',

    prescription_id:
      prescriptionId,

    status:
      recommendationCount > 0
        ? 'RECOMMENDATIONS_AVAILABLE'
        : 'NO_ALTERNATIVES',

    recommendation_count:
      recommendationCount,

    groups,

    message:
      recommendationCount > 0
        ? 'Catalogue recommendations are available for confirmed prescription medicines.'
        : 'No eligible same-ingredient catalogue alternatives are currently available for this confirmed prescription.',

    limitations: [
      LIMITATION,
    ],
  };
}

module.exports = {
  recommendByProductId,
  recommendByPrescription,

  _private: {
    normalizeText,
    normalizeLimit,
    chooseIdentity,
    sameIdentity,
    selectAlternatives,
    exactNameMatches,
    sourceProductIdForCandidate,
  },
};
