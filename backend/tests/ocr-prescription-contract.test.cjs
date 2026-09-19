const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

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
  'prescription routes require customer authentication',
  () => {
    const source =
      read(
        'src/routes/prescriptionRoutes.js'
      );

    assert.match(
      source,
      /verifyCustomerToken/
    );

    assert.match(
      source,
      /router\.post\(\s*'\/analyze'/
    );

    assert.match(
      source,
      /router\.get\(\s*'\/'/
    );
  }
);

test(
  'Express bridge reuses governed FastAPI prescription endpoint',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    assert.match(
      source,
      /\/api\/v1\/integrations\/amna\/prescription\/analyze/
    );

    assert.match(
      source,
      /image_base64/
    );

    assert.match(
      source,
      /media_type/
    );

    assert.match(
      source,
      /products/
    );
  }
);

test(
  'authoritative Product snapshot is loaded from PostgreSQL',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    assert.match(
      source,
      /FROM product/
    );

    assert.match(
      source,
      /product_generic_name/
    );

    assert.match(
      source,
      /product_salt/
    );

    assert.match(
      source,
      /product_requires_rx/
    );

    assert.match(
      source,
      /WHERE product_status = 1/
    );
  }
);

test(
  'OCR input is limited to PNG or JPEG and five megabytes',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    assert.match(
      source,
      /image\/png/
    );

    assert.match(
      source,
      /image\/jpeg/
    );

    assert.match(
      source,
      /5 \* 1024 \* 1024/
    );

    assert.doesNotMatch(
      source,
      /application\/pdf/
    );
  }
);

test(
  'prescription persistence is isolated and additive',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    assert.match(
      source,
      /CREATE TABLE IF NOT EXISTS\s+customer_prescriptions/
    );

    assert.match(
      source,
      /ai_result\s+JSONB/
    );

    assert.match(
      source,
      /customer_corrections\s+JSONB/
    );

    assert.doesNotMatch(
      source,
      /sequelize\.sync/
    );

    assert.doesNotMatch(
      source,
      /ALTER TABLE invoice|DELETE FROM invoice|TRUNCATE TABLE|DROP TABLE/i
    );
  }
);

test(
  'original AI evidence and customer corrections are separate',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    assert.match(
      source,
      /raw_ocr_text/
    );

    assert.match(
      source,
      /ai_result/
    );

    assert.match(
      source,
      /customer_verification_status/
    );

    assert.match(
      source,
      /customer_corrections/
    );
  }
);

test(
  'failed AI call cannot create a prescription record',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    const aiCall =
      source.indexOf(
        'await callPrescriptionAi'
      );

    const insert =
      source.indexOf(
        'INSERT INTO'
      );

    assert.ok(
      aiCall >= 0
    );

    assert.ok(
      insert > aiCall
    );
  }
);

test(
  'prescription reads are customer-owned',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    assert.match(
      source,
      /WHERE prescription_id =[\s\S]*customer_id =/
    );
  }
);

test(
  'server exposes authenticated prescription API',
  () => {
    const source =
      read(
        'src/server.js'
      );

    assert.match(
      source,
      /prescriptionRoutes/
    );

    assert.match(
      source,
      /\/api\/prescriptions/
    );
  }
);

test(
  'manual confirmation preserves original OCR evidence',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    assert.match(
      source,
      /customer_corrections/
    );

    assert.match(
      source,
      /customer_verification_status/
    );

    assert.match(
      source,
      /confirmed_at/
    );

    assert.match(
      source,
      /confirmation_required\s*=\s*FALSE/
    );

    assert.doesNotMatch(
      source,
      /SET[\s\S]{0,250}raw_ocr_text\s*=/i
    );

    assert.doesNotMatch(
      source,
      /SET[\s\S]{0,250}ai_result\s*=/i
    );
  }
);

test(
  'customer cannot author Product identity during OCR confirmation',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    assert.match(
      source,
      /PRESCRIPTION_CLIENT_PRODUCT_IDENTITY_FORBIDDEN/
    );

    assert.match(
      source,
      /product_id/
    );

    assert.match(
      source,
      /product_salt/
    );
  }
);

test(
  'every extracted OCR candidate must be explicitly addressed',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    assert.match(
      source,
      /PRESCRIPTION_CANDIDATE_CONFIRMATION_INCOMPLETE/
    );

    assert.match(
      source,
      /seenSourceIds/
    );
  }
);

test(
  'confirmed prescription cannot be silently rewritten',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    assert.match(
      source,
      /PRESCRIPTION_ALREADY_CONFIRMED/
    );

    assert.match(
      source,
      /FOR UPDATE/
    );

    assert.match(
      source,
      /sequelize\.transaction/
    );
  }
);

test(
  'manual confirmation remains customer authenticated',
  () => {
    const source =
      read(
        'src/routes/prescriptionRoutes.js'
      );

    assert.match(
      source,
      /verifyCustomerToken/
    );

    assert.match(
      source,
      /\/:prescriptionId\/confirm/
    );

    assert.match(
      source,
      /prescriptionController\.confirmMine/
    );
  }
);

test(
  'original prescription image bytes are persisted additively',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    assert.match(
      source,
      /image_data\s+BYTEA\s+NULL/
    );

    assert.match(
      source,
      /ADD COLUMN IF NOT EXISTS[\s\S]*image_data BYTEA NULL/
    );

    assert.match(
      source,
      /image_data:\s*imageBuffer/
    );

    assert.match(
      source,
      /:image_data/
    );
  }
);

test(
  'stored image integrity is tied to byte size',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    assert.match(
      source,
      /customer_prescriptions_image_data_size_chk/
    );

    assert.match(
      source,
      /OCTET_LENGTH\(image_data\)[\s\S]*image_byte_size/
    );
  }
);

test(
  'normal prescription JSON mapper never exposes image bytes',
  () => {
    const source =
      read(
        'src/services/prescriptionService.js'
      );

    const start =
      source.indexOf(
        'function mapPrescription'
      );

    const end =
      source.indexOf(
        'async function analyzePrescription',
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    const mapper =
      source.slice(
        start,
        end
      );

    assert.doesNotMatch(
      mapper,
      /image_data/
    );
  }
);
