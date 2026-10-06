const crypto = require('crypto');
const { QueryTypes } = require('sequelize');

const { sequelize } = require('../models');
const ddiService = require('./ddiService');

const REVIEWABLE_DDI_STATUSES = new Set([
  'WARNING_REVIEW_REQUIRED',
  'UNRESOLVED_REVIEW_REQUIRED',
]);

let schemaReady = false;
let schemaPromise = null;

function consultationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function positiveInteger(
  value,
  code = 'CONSULT_INVALID_ID'
) {
  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw consultationError(
      code,
      'A valid positive identifier is required'
    );
  }

  return parsed;
}

function boundedText(
  value,
  maxLength,
  fallback = ''
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  if (text.length > maxLength) {
    throw consultationError(
      'CONSULT_INVALID_INPUT',
      `Text exceeds maximum length of ${maxLength}`
    );
  }

  return text;
}

function normalizeCartInstanceId(value) {
  const normalized =
    boundedText(
      value,
      128
    );

  if (
    !normalized ||
    !/^(?:cart-safe-|buy-now-)[A-Za-z0-9-]{12,118}$/
      .test(normalized)
  ) {
    throw consultationError(
      'CONSULT_CART_INSTANCE_REQUIRED',
      'A valid checkout safety lifecycle is required'
    );
  }

  return normalized;
}


function normalizeSource(value) {
  const source =
    String(value || '')
      .trim()
      .toLowerCase();

  if (
    source !== 'cart' &&
    source !== 'prescription'
  ) {
    throw consultationError(
      'CONSULT_INVALID_INPUT',
      'Consultation source must be cart or prescription'
    );
  }

  return source;
}

function normalizeRequestedItems(value) {
  if (!Array.isArray(value)) {
    throw consultationError(
      'CONSULT_INVALID_INPUT',
      'items must be an array'
    );
  }

  if (
    value.length < 1 ||
    value.length > 50
  ) {
    throw consultationError(
      'CONSULT_INVALID_INPUT',
      'items must contain between 1 and 50 products'
    );
  }

  const byId = new Map();

  for (const item of value) {
    const rawId =
      typeof item?.product_id === 'string'
        ? item.product_id.replace(
            /^prod-/,
            ''
          )
        : item?.product_id;

    const productId =
      Number(rawId);

    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0
    ) {
      throw consultationError(
        'CONSULT_INVALID_PRODUCT_ID',
        'Every consultation item must contain a valid product_id'
      );
    }

    const rawQuantity =
      Number(item?.quantity);

    const quantity =
      Number.isSafeInteger(rawQuantity) &&
      rawQuantity > 0 &&
      rawQuantity <= 999
        ? rawQuantity
        : 1;

    const previous =
      byId.get(productId);

    byId.set(
      productId,
      {
        product_id:
          productId,
        quantity:
          Math.min(
            999,
            (previous?.quantity || 0) +
              quantity
          ),
      }
    );
  }

  return [...byId.values()];
}

