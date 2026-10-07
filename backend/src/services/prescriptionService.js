const axios = require('axios');
const crypto = require('crypto');
const { QueryTypes } = require('sequelize');

const { sequelize } = require('../models');

const AI_SERVICE_URL = (
  process.env.AI_SERVICE_URL ||
  'http://127.0.0.1:8000'
).replace(/\/+$/, '');

const PRESCRIPTION_AI_URL =
  `${AI_SERVICE_URL}/api/v1/integrations/amna/prescription/analyze`;

const OCR_TIMEOUT_MS =
  Number(
    process.env.OCR_TIMEOUT_MS ||
    180000
  );

const MAX_IMAGE_BYTES =
  5 * 1024 * 1024;

const ALLOWED_MEDIA_TYPES =
  new Set([
    'image/png',
    'image/jpeg',
  ]);

let schemaReady = false;
let schemaPromise = null;

function prescriptionError(
  code,
  message,
  httpStatus = 500
) {
  const error =
    new Error(message);

  error.code =
    code;

  error.httpStatus =
    httpStatus;

  return error;
}

function positiveInteger(
  value,
  code = 'PRESCRIPTION_INVALID_ID'
) {
  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw prescriptionError(
      code,
      'A valid positive identifier is required',
      400
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
    throw prescriptionError(
      'PRESCRIPTION_INVALID_INPUT',
      `Text exceeds maximum length of ${maxLength}`,
      400
    );
  }

  return text;
}

function normalizeMediaType(value) {
  const mediaType =
    String(value || '')
      .trim()
      .toLowerCase();

  if (
    !ALLOWED_MEDIA_TYPES.has(
      mediaType
    )
  ) {
    throw prescriptionError(
      'PRESCRIPTION_UNSUPPORTED_MEDIA_TYPE',
      'Only PNG and JPEG prescription images are supported',
      400
    );
  }

  return mediaType;
}

function decodeImageBase64(value) {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    throw prescriptionError(
      'PRESCRIPTION_INVALID_IMAGE',
      'image_base64 is required',
      400
    );
  }

  const encoded =
    value.trim();

  if (
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(
      encoded
    )
  ) {
    throw prescriptionError(
      'PRESCRIPTION_INVALID_IMAGE_BASE64',
      'Prescription image must contain valid standard Base64 data',
      400
    );
  }

  let buffer;

  try {
    buffer =
      Buffer.from(
        encoded,
        'base64'
      );
  } catch {
    throw prescriptionError(
      'PRESCRIPTION_INVALID_IMAGE_BASE64',
      'Prescription image must contain valid standard Base64 data',
      400
    );
  }

  if (
    !buffer ||
    buffer.length < 1
  ) {
    throw prescriptionError(
      'PRESCRIPTION_INVALID_IMAGE',
      'Prescription image is empty',
      400
    );
  }

  if (
    buffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw prescriptionError(
      'PRESCRIPTION_IMAGE_TOO_LARGE',
      'Prescription image must not exceed 5 MB',
      413
    );
  }

  return buffer;
}

