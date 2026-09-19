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
  'EUC-08 routes separate customer and pharmacist authentication',
  () => {
    const source =
      read(
        'src/routes/consultationRoutes.js'
      );

    assert.match(
      source,
      /verifyCustomerToken/
    );

    assert.match(
      source,
      /authenticate/
    );

    assert.match(
      source,
      /\/customer/
    );

    assert.match(
      source,
      /\/queue/
    );

    assert.match(
      source,
      /\/:consultationId\/guidance/
    );
  }
);

test(
  'consultations use isolated additive table without destructive commerce mutation',
  () => {
    const source =
      read(
        'src/services/pharmacistConsultationService.js'
      );

    assert.match(
      source,
      /CREATE TABLE IF NOT EXISTS\s+pharmacist_consultations/
    );

    assert.doesNotMatch(
      source,
      /sequelize\.sync/
    );

    assert.doesNotMatch(
      source,
      /DROP TABLE|TRUNCATE TABLE|DELETE FROM invoice|ALTER TABLE invoice/i
    );
  }
);

test(
  'customer cannot author DDI status or interaction evidence',
  () => {
    const source =
      read(
        'src/services/pharmacistConsultationService.js'
      );

    assert.match(
      source,
      /require\('\.\/ddiService'\)/
    );

    assert.match(
      source,
      /FROM product/
    );

    assert.match(
      source,
      /product_salt/
    );

    assert.match(
      source,
      /ddiService\.checkCart/
    );

    assert.match(
      source,
      /payload\.items/
    );

    assert.doesNotMatch(
      source,
      /normalizeDdiStatus\s*\(\s*payload\.ddi_status/
    );

    assert.doesNotMatch(
      source,
      /normalizeWarnings\s*\(\s*payload\.interaction_details/
    );
  }
);

test(
  'consultation creation requires authoritative DDI review-required result',
  () => {
    const source =
      read(
        'src/services/pharmacistConsultationService.js'
      );

    assert.match(
      source,
      /WARNING_REVIEW_REQUIRED/
    );

    assert.match(
      source,
      /UNRESOLVED_REVIEW_REQUIRED/
    );

    assert.match(
      source,
      /checkout_allowed ===\s*true/
    );

    assert.match(
      source,
      /CONSULT_NOT_REVIEWABLE/
    );
  }
);

test(
  'pharmacist operations verify active approved pharmacist in users table',
  () => {
    const service =
      read(
        'src/services/pharmacistConsultationService.js'
      );

    const controller =
      read(
        'src/controllers/consultationController.js'
      );

    assert.match(
      service,
      /FROM users/
    );

    assert.match(
      service,
      /role[\s\S]*pharmacist/
    );

    assert.match(
      service,
      /is_active/
    );

    assert.match(
      service,
      /is_approved/
    );

    assert.match(
      service,
      /CONSULT_STAFF_FORBIDDEN/
    );

    assert.match(
      controller,
      /listQueue\(\s*req\.user\.id/
    );

    assert.match(
      controller,
      /getStaffConsultation\(\s*req\.user\.id/
    );
  }
);

test(
  'pending duplicate consultation is idempotent',
  () => {
    const source =
      read(
        'src/services/pharmacistConsultationService.js'
      );

    assert.match(
      source,
      /review_fingerprint/
    );

    assert.match(
      source,
      /uq_pharmacist_consultations_pending_review/
    );

    assert.match(
      source,
      /status = 'pending'/
    );
  }
);

test(
  'pharmacist response is guidance only and cannot bypass DDI checkout',
  () => {
    const service =
      read(
        'src/services/pharmacistConsultationService.js'
      );

    const controller =
      read(
        'src/controllers/consultationController.js'
      );

    const combined =
      `${service}\n${controller}`;

    assert.match(
      combined,
      /pharmacist_guidance/
    );

    assert.doesNotMatch(
      combined,
      /checkout_allowed\s*=\s*true/
    );

    assert.doesNotMatch(
      combined,
      /override.*ddi|ddi.*override/i
    );

    assert.doesNotMatch(
      combined,
      /approve.*interaction|interaction.*approve/i
    );
  }
);

test(
  'service unavailable never creates an invented review',
  () => {
    const source =
      read(
        'src/services/pharmacistConsultationService.js'
      );

    assert.match(
      source,
      /DDI_SERVICE_UNAVAILABLE/
    );

    const ddiCheck =
      source.indexOf(
        'await runAuthoritativeDdi'
      );

    const insert =
      source.indexOf(
        'INSERT INTO'
      );

    assert.ok(
      ddiCheck >= 0
    );

    assert.ok(
      insert > ddiCheck
    );
  }
);

test(
  'server exposes consultation API',
  () => {
    const source =
      read(
        'src/server.js'
      );

    assert.match(
      source,
      /consultationRoutes/
    );

    assert.match(
      source,
      /\/api\/consultations/
    );
  }
);