async function ensureConsultationSchema() {
  if (schemaReady) {
    return;
  }

  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS
          pharmacist_consultations (
            consultation_id
              BIGSERIAL PRIMARY KEY,

            customer_id
              INTEGER NOT NULL
              REFERENCES customer(customer_id)
              ON DELETE RESTRICT,

            source
              VARCHAR(32) NOT NULL,

            status
              VARCHAR(24) NOT NULL
              DEFAULT 'pending',

            ddi_status
              VARCHAR(64) NOT NULL,

            review_fingerprint
              VARCHAR(64) NOT NULL,

            interaction_details
              JSONB NOT NULL
              DEFAULT '[]'::jsonb,

            cart_snapshot
              JSONB NOT NULL
              DEFAULT '[]'::jsonb,

            customer_message
              TEXT NULL,

            pharmacist_guidance
              TEXT NULL,

            pharmacist_id
              UUID NULL
              REFERENCES users(id)
              ON DELETE SET NULL,

            created_at
              TIMESTAMPTZ NOT NULL
              DEFAULT NOW(),

            updated_at
              TIMESTAMPTZ NOT NULL
              DEFAULT NOW(),

            responded_at
              TIMESTAMPTZ NULL,

            CONSTRAINT
              pharmacist_consultations_source_chk
              CHECK (
                source IN (
                  'cart',
                  'prescription'
                )
              ),

            CONSTRAINT
              pharmacist_consultations_status_chk
              CHECK (
                status IN (
                  'pending',
                  'responded'
                )
              ),

            CONSTRAINT
              pharmacist_consultations_ddi_chk
              CHECK (
                ddi_status IN (
                  'WARNING_REVIEW_REQUIRED',
                  'UNRESOLVED_REVIEW_REQUIRED'
                )
              )
          )
      `);

      await sequelize.query(`
        ALTER TABLE pharmacist_consultations
          ADD COLUMN IF NOT EXISTS decision VARCHAR(16) NULL,
          ADD COLUMN IF NOT EXISTS decision_at TIMESTAMPTZ NULL,
          ADD COLUMN IF NOT EXISTS checkout_consumed_at TIMESTAMPTZ NULL,
          ADD COLUMN IF NOT EXISTS cart_instance_id VARCHAR(128) NULL
      `);

      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname =
              'pharmacist_consultations_decision_chk'
          ) THEN
            ALTER TABLE pharmacist_consultations
              ADD CONSTRAINT
                pharmacist_consultations_decision_chk
              CHECK (
                decision IS NULL OR
                decision IN ('approved', 'rejected')
              );
          END IF;
        END
        $$
      `);

      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS
          idx_pharmacist_consultations_customer_created
        ON pharmacist_consultations (
          customer_id,
          created_at DESC
        )
      `);

      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS
          idx_pharmacist_consultations_status_created
        ON pharmacist_consultations (
          status,
          created_at ASC
        )
      `);

      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS
          idx_pharmacist_consultations_cart_instance
        ON pharmacist_consultations (
          customer_id,
          cart_instance_id
        )
        WHERE cart_instance_id IS NOT NULL
      `);

      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_pharmacist_consultations_pending_review
        ON pharmacist_consultations (
          customer_id,
          review_fingerprint
        )
        WHERE status = 'pending'
      `);

      schemaReady = true;
    })();

    schemaPromise.catch(() => {
      schemaPromise = null;
      schemaReady = false;
    });
  }

  return schemaPromise;
}

async function requireCustomer(
  customerId
) {
  const rows =
    await sequelize.query(
      `
        SELECT customer_id
        FROM customer
        WHERE customer_id =
              :customer_id
          AND COALESCE(
                is_active,
                TRUE
              ) = TRUE
          AND COALESCE(
                status,
                1
              ) = 1
        LIMIT 1
      `,
      {
        replacements: {
          customer_id:
            customerId,
        },
        type:
          QueryTypes.SELECT,
      }
    );

  if (rows.length !== 1) {
    throw consultationError(
      'CONSULT_CUSTOMER_NOT_FOUND',
      'Customer account is unavailable'
    );
  }
}

async function requireEligiblePharmacist(
  pharmacistIdValue
) {
  const pharmacistId =
    boundedText(
      pharmacistIdValue,
      128
    );

  if (!pharmacistId) {
    throw consultationError(
      'CONSULT_STAFF_FORBIDDEN',
      'Pharmacist authentication is required'
    );
  }

  const rows =
    await sequelize.query(
      `
        SELECT id
        FROM users
        WHERE id::text =
              :pharmacist_id
          AND LOWER(
                COALESCE(
                  role,
                  ''
                )
              ) = 'pharmacist'
          AND COALESCE(
                is_active,
                FALSE
              ) = TRUE
          AND COALESCE(
                is_approved,
                FALSE
              ) = TRUE
        LIMIT 1
      `,
      {
        replacements: {
          pharmacist_id:
            pharmacistId,
        },
        type:
          QueryTypes.SELECT,
      }
    );

  if (rows.length !== 1) {
    throw consultationError(
      'CONSULT_STAFF_FORBIDDEN',
      'An active approved pharmacist account is required'
    );
  }

  return pharmacistId;
}

async function eligiblePharmacistExists() {
  const rows =
    await sequelize.query(
      `
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE LOWER(
                COALESCE(
                  role,
                  ''
                )
              ) = 'pharmacist'
          AND COALESCE(
                is_active,
                FALSE
              ) = TRUE
          AND COALESCE(
                is_approved,
                FALSE
              ) = TRUE
      `,
      {
        type:
          QueryTypes.SELECT,
      }
    );

  return Number(
    rows[0]?.count || 0
  ) > 0;
}