async function ensurePrescriptionSchema() {
  if (schemaReady) {
    return;
  }

  if (!schemaPromise) {
    schemaPromise =
      (async () => {
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS
            customer_prescriptions (
              prescription_id
                BIGSERIAL PRIMARY KEY,

              customer_id
                INTEGER NOT NULL
                REFERENCES customer(customer_id)
                ON DELETE RESTRICT,

              original_filename
                VARCHAR(255) NULL,

              media_type
                VARCHAR(32) NOT NULL,

              image_sha256
                VARCHAR(64) NOT NULL,

              image_byte_size
                INTEGER NOT NULL,

              image_data
                BYTEA NULL,

              ocr_status
                VARCHAR(64) NULL,

              analysis_status
                VARCHAR(64) NULL,

              review_required
                BOOLEAN NOT NULL
                DEFAULT TRUE,

              confirmation_required
                BOOLEAN NOT NULL
                DEFAULT TRUE,

              raw_ocr_text
                TEXT NULL,

              ai_result
                JSONB NOT NULL,

              customer_verification_status
                VARCHAR(32) NOT NULL
                DEFAULT 'unverified',

              customer_corrections
                JSONB NULL,

              confirmed_at
                TIMESTAMPTZ NULL,

              created_at
                TIMESTAMPTZ NOT NULL
                DEFAULT NOW(),

              updated_at
                TIMESTAMPTZ NOT NULL
                DEFAULT NOW(),

              CONSTRAINT
                customer_prescriptions_media_chk
                CHECK (
                  media_type IN (
                    'image/png',
                    'image/jpeg'
                  )
                ),

              CONSTRAINT
                customer_prescriptions_verification_chk
                CHECK (
                  customer_verification_status
                  IN (
                    'unverified',
                    'confirmed'
                  )
                ),

              CONSTRAINT
                customer_prescriptions_image_size_chk
                CHECK (
                  image_byte_size > 0
                  AND
                  image_byte_size <= 5242880
                )
            )
        `);

        await sequelize.query(`
          ALTER TABLE
            customer_prescriptions
          ADD COLUMN IF NOT EXISTS
            image_data BYTEA NULL
        `);

        await sequelize.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conname =
                'customer_prescriptions_image_data_size_chk'
                AND conrelid =
                  'customer_prescriptions'::regclass
            ) THEN
              ALTER TABLE
                customer_prescriptions
              ADD CONSTRAINT
                customer_prescriptions_image_data_size_chk
              CHECK (
                image_data IS NULL
                OR (
                  OCTET_LENGTH(image_data) > 0
                  AND
                  OCTET_LENGTH(image_data) <= 5242880
                  AND
                  OCTET_LENGTH(image_data) =
                    image_byte_size
                )
              );
            END IF;
          END
          $$;
        `);

        await sequelize.query(`
          CREATE INDEX IF NOT EXISTS
            idx_customer_prescriptions_customer_created
          ON customer_prescriptions (
            customer_id,
            created_at DESC
          )
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
    throw prescriptionError(
      'PRESCRIPTION_CUSTOMER_NOT_FOUND',
      'Customer account is unavailable',
      404
    );
  }
}

async function loadAuthoritativeProducts() {
  return sequelize.query(
    `
      SELECT
        product_id,
        product_title,
        product_generic_name,
        product_salt,
        product_requires_rx,
        product_status
      FROM product
      WHERE product_status = 1
      ORDER BY product_id
    `,
    {
      type:
        QueryTypes.SELECT,
    }
  );
}

function validateAiResult(result) {
  if (
    !result ||
    typeof result !== 'object' ||
    !result.ocr_result ||
    typeof result.ocr_result !==
      'object' ||
    !result.prescription_analysis ||
    typeof result.prescription_analysis !==
      'object' ||
    !Array.isArray(
      result.product_matches
    )
  ) {
    throw prescriptionError(
      'PRESCRIPTION_INVALID_AI_RESPONSE',
      'Prescription AI service returned an invalid response',
      502
    );
  }

  return result;
}

async function callPrescriptionAi({
  imageBase64,
  mediaType,
  products,
}) {
  try {
    const response =
      await axios.post(
        PRESCRIPTION_AI_URL,
        {
          image_base64:
            imageBase64,

          media_type:
            mediaType,

          products,
        },
        {
          timeout:
            OCR_TIMEOUT_MS,

          headers: {
            'Content-Type':
              'application/json',
          },

          validateStatus:
            () => true,
        }
      );

    if (
      response.status === 200
    ) {
      return validateAiResult(
        response.data
      );
    }

    const detail =
      response.data?.detail;

    const upstreamCode =
      detail?.code ||
      response.data?.code ||
      'PRESCRIPTION_AI_ERROR';

    const upstreamMessage =
      detail?.message ||
      response.data?.message ||
      'Prescription analysis failed';

    if (
      response.status === 422
    ) {
      throw prescriptionError(
        upstreamCode,
        upstreamMessage,
        422
      );
    }

    if (
      response.status === 503
    ) {
      throw prescriptionError(
        'PRESCRIPTION_SERVICE_UNAVAILABLE',
        upstreamMessage,
        503
      );
    }

    throw prescriptionError(
      'PRESCRIPTION_AI_UPSTREAM_ERROR',
      upstreamMessage,
      502
    );
  } catch (error) {
    if (
      error?.code &&
      error?.httpStatus
    ) {
      throw error;
    }

    if (
      error?.code ===
        'ECONNABORTED' ||
      error?.code ===
        'ECONNREFUSED' ||
      error?.code ===
        'ETIMEDOUT'
    ) {
      throw prescriptionError(
        'PRESCRIPTION_SERVICE_UNAVAILABLE',
        'Prescription analysis service is unavailable',
        503
      );
    }

    throw prescriptionError(
      'PRESCRIPTION_SERVICE_UNAVAILABLE',
      'Prescription analysis service could not be reached',
      503
    );
  }
}

function deriveReviewState(
  aiResult
) {
  const ocrReview =
    aiResult
      ?.ocr_result
      ?.review_required ===
      true;

  const analysisReview =
    aiResult
      ?.prescription_analysis
      ?.review_required ===
      true;

  const matchReview =
    aiResult.product_matches.some(
      (entry) =>
        entry
          ?.product_match
          ?.review_required ===
        true
    );

  const confirmationRequired =
    aiResult.product_matches.some(
      (entry) =>
        entry
          ?.product_match
          ?.confirmation_required ===
        true
    );

  return {
    reviewRequired:
      ocrReview ||
      analysisReview ||
      matchReview,

    confirmationRequired:
      confirmationRequired ||
      ocrReview ||
      analysisReview ||
      matchReview,
  };
}

function mapPrescription(row) {
  if (!row) {
    return null;
  }

  return {
    prescription_id:
      Number(
        row.prescription_id
      ),

    customer_id:
      Number(
        row.customer_id
      ),

    original_filename:
      row.original_filename ||
      null,

    media_type:
      row.media_type,

    image_sha256:
      row.image_sha256,

    image_byte_size:
      Number(
        row.image_byte_size
      ),

    ocr_status:
      row.ocr_status ||
      null,

    analysis_status:
      row.analysis_status ||
      null,

    review_required:
      Boolean(
        row.review_required
      ),

    confirmation_required:
      Boolean(
        row.confirmation_required
      ),

    raw_ocr_text:
      row.raw_ocr_text ||
      '',

    ai_result:
      row.ai_result ||
      null,

    customer_verification_status:
      row.customer_verification_status,

    customer_corrections:
      row.customer_corrections ||
      null,

    confirmed_at:
      row.confirmed_at ||
      null,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
}

async function analyzePrescription(
  customerIdValue,
  payload = {}
) {
  const customerId =
    positiveInteger(
      customerIdValue,
      'PRESCRIPTION_INVALID_CUSTOMER_ID'
    );

  const mediaType =
    normalizeMediaType(
      payload.media_type
    );

  const originalFilename =
    boundedText(
      payload.original_filename,
      255
    ) || null;

  const imageBuffer =
    decodeImageBase64(
      payload.image_base64
    );

  await requireCustomer(
    customerId
  );

  const products =
    await loadAuthoritativeProducts();

  const aiResult =
    await callPrescriptionAi({
      imageBase64:
        imageBuffer.toString(
          'base64'
        ),

      mediaType,

      products,
    });

  const reviewState =
    deriveReviewState(
      aiResult
    );

  const imageSha256 =
    crypto
      .createHash('sha256')
      .update(imageBuffer)
      .digest('hex');

  /*
   * Schema creation and persistence occur only after
   * authoritative customer validation and a successful
   * governed AI response. Failed AI calls do not invent
   * prescription records.
   */
  await ensurePrescriptionSchema();

  const [rows] =
    await sequelize.query(
      `
        INSERT INTO
          customer_prescriptions (
            customer_id,
            original_filename,
            media_type,
            image_sha256,
            image_byte_size,
            image_data,
            ocr_status,
            analysis_status,
            review_required,
            confirmation_required,
            raw_ocr_text,
            ai_result,
            customer_verification_status,
            created_at,
            updated_at
          )
        VALUES (
          :customer_id,
          :original_filename,
          :media_type,
          :image_sha256,
          :image_byte_size,
          :image_data,
          :ocr_status,
          :analysis_status,
          :review_required,
          :confirmation_required,
          :raw_ocr_text,
          CAST(
            :ai_result
            AS jsonb
          ),
          'unverified',
          NOW(),
          NOW()
        )
        RETURNING *
      `,
      {
        replacements: {
          customer_id:
            customerId,

          original_filename:
            originalFilename,

          media_type:
            mediaType,

          image_sha256:
            imageSha256,

          image_byte_size:
            imageBuffer.length,

          image_data:
            imageBuffer,

          ocr_status:
            boundedText(
              aiResult
                ?.ocr_result
                ?.status,
              64
            ) || null,

          analysis_status:
            boundedText(
              aiResult
                ?.prescription_analysis
                ?.status,
              64
            ) || null,

          review_required:
            reviewState
              .reviewRequired,

          confirmation_required:
            reviewState
              .confirmationRequired,

          raw_ocr_text:
            String(
              aiResult
                ?.ocr_result
                ?.raw_text ||
              ''
            ),

          ai_result:
            JSON.stringify(
              aiResult
            ),
        },
      }
    );

  return mapPrescription(
    rows[0]
  );
}

async function listCustomerPrescriptions(
  customerIdValue
) {
  await ensurePrescriptionSchema();

  const customerId =
    positiveInteger(
      customerIdValue,
      'PRESCRIPTION_INVALID_CUSTOMER_ID'
    );

  await requireCustomer(
    customerId
  );

  const rows =
    await sequelize.query(
      `
        SELECT
          prescription_id,
          customer_id,
          original_filename,
          media_type,
          image_sha256,
          image_byte_size,
          ocr_status,
          analysis_status,
          review_required,
          confirmation_required,
          customer_verification_status,
          confirmed_at,
          created_at,
          updated_at
        FROM customer_prescriptions
        WHERE customer_id =
              :customer_id
        ORDER BY
          created_at DESC,
          prescription_id DESC
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
    (row) => ({
      ...mapPrescription({
        ...row,
        raw_ocr_text: '',
        ai_result: null,
        customer_corrections: null,
      }),

      raw_ocr_text:
        undefined,

      ai_result:
        undefined,

      customer_corrections:
        undefined,
    })
  );
}

async function getCustomerPrescription(
  customerIdValue,
  prescriptionIdValue
) {
  await ensurePrescriptionSchema();

  const customerId =
    positiveInteger(
      customerIdValue,
      'PRESCRIPTION_INVALID_CUSTOMER_ID'
    );

  const prescriptionId =
    positiveInteger(
      prescriptionIdValue
    );

  const rows =
    await sequelize.query(
      `
        SELECT *
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
    throw prescriptionError(
      'PRESCRIPTION_NOT_FOUND',
      'Prescription not found',
      404
    );
  }

  return mapPrescription(
    rows[0]
  );
}


function normalizeCustomerConfirmation(
  payload,
  aiResult
) {
  const medicines =
    payload?.medicines;

  if (
    !Array.isArray(medicines) ||
    medicines.length < 1 ||
    medicines.length > 20
  ) {
    throw prescriptionError(
      'PRESCRIPTION_INVALID_CONFIRMATION',
      'medicines must contain between 1 and 20 entries',
      400
    );
  }

  const sourceCandidates =
    Array.isArray(
      aiResult
        ?.prescription_analysis
        ?.candidates
    )
      ? aiResult
          .prescription_analysis
          .candidates
      : [];

  const sourceIds =
    new Set(
      sourceCandidates
        .map(
          (candidate) =>
            String(
              candidate?.candidate_id ||
              ''
            ).trim()
        )
        .filter(Boolean)
    );

  const seenSourceIds =
    new Set();

  const normalized =
    medicines.map(
      (medicine, index) => {
        if (
          !medicine ||
          typeof medicine !== 'object' ||
          Array.isArray(medicine)
        ) {
          throw prescriptionError(
            'PRESCRIPTION_INVALID_CONFIRMATION',
            `Medicine entry ${index + 1} is invalid`,
            400
          );
        }

        for (
          const forbidden of [
            'product_id',
            'product',
            'product_salt',
            'product_generic_name',
            'product_status',
            'product_requires_rx',
          ]
        ) {
          if (
            Object.prototype
              .hasOwnProperty
              .call(
                medicine,
                forbidden
              )
          ) {
            throw prescriptionError(
              'PRESCRIPTION_CLIENT_PRODUCT_IDENTITY_FORBIDDEN',
              'Customer confirmation cannot author Product identity',
              400
            );
          }
        }

        const action =
          boundedText(
            medicine.action,
            16
          ).toLowerCase();

        const allowedActions =
          new Set([
            'confirmed',
            'corrected',
            'rejected',
            'manual',
          ]);

        if (
          !allowedActions.has(
            action
          )
        ) {
          throw prescriptionError(
            'PRESCRIPTION_INVALID_CONFIRMATION_ACTION',
            'Confirmation action must be confirmed, corrected, rejected, or manual',
            400
          );
        }

        const candidateId =
          medicine.candidate_id ===
            null ||
          medicine.candidate_id ===
            undefined ||
          String(
            medicine.candidate_id
          ).trim() === ''
            ? null
            : boundedText(
                medicine.candidate_id,
                100
              );

        if (
          candidateId &&
          !sourceIds.has(
            candidateId
          )
        ) {
          throw prescriptionError(
            'PRESCRIPTION_UNKNOWN_CANDIDATE',
            `Unknown prescription candidate: ${candidateId}`,
            400
          );
        }

        if (
          candidateId &&
          seenSourceIds.has(
            candidateId
          )
        ) {
          throw prescriptionError(
            'PRESCRIPTION_DUPLICATE_CANDIDATE',
            `Candidate confirmed more than once: ${candidateId}`,
            400
          );
        }

        if (
          candidateId
        ) {
          seenSourceIds.add(
            candidateId
          );
        }

        if (
          action === 'manual' &&
          candidateId
        ) {
          throw prescriptionError(
            'PRESCRIPTION_INVALID_MANUAL_ENTRY',
            'Manual entries must not claim an OCR candidate identifier',
            400
          );
        }

        if (
          action !== 'manual' &&
          !candidateId
        ) {
          throw prescriptionError(
            'PRESCRIPTION_CANDIDATE_REQUIRED',
            'OCR confirmation entries require candidate_id',
            400
          );
        }

        const name =
          boundedText(
            medicine.name,
            160
          );

        const strength =
          boundedText(
            medicine.strength,
            80
          ) || null;

        if (
          action !== 'rejected' &&
          !name
        ) {
          throw prescriptionError(
            'PRESCRIPTION_CONFIRMED_NAME_REQUIRED',
            'Confirmed or corrected medicine name is required',
            400
          );
        }

        return {
          candidate_id:
            candidateId,

          action,

          name:
            name || null,

          strength,
        };
      }
    );

  for (
    const sourceId of
    sourceIds
  ) {
    if (
      !seenSourceIds.has(
        sourceId
      )
    ) {
      throw prescriptionError(
        'PRESCRIPTION_CANDIDATE_CONFIRMATION_INCOMPLETE',
        `Extracted candidate must be confirmed, corrected, or rejected: ${sourceId}`,
        400
      );
    }
  }

  return normalized;
}

async function confirmCustomerPrescription(
  customerIdValue,
  prescriptionIdValue,
  payload = {}
) {
  await ensurePrescriptionSchema();

  const customerId =
    positiveInteger(
      customerIdValue,
      'PRESCRIPTION_INVALID_CUSTOMER_ID'
    );

  const prescriptionId =
    positiveInteger(
      prescriptionIdValue
    );

  await requireCustomer(
    customerId
  );

  return sequelize.transaction(
    async (transaction) => {
      const rows =
        await sequelize.query(
          `
            SELECT *
            FROM customer_prescriptions
            WHERE prescription_id =
                  :prescription_id
              AND customer_id =
                  :customer_id
            LIMIT 1
            FOR UPDATE
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

            transaction,
          }
        );

      if (
        rows.length !== 1
      ) {
        throw prescriptionError(
          'PRESCRIPTION_NOT_FOUND',
          'Prescription not found',
          404
        );
      }

      const current =
        rows[0];

      const medicines =
        normalizeCustomerConfirmation(
          payload,
          current.ai_result
        );

      const corrections = {
        schema_version:
          'customer-prescription-confirmation-v1',

        medicines,
      };

      if (
        current
          .customer_verification_status ===
        'confirmed'
      ) {
        const existing =
          JSON.stringify(
            current
              .customer_corrections ||
            null
          );

        const requested =
          JSON.stringify(
            corrections
          );

        if (
          existing ===
          requested
        ) {
          return mapPrescription(
            current
          );
        }

        throw prescriptionError(
          'PRESCRIPTION_ALREADY_CONFIRMED',
          'Prescription has already been confirmed and cannot be silently rewritten',
          409
        );
      }

      const [updated] =
        await sequelize.query(
          `
            UPDATE
              customer_prescriptions
            SET
              customer_verification_status =
                'confirmed',

              confirmation_required =
                FALSE,

              customer_corrections =
                CAST(
                  :customer_corrections
                  AS jsonb
                ),

              confirmed_at =
                NOW(),

              updated_at =
                NOW()
            WHERE prescription_id =
                  :prescription_id
              AND customer_id =
                  :customer_id
            RETURNING *
          `,
          {
            replacements: {
              prescription_id:
                prescriptionId,

              customer_id:
                customerId,

              customer_corrections:
                JSON.stringify(
                  corrections
                ),
            },

            transaction,
          }
        );

      return mapPrescription(
        updated[0]
      );
    }
  );
}