async function loadAuthoritativeProducts(
  requestedItems
) {
  const ids =
    requestedItems.map(
      (item) =>
        item.product_id
    );

  const rows =
    await sequelize.query(
      `
        SELECT
          product_id,
          product_title,
          product_generic_name,
          product_salt,
          product_requires_rx,
          product_status
        FROM product
        WHERE product_id
          IN (:product_ids)
      `,
      {
        replacements: {
          product_ids:
            ids,
        },
        type:
          QueryTypes.SELECT,
      }
    );

  const byId =
    new Map(
      rows.map(
        (row) => [
          Number(
            row.product_id
          ),
          row,
        ]
      )
    );

  const missing =
    ids.filter(
      (id) =>
        !byId.has(id)
    );

  if (missing.length > 0) {
    const error =
      consultationError(
        'CONSULT_PRODUCT_NOT_FOUND',
        'One or more consultation products no longer exist'
      );

    error.product_ids =
      missing;

    throw error;
  }

  return requestedItems.map(
    (requested) => {
      const product =
        byId.get(
          requested.product_id
        );

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
                product
                  .product_requires_rx
              ),

        product_status:
          Number(
            product.product_status ??
            0
          ),

        quantity:
          requested.quantity,
      };
    }
  );
}

function extractReviewItems(result) {
  const warnings = [];

  for (
    const pair of
      result?.pairs || []
  ) {
    const blockingReview =
      result?.checkout_allowed ===
        false &&
      pair.review_required ===
        true;

    if (
      !pair.warning_triggered &&
      !blockingReview
    ) {
      continue;
    }

    const descriptions =
      Array.isArray(
        pair
          .known_interaction_descriptions
      )
        ? pair
            .known_interaction_descriptions
            .filter(Boolean)
        : [];

    const evidence =
      descriptions.length > 0
        ? descriptions.join(' ')
        : pair.message || '';

    warnings.push({
      kind:
        pair.interaction_found
          ? 'exact_interaction'
          : 'pair_review_required',

      label:
        pair.interaction_found
          ? pair.severity === 'Unknown'
            ? 'Exact interaction with unknown severity'
            : `${pair.severity || 'Exact'} interaction detected`
          : 'Pharmacist review required',

      message:
        boundedText(
          evidence ||
            'This medicine pair requires pharmacist review.',
          1500
        ),

      substance_a:
        boundedText(
          pair.ingredient_a ||
            '',
          255
        ),

      substance_b:
        boundedText(
          pair.ingredient_b ||
            '',
          255
        ),

      product_ids_a:
        Array.isArray(
          pair.product_ids_a
        )
          ? pair.product_ids_a
          : [],

      product_ids_b:
        Array.isArray(
          pair.product_ids_b
        )
          ? pair.product_ids_b
          : [],

      interaction_found:
        pair.interaction_found === true,

      severity:
        pair.severity || null,

      workflow_action:
        pair.workflow_action || null,

      evidence_source_identifier:
        pair.evidence_source_identifier || null,

      evidence_record_identifiers:
        Array.isArray(pair.evidence_record_identifiers)
          ? pair.evidence_record_identifiers
          : [],
    });
  }

  for (
    const product of
      result?.products || []
  ) {
    const ingredientState =
      product?.ingredient?.state;

    const fullyEvaluated =
      ingredientState ===
        'RESOLVED' &&
      product
        .structural_adaptation_succeeded ===
        true &&
      Number(
        product.product_status
      ) === 1;

    if (fullyEvaluated) {
      continue;
    }

    warnings.push({
      kind:
        'product_review_required',

      label:
        'Submitted for pharmacist verification',

      message:
        ingredientState &&
        ingredientState !==
          'RESOLVED'
          ? `Medicine identity or evidence could not be fully evaluated (${ingredientState}). This does not confirm a dangerous interaction.`
          : 'Medicine identity or evidence could not be fully evaluated. This does not confirm a dangerous interaction.',

      workflow_action:
        'IDENTITY_REVIEW_REQUIRED',

      identity_problem_reason:
        ingredientState ||
        product.structural_limitation ||
        'GOVERNED_EVALUATION_INCOMPLETE',

      product_id:
        Number(
          product.product_id
        ),

      product_title:
        boundedText(
          product.product_title ||
            `Product ${product.product_id}`,
          255
        ),
    });
  }

  if (
    warnings.length === 0 &&
    result?.checkout_allowed ===
      false
  ) {
    warnings.push({
      kind:
        'ddi_review_required',

      label:
        'Pharmacist review required',

      message:
        boundedText(
          result.message ||
            'The governed drug interaction review requires pharmacist attention.',
          1500
        ),
    });
  }

  return warnings;
}

async function runAuthoritativeDdi(
  authoritativeProducts
) {
  const payload =
    authoritativeProducts.map(
      (product) => ({
        product_id:
          product.product_id,

        product_title:
          product.product_title,

        product_generic_name:
          product.product_generic_name,

        product_salt:
          product.product_salt,

        product_requires_rx:
          product.product_requires_rx,

        product_status:
          product.product_status,
      })
    );

  let ddi;

  try {
    ddi =
      await ddiService.checkCart(
        payload
      );
  } catch (error) {
    const wrapped =
      consultationError(
        'DDI_SERVICE_UNAVAILABLE',
        'Drug interaction review could not be completed'
      );

    wrapped.cause =
      error;

    throw wrapped;
  }

  if (
    ddi?.httpStatus === 503 ||
    ddi?.result?.status ===
      'SERVICE_UNAVAILABLE'
  ) {
    throw consultationError(
      'DDI_SERVICE_UNAVAILABLE',
      ddi?.result?.message ||
        'Drug interaction review service is unavailable'
    );
  }

  if (
    ddi?.httpStatus !== 200 ||
    !ddi?.result
  ) {
    throw consultationError(
      'DDI_UPSTREAM_ERROR',
      'Drug interaction service returned an unexpected response'
    );
  }

  const status =
    String(
      ddi.result.status || ''
    ).toUpperCase();

  if (
    ddi.result.checkout_allowed ===
      true
  ) {
    throw consultationError(
      'CONSULT_NOT_REVIEWABLE',
      'The authoritative DDI review did not require pharmacist guidance'
    );
  }

  if (
    !REVIEWABLE_DDI_STATUSES.has(
      status
    )
  ) {
    throw consultationError(
      'CONSULT_NOT_REVIEWABLE',
      'The authoritative DDI result is not eligible for pharmacist consultation'
    );
  }

  const reviewItems =
    extractReviewItems(
      ddi.result
    );

  if (
    reviewItems.length === 0
  ) {
    throw consultationError(
      'DDI_INVALID_RESPONSE',
      'The DDI result did not contain reviewable details'
    );
  }

  return {
    status,
    result:
      ddi.result,
    reviewItems,
  };
}

function buildSnapshot(
  authoritativeProducts
) {
  return authoritativeProducts.map(
    (product) => ({
      product_id:
        product.product_id,

      product_title:
        product.product_title,

      product_generic_name:
        product.product_generic_name,

      product_salt:
        product.product_salt,

      product_requires_rx:
        product.product_requires_rx,

      product_status:
        product.product_status,

      quantity:
        product.quantity,
    })
  );
}

function fingerprintPayload({
  customerId,
  source,
  cartInstanceId = null,
  ddiStatus,
  interactionDetails,
  cartSnapshot,
}) {
  const canonical = {
    customer_id:
      customerId,

    source,

    ...(
      cartInstanceId
        ? {
            cart_instance_id:
              cartInstanceId,
          }
        : {}
    ),

    ddi_status:
      ddiStatus,

    interaction_details:
      interactionDetails,

    cart_snapshot:
      [...cartSnapshot].sort(
        (a, b) =>
          Number(
            a.product_id
          ) -
          Number(
            b.product_id
          )
      ),
  };

  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify(
        canonical
      )
    )
    .digest('hex');
}

function mapConsultation(row) {
  if (!row) {
    return null;
  }

  return {
    consultation_id:
      Number(
        row.consultation_id
      ),

    customer_id:
      Number(
        row.customer_id
      ),

    customer_name:
      row.customer_name ||
      null,

    customer_email:
      row.customer_email ||
      null,

    source:
      row.source,

    cart_instance_id:
      row.cart_instance_id ||
      null,

    status:
      row.status,

    ddi_status:
      row.ddi_status,

    interaction_details:
      row.interaction_details ||
      [],

    cart_snapshot:
      row.cart_snapshot ||
      [],

    customer_message:
      row.customer_message ||
      null,

    pharmacist_guidance:
      row.pharmacist_guidance ||
      null,

    pharmacist_id:
      row.pharmacist_id ||
      null,

    decision:
      row.decision ||
      null,

    decision_at:
      row.decision_at ||
      null,

    checkout_consumed_at:
      row.checkout_consumed_at ||
      null,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,

    responded_at:
      row.responded_at ||
      null,
  };
}