async function ensurePharmacistReviewSchema() {
  await ensurePrescriptionSchema();

  await sequelize.query(`
    ALTER TABLE customer_prescriptions
      ADD COLUMN IF NOT EXISTS pharmacist_review_status
        VARCHAR(32) NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS pharmacist_review_note
        TEXT,
      ADD COLUMN IF NOT EXISTS pharmacist_medicines
        JSONB,
      ADD COLUMN IF NOT EXISTS pharmacist_reviewed_by
        VARCHAR(128),
      ADD COLUMN IF NOT EXISTS pharmacist_reviewed_at
        TIMESTAMPTZ;
  `);
}

function parsePrescriptionJson(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function derivePharmacistMedicines(row) {
  const pharmacistMedicines =
    parsePrescriptionJson(
      row.pharmacist_medicines
    );

  if (Array.isArray(pharmacistMedicines)) {
    return pharmacistMedicines;
  }

  const corrections =
    parsePrescriptionJson(
      row.customer_corrections
    );

  if (
    corrections &&
    Array.isArray(corrections.medicines)
  ) {
    return corrections.medicines
      .filter(
        (medicine) =>
          medicine?.action !== 'rejected'
      )
      .map(
        (medicine, index) => ({
          id:
            medicine.candidate_id ||
            medicine.id ||
            `customer-${index + 1}`,

          name:
            medicine.name ||
            medicine.corrected_name ||
            medicine.raw_name_text ||
            '',

          dosage:
            medicine.strength ||
            medicine.dosage ||
            medicine.raw_strength_text ||
            '',

          confidence:
            medicine.confidence ??
            null,

          source:
            medicine.action ||
            'customer-confirmed',
        })
      );
  }

  const ai =
    parsePrescriptionJson(
      row.ai_result
    );

  const candidates =
    ai?.prescription_analysis?.candidates;

  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.map(
    (candidate, index) => ({
      id:
        candidate.candidate_id ||
        `ocr-${index + 1}`,

      name:
        candidate.raw_name_text ||
        '',

      dosage:
        candidate.raw_strength_text ||
        '',

      confidence:
        candidate?.source?.confidence ??
        null,

      source:
        candidate.review_required
          ? 'ocr-review-required'
          : 'ocr',
    })
  );
}

function mapPharmacistPrescription(
  row,
  includeImage = false
) {
  const medicines =
    derivePharmacistMedicines(row);

  const confidenceValues =
    medicines
      .map((medicine) =>
        Number(medicine.confidence)
      )
      .filter((value) =>
        Number.isFinite(value)
      );

  const confidence =
    confidenceValues.length
      ? Math.round(
          (
            confidenceValues.reduce(
              (sum, value) =>
                sum + value,
              0
            ) /
            confidenceValues.length
          ) * 100
        )
      : 0;

  let imageUrl = null;

  if (
    includeImage &&
    row.image_data
  ) {
    const imageBuffer =
      Buffer.isBuffer(row.image_data)
        ? row.image_data
        : Buffer.from(row.image_data);

    imageUrl =
      `data:${
        row.media_type ||
        'image/jpeg'
      };base64,${
        imageBuffer.toString('base64')
      }`;
  }

  return {
    id:
      `RX-${String(
        row.prescription_id
      ).padStart(4, '0')}`,

    prescriptionId:
      Number(row.prescription_id),

    patientName:
      row.customer_name ||
      `Customer ${row.customer_id}`,

    patientId:
      String(row.customer_id),

    uploadDate:
      row.created_at,

    originalFilename:
      row.original_filename ||
      null,

    mediaType:
      row.media_type ||
      null,

    status:
      row.pharmacist_review_status ||
      'pending',

    ocrStatus:
      row.ocr_status ||
      null,

    analysisStatus:
      row.analysis_status ||
      null,

    customerVerificationStatus:
      row.customer_verification_status ||
      null,

    reviewRequired:
      row.review_required === true,

    confirmationRequired:
      row.confirmation_required === true,

    rawOcrText:
      row.raw_ocr_text ||
      '',

    medicines,

    medicineCount:
      medicines.length,

    confidence,

    interactionCount:
      0,

    reviewNote:
      row.pharmacist_review_note ||
      '',

    reviewedAt:
      row.pharmacist_reviewed_at ||
      null,

    imageUrl,
  };
}

async function listPharmacistPrescriptions() {
  await ensurePharmacistReviewSchema();

  const [rows] =
    await sequelize.query(`
      SELECT
        cp.prescription_id,
        cp.customer_id,
        c.customer_name,
        cp.original_filename,
        cp.media_type,
        cp.ocr_status,
        cp.analysis_status,
        cp.review_required,
        cp.confirmation_required,
        cp.customer_verification_status,
        cp.raw_ocr_text,
        cp.ai_result,
        cp.customer_corrections,
        cp.pharmacist_review_status,
        cp.pharmacist_review_note,
        cp.pharmacist_medicines,
        cp.pharmacist_reviewed_by,
        cp.pharmacist_reviewed_at,
        cp.created_at,
        cp.updated_at
      FROM customer_prescriptions cp
      JOIN customer c
        ON c.customer_id =
           cp.customer_id
      ORDER BY
        cp.created_at DESC,
        cp.prescription_id DESC
      LIMIT 200
    `);

  return rows.map(
    (row) =>
      mapPharmacistPrescription(
        row,
        false
      )
  );
}

async function getPharmacistPrescription(
  prescriptionIdValue
) {
  await ensurePharmacistReviewSchema();

  const prescriptionId =
    positiveInteger(
      prescriptionIdValue,
      'PRESCRIPTION_INVALID_ID'
    );

  const [rows] =
    await sequelize.query(
      `
        SELECT
          cp.*,
          c.customer_name
        FROM customer_prescriptions cp
        JOIN customer c
          ON c.customer_id =
             cp.customer_id
        WHERE cp.prescription_id =
              :prescription_id
        LIMIT 1
      `,
      {
        replacements: {
          prescription_id:
            prescriptionId,
        },
      }
    );

  if (rows.length !== 1) {
    throw prescriptionError(
      'PRESCRIPTION_NOT_FOUND',
      'Prescription not found',
      404
    );
  }

  return mapPharmacistPrescription(
    rows[0],
    true
  );
}

async function reviewPharmacistPrescription(
  prescriptionIdValue,
  pharmacistId,
  payload = {}
) {
  await ensurePharmacistReviewSchema();

  const prescriptionId =
    positiveInteger(
      prescriptionIdValue,
      'PRESCRIPTION_INVALID_ID'
    );

  const status =
    String(
      payload.status || ''
    )
      .trim()
      .toLowerCase();

  const allowed =
    new Set([
      'approved',
      'flagged',
      'rejected',
    ]);

  if (!allowed.has(status)) {
    throw prescriptionError(
      'PRESCRIPTION_INVALID_REVIEW_STATUS',
      'Review status must be approved, flagged, or rejected',
      400
    );
  }

  const note =
    String(
      payload.note || ''
    ).trim();

  if (
    (
      status === 'rejected' ||
      status === 'flagged'
    ) &&
    !note
  ) {
    throw prescriptionError(
      'PRESCRIPTION_REVIEW_NOTE_REQUIRED',
      'A pharmacist note is required for flagging or rejection',
      400
    );
  }

  const medicines =
    Array.isArray(payload.medicines)
      ? payload.medicines
          .slice(0, 20)
          .map(
            (medicine, index) => ({
              id:
                medicine?.id ||
                `pharmacist-${index + 1}`,

              name:
                String(
                  medicine?.name || ''
                ).trim(),

              dosage:
                String(
                  medicine?.dosage || ''
                ).trim(),

              source:
                'pharmacist-reviewed',
            })
          )
          .filter(
            (medicine) =>
              medicine.name
          )
      : [];

  if (
    status === 'approved' &&
    medicines.length === 0
  ) {
    throw prescriptionError(
      'PRESCRIPTION_MEDICINES_REQUIRED',
      'At least one pharmacist-reviewed medicine is required before approval',
      400
    );
  }

  const [rows] =
    await sequelize.query(
      `
        UPDATE customer_prescriptions
        SET
          pharmacist_review_status =
            :status,

          pharmacist_review_note =
            :note,

          pharmacist_medicines =
            CAST(
              :medicines
              AS JSONB
            ),

          pharmacist_reviewed_by =
            :reviewed_by,

          pharmacist_reviewed_at =
            NOW(),

          updated_at =
            NOW()

        WHERE prescription_id =
              :prescription_id

        RETURNING
          prescription_id
      `,
      {
        replacements: {
          prescription_id:
            prescriptionId,

          status,

          note:
            note || null,

          medicines:
            JSON.stringify(
              medicines
            ),

          reviewed_by:
            String(
              pharmacistId ??
              ''
            ),
        },
      }
    );

  if (rows.length !== 1) {
    throw prescriptionError(
      'PRESCRIPTION_NOT_FOUND',
      'Prescription not found',
      404
    );
  }

  return getPharmacistPrescription(
    prescriptionId
  );
}

module.exports = {
  AI_SERVICE_URL,
  PRESCRIPTION_AI_URL,
  OCR_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
  ensurePrescriptionSchema,
  analyzePrescription,
  listCustomerPrescriptions,
  getCustomerPrescription,
  confirmCustomerPrescription,
  listPharmacistPrescriptions,
  getPharmacistPrescription,
  reviewPharmacistPrescription,
};