async function createConsultation(
  customerIdValue,
  payload = {}
) {
  await ensureConsultationSchema();

  const customerId =
    positiveInteger(
      customerIdValue,
      'CONSULT_INVALID_CUSTOMER_ID'
    );

  const source =
    normalizeSource(
      payload.source
    );

  const requestedItems =
    normalizeRequestedItems(
      payload.items
    );

  const cartInstanceId =
    source === 'cart'
      ? normalizeCartInstanceId(
          payload.cart_instance_id
        )
      : null;

  const customerMessage =
    boundedText(
      payload.customer_message,
      1000
    ) || null;

  await requireCustomer(
    customerId
  );

  const pharmacistAvailable =
    await eligiblePharmacistExists();

  if (!pharmacistAvailable) {
    throw consultationError(
      'PHARMACIST_UNAVAILABLE',
      'No eligible pharmacist account is available to receive this consultation. Keep the interaction warning as the safe default and try again later.'
    );
  }

  const authoritativeProducts =
    await loadAuthoritativeProducts(
      requestedItems
    );

  const ddi =
    await runAuthoritativeDdi(
      authoritativeProducts
    );

  const interactionDetails =
    ddi.reviewItems;

  const cartSnapshot =
    buildSnapshot(
      authoritativeProducts
    );

  const reviewFingerprint =
    fingerprintPayload({
      customerId,
      source,
      cartInstanceId,
      ddiStatus:
        ddi.status,
      interactionDetails,
      cartSnapshot,
    });

  if (cartInstanceId) {
    const rejected =
      await sequelize.query(
        `
          SELECT pc.*
          FROM pharmacist_consultations pc
          WHERE pc.customer_id =
                :customer_id
            AND pc.review_fingerprint =
                :review_fingerprint
            AND pc.cart_instance_id =
                :cart_instance_id
            AND pc.status =
                'responded'
            AND pc.decision =
                'rejected'
          ORDER BY
            pc.consultation_id
            DESC
          LIMIT 1
        `,
        {
          replacements: {
            customer_id:
              customerId,

            review_fingerprint:
              reviewFingerprint,

            cart_instance_id:
              cartInstanceId,
          },

          type:
            QueryTypes.SELECT,
        }
      );

    if (rejected.length === 1) {
      throw consultationError(
        'CONSULT_CART_REJECTED',
        'This exact cart was already rejected by a pharmacist. Clear or change the cart before requesting another review.'
      );
    }
  }

  const existing =
    await sequelize.query(
      `
        SELECT pc.*
        FROM pharmacist_consultations pc
        WHERE pc.customer_id =
              :customer_id
          AND pc.review_fingerprint =
              :review_fingerprint
          AND pc.status =
              'pending'
        ORDER BY
          pc.consultation_id
          DESC
        LIMIT 1
      `,
      {
        replacements: {
          customer_id:
            customerId,

          review_fingerprint:
            reviewFingerprint,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  if (existing.length === 1) {
    return {
      duplicate:
        true,

      consultation:
        mapConsultation(
          existing[0]
        ),
    };
  }

  const [rows] =
    await sequelize.query(
      `
        INSERT INTO
          pharmacist_consultations (
            customer_id,
            source,
            cart_instance_id,
            status,
            ddi_status,
            review_fingerprint,
            interaction_details,
            cart_snapshot,
            customer_message,
            created_at,
            updated_at
          )
        VALUES (
          :customer_id,
          :source,
          :cart_instance_id,
          'pending',
          :ddi_status,
          :review_fingerprint,
          CAST(
            :interaction_details
            AS jsonb
          ),
          CAST(
            :cart_snapshot
            AS jsonb
          ),
          :customer_message,
          NOW(),
          NOW()
        )
        RETURNING *
      `,
      {
        replacements: {
          customer_id:
            customerId,

          source,

          cart_instance_id:
            cartInstanceId,

          ddi_status:
            ddi.status,

          review_fingerprint:
            reviewFingerprint,

          interaction_details:
            JSON.stringify(
              interactionDetails
            ),

          cart_snapshot:
            JSON.stringify(
              cartSnapshot
            ),

          customer_message:
            customerMessage,
        },
      }
    );

  return {
    duplicate:
      false,

    consultation:
      mapConsultation(
        rows[0]
      ),
  };
}

async function listCustomerConsultations(
  customerIdValue
) {
  await ensureConsultationSchema();

  const customerId =
    positiveInteger(
      customerIdValue,
      'CONSULT_INVALID_CUSTOMER_ID'
    );

  await requireCustomer(
    customerId
  );

  const rows =
    await sequelize.query(
      `
        SELECT pc.*
        FROM pharmacist_consultations pc
        WHERE pc.customer_id =
              :customer_id
        ORDER BY
          pc.created_at DESC,
          pc.consultation_id DESC
        LIMIT 100
      `,
      {
        replacements: {
          customer_id:
            customerId,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  return rows.map(
    mapConsultation
  );
}

async function getCustomerConsultation(
  customerIdValue,
  consultationIdValue
) {
  await ensureConsultationSchema();

  const customerId =
    positiveInteger(
      customerIdValue,
      'CONSULT_INVALID_CUSTOMER_ID'
    );

  const consultationId =
    positiveInteger(
      consultationIdValue
    );

  const rows =
    await sequelize.query(
      `
        SELECT pc.*
        FROM pharmacist_consultations pc
        WHERE pc.consultation_id =
              :consultation_id
          AND pc.customer_id =
              :customer_id
        LIMIT 1
      `,
      {
        replacements: {
          consultation_id:
            consultationId,

          customer_id:
            customerId,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  if (rows.length !== 1) {
    throw consultationError(
      'CONSULT_NOT_FOUND',
      'Consultation not found'
    );
  }

  return mapConsultation(
    rows[0]
  );
}

function normalizeLimit(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return 100;
  }

  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > 100
  ) {
    throw consultationError(
      'CONSULT_INVALID_LIMIT',
      'limit must be an integer from 1 to 100'
    );
  }

  return parsed;
}

async function listQueue(
  pharmacistIdValue,
  limitValue
) {
  await ensureConsultationSchema();

  await requireEligiblePharmacist(
    pharmacistIdValue
  );

  const limit =
    normalizeLimit(
      limitValue
    );

  const rows =
    await sequelize.query(
      `
        SELECT
          pc.*,
          c.customer_name,
          c.email AS
            customer_email
        FROM pharmacist_consultations pc
        JOIN customer c
          ON c.customer_id =
             pc.customer_id
        ORDER BY
          CASE
            WHEN pc.status =
              'pending'
            THEN 0
            ELSE 1
          END,
          pc.created_at ASC,
          pc.consultation_id ASC
        LIMIT :limit
      `,
      {
        replacements: {
          limit,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  return rows.map(
    mapConsultation
  );
}

async function getStaffConsultation(
  pharmacistIdValue,
  consultationIdValue
) {
  await ensureConsultationSchema();

  await requireEligiblePharmacist(
    pharmacistIdValue
  );

  const consultationId =
    positiveInteger(
      consultationIdValue
    );

  const rows =
    await sequelize.query(
      `
        SELECT
          pc.*,
          c.customer_name,
          c.email AS
            customer_email
        FROM pharmacist_consultations pc
        JOIN customer c
          ON c.customer_id =
             pc.customer_id
        WHERE pc.consultation_id =
              :consultation_id
        LIMIT 1
      `,
      {
        replacements: {
          consultation_id:
            consultationId,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  if (rows.length !== 1) {
    throw consultationError(
      'CONSULT_NOT_FOUND',
      'Consultation not found'
    );
  }

  return mapConsultation(
    rows[0]
  );
}

async function addGuidance(
  consultationIdValue,
  pharmacistIdValue,
  guidanceValue
) {
  await ensureConsultationSchema();

  const pharmacistId =
    await requireEligiblePharmacist(
      pharmacistIdValue
    );

  const consultationId =
    positiveInteger(
      consultationIdValue
    );

  const guidance =
    boundedText(
      guidanceValue,
      3000
    );

  if (!guidance) {
    throw consultationError(
      'CONSULT_INVALID_GUIDANCE',
      'Pharmacist guidance is required'
    );
  }

  const currentRows =
    await sequelize.query(
      `
        SELECT
          consultation_id,
          status
        FROM pharmacist_consultations
        WHERE consultation_id =
              :consultation_id
        LIMIT 1
      `,
      {
        replacements: {
          consultation_id:
            consultationId,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  if (
    currentRows.length !== 1
  ) {
    throw consultationError(
      'CONSULT_NOT_FOUND',
      'Consultation not found'
    );
  }

  if (
    currentRows[0].status ===
      'responded'
  ) {
    throw consultationError(
      'CONSULT_ALREADY_RESPONDED',
      'This consultation already has pharmacist guidance'
    );
  }

  const [rows] =
    await sequelize.query(
      `
        UPDATE
          pharmacist_consultations
        SET
          pharmacist_guidance =
            :pharmacist_guidance,

          pharmacist_id =
            :pharmacist_id,

          status =
            'responded',

          responded_at =
            NOW(),

          updated_at =
            NOW()

        WHERE consultation_id =
              :consultation_id
          AND status =
              'pending'

        RETURNING *
      `,
      {
        replacements: {
          pharmacist_guidance:
            guidance,

          pharmacist_id:
            pharmacistId,

          consultation_id:
            consultationId,
        },
      }
    );

  if (
    !Array.isArray(rows) ||
    rows.length !== 1
  ) {
    throw consultationError(
      'CONSULT_ALREADY_RESPONDED',
      'This consultation is no longer pending'
    );
  }

  return mapConsultation(
    rows[0]
  );
}


async function decideConsultation(
  consultationIdValue,
  pharmacistIdValue,
  decisionValue,
  guidanceValue
) {
  await ensureConsultationSchema();

  const pharmacistId =
    await requireEligiblePharmacist(
      pharmacistIdValue
    );

  const consultationId =
    positiveInteger(
      consultationIdValue
    );

  const decision =
    String(
      decisionValue || ''
    )
      .trim()
      .toLowerCase();

  if (
    decision !== 'approved' &&
    decision !== 'rejected'
  ) {
    throw consultationError(
      'CONSULT_INVALID_DECISION',
      'decision must be approved or rejected'
    );
  }

  const guidance =
    boundedText(
      guidanceValue,
      3000
    );

  if (!guidance) {
    throw consultationError(
      'CONSULT_INVALID_GUIDANCE',
      'Pharmacist guidance is required'
    );
  }

  const [rows] =
    await sequelize.query(
      `
        UPDATE pharmacist_consultations
        SET
          pharmacist_guidance =
            :pharmacist_guidance,
          pharmacist_id =
            :pharmacist_id,
          decision =
            :decision,
          decision_at =
            NOW(),
          status =
            'responded',
          responded_at =
            NOW(),
          updated_at =
            NOW()
        WHERE consultation_id =
              :consultation_id
          AND status =
              'pending'
        RETURNING *
      `,
      {
        replacements: {
          pharmacist_guidance:
            guidance,
          pharmacist_id:
            pharmacistId,
          decision,
          consultation_id:
            consultationId,
        },
      }
    );

  if (
    !Array.isArray(rows) ||
    rows.length !== 1
  ) {
    throw consultationError(
      'CONSULT_ALREADY_RESPONDED',
      'This consultation is no longer pending'
    );
  }

  return mapConsultation(
    rows[0]
  );
}


async function consumeApprovedCheckout({
  consultationIdValue,
  customerIdValue,
  cartInstanceIdValue = null,
  requestedItems,
  transaction,
}) {
  await ensureConsultationSchema();

  const consultationId =
    positiveInteger(
      consultationIdValue
    );

  const customerId =
    positiveInteger(
      customerIdValue,
      'CONSULT_INVALID_CUSTOMER_ID'
    );

  const normalizedItems =
    normalizeRequestedItems(
      requestedItems
    );

  const cartInstanceId =
    normalizeCartInstanceId(
      cartInstanceIdValue
    );

  const rows =
    await sequelize.query(
      `
        SELECT *
        FROM pharmacist_consultations
        WHERE consultation_id =
              :consultation_id
          AND customer_id =
              :customer_id
          AND source =
              'cart'
        LIMIT 1
        FOR UPDATE
      `,
      {
        replacements: {
          consultation_id:
            consultationId,
          customer_id:
            customerId,
        },
        type:
          QueryTypes.SELECT,
        transaction,
      }
    );

  if (rows.length !== 1) {
    throw consultationError(
      'CONSULT_APPROVAL_NOT_FOUND',
      'Approved pharmacist review was not found for this customer'
    );
  }

  const consultation =
    rows[0];

  if (
    consultation.status !==
      'responded'
  ) {
    throw consultationError(
      'CONSULT_APPROVAL_PENDING',
      'Pharmacist review is still pending'
    );
  }

  if (
    consultation.decision ===
      'rejected'
  ) {
    throw consultationError(
      'CONSULT_APPROVAL_REJECTED',
      'The pharmacist did not approve this cart for checkout'
    );
  }

  if (
    consultation.decision !==
      'approved'
  ) {
    throw consultationError(
      'CONSULT_APPROVAL_NOT_GRANTED',
      'This consultation does not contain checkout approval'
    );
  }

  if (
    consultation
      .checkout_consumed_at
  ) {
    throw consultationError(
      'CONSULT_APPROVAL_ALREADY_USED',
      'This pharmacist approval has already been used'
    );
  }

  if (
    !consultation.cart_instance_id ||
    cartInstanceId !==
      consultation.cart_instance_id
  ) {
    throw consultationError(
      'CONSULT_APPROVAL_STALE',
      'This approval belongs to a different cart lifecycle. A new pharmacist review is required.'
    );
  }

  const authoritativeProducts =
    await loadAuthoritativeProducts(
      normalizedItems
    );

  const ddi =
    await runAuthoritativeDdi(
      authoritativeProducts
    );

  const interactionDetails =
    ddi.reviewItems;

  const cartSnapshot =
    buildSnapshot(
      authoritativeProducts
    );

  const currentFingerprint =
    fingerprintPayload({
      customerId,
      source:
        'cart',
      cartInstanceId:
        cartInstanceId,
      ddiStatus:
        ddi.status,
      interactionDetails,
      cartSnapshot,
    });

  if (
    currentFingerprint !==
      consultation.review_fingerprint
  ) {
    throw consultationError(
      'CONSULT_APPROVAL_STALE',
      'Cart or DDI review changed after pharmacist approval. A new review is required.'
    );
  }

  const [updated] =
    await sequelize.query(
      `
        UPDATE pharmacist_consultations
        SET
          checkout_consumed_at =
            NOW(),
          updated_at =
            NOW()
        WHERE consultation_id =
              :consultation_id
          AND checkout_consumed_at
              IS NULL
        RETURNING *
      `,
      {
        replacements: {
          consultation_id:
            consultationId,
        },
        transaction,
      }
    );

  if (
    !Array.isArray(updated) ||
    updated.length !== 1
  ) {
    throw consultationError(
      'CONSULT_APPROVAL_ALREADY_USED',
      'This pharmacist approval has already been used'
    );
  }

  return mapConsultation(
    updated[0]
  );
}


async function createCompletedOrderReview({customerId,orderId,orderNumber,ddiResult,items}) {
  if(!customerId || ddiResult?.status!=='WARNING_CHECKOUT_ALLOWED' || !ddiResult.pharmacist_flag_required) return null;
  await ensureConsultationSchema();
  const details=extractReviewItems(ddiResult);
  if(!details.length) return null;
  const fingerprint=crypto.createHash('sha256').update(`completed-order:${orderId}`).digest('hex');
  const [existing]=await sequelize.query('SELECT consultation_id FROM pharmacist_consultations WHERE review_fingerprint=:fingerprint',
    {replacements:{fingerprint},type:QueryTypes.SELECT});
  if(existing) return existing;
  const [rows]=await sequelize.query(`INSERT INTO pharmacist_consultations(customer_id,source,status,ddi_status,review_fingerprint,
    interaction_details,cart_snapshot,customer_message) VALUES(:customerId,'cart','pending',:status,:fingerprint,
    CAST(:details AS jsonb),CAST(:snapshot AS jsonb),:message) RETURNING *`,
    {replacements:{customerId,status:ddiResult.status,fingerprint,details:JSON.stringify(details),snapshot:JSON.stringify(items),
      message:`Order ${orderNumber}: accepted with a DDI warning; pharmacist follow-up required.`}});
  return mapConsultation(rows[0]);
}

module.exports = {
  createCompletedOrderReview,
  ensureConsultationSchema,
  createConsultation,
  listCustomerConsultations,
  getCustomerConsultation,
  listQueue,
  getStaffConsultation,
  addGuidance,
  decideConsultation,
  consumeApprovedCheckout,
};
