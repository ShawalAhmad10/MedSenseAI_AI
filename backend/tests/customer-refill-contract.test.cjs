const fs =
  require('node:fs');

const path =
  require('node:path');

const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const refill =
  require(
    '../src/services/customerRefillService'
  );

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
  'refill schema is isolated and additive',
  () => {
    const source =
      read(
        'src/services/customerRefillService.js'
      );

    assert.match(
      source,
      /CREATE TABLE IF NOT EXISTS[\s\S]*customer_refill_reminders/i
    );

    assert.match(
      source,
      /REFERENCES customer\(customer_id\)/i
    );

    assert.match(
      source,
      /REFERENCES invoice\(invoice_id\)/i
    );

    assert.match(
      source,
      /REFERENCES product\(product_id\)/i
    );

    assert.doesNotMatch(
      source,
      /\bDROP\s+TABLE\b|\bTRUNCATE\b/i
    );
  }
);

test(
  'refill service never mutates commerce authority tables',
  () => {
    const source =
      read(
        'src/services/customerRefillService.js'
      );

    assert.doesNotMatch(
      source,
      /UPDATE\s+(invoice|invoice_report|product|customer)\b/i
    );

    assert.doesNotMatch(
      source,
      /DELETE\s+FROM\s+(invoice|invoice_report|product|customer)\b/i
    );

    assert.doesNotMatch(
      source,
      /INSERT\s+INTO\s+(invoice|invoice_report|product|customer)\b/i
    );
  }
);

test(
  'source eligibility requires delivered or returned purchase with remaining quantity',
  () => {
    const source =
      read(
        'src/services/customerRefillService.js'
      );

    assert.match(
      source,
      /'delivered'[\s\S]*'returned'/i
    );

    assert.match(
      source,
      /HAVING SUM\([\s\S]*quantity[\s\S]*\)\s*>\s*0/i
    );

    assert.match(
      source,
      /i\.customer_id\s*=\s*:customer_id/i
    );
  }
);

test(
  'payment status is not used as refill eligibility',
  () => {
    const source =
      read(
        'src/services/customerRefillService.js'
      );

    assert.doesNotMatch(
      source,
      /payment_status/
    );
  }
);

test(
  'refill timing is explicitly customer selected rather than clinically inferred',
  () => {
    const source =
      read(
        'src/services/customerRefillService.js'
      );

    assert.match(
      source,
      /reminder_date/
    );

    assert.match(
      source,
      /customer-selected/
    );

    assert.doesNotMatch(
      source,
      /days_supply|dose_per_day|doses_per_day|frequency_per_day|\+\s*30/i
    );
  }
);

test(
  'reminder date rejects invalid or past dates',
  () => {
    assert.equal(
      refill.validateReminderDate(
        '2026-09-20',
        '2026-09-19'
      ),
      '2026-09-20'
    );

    assert.throws(
      () =>
        refill.validateReminderDate(
          '2026-09-18',
          '2026-09-19'
        ),
      /cannot be in the past/
    );

    assert.throws(
      () =>
        refill.validateReminderDate(
          '19-09-2026',
          '2026-09-19'
        ),
      /YYYY-MM-DD/
    );
  }
);

test(
  'reminder state is deterministically scheduled due today or overdue',
  () => {
    assert.equal(
      refill.deriveReminderState(
        '2026-09-20',
        'active',
        '2026-09-19'
      ),
      'SCHEDULED'
    );

    assert.equal(
      refill.deriveReminderState(
        '2026-09-19',
        'active',
        '2026-09-19'
      ),
      'DUE_TODAY'
    );

    assert.equal(
      refill.deriveReminderState(
        '2026-09-18',
        'active',
        '2026-09-19'
      ),
      'OVERDUE'
    );
  }
);

test(
  'completed and cancelled lifecycle states are preserved',
  () => {
    assert.equal(
      refill.deriveReminderState(
        '2026-09-18',
        'completed',
        '2026-09-19'
      ),
      'COMPLETED'
    );

    assert.equal(
      refill.deriveReminderState(
        '2026-09-18',
        'cancelled',
        '2026-09-19'
      ),
      'CANCELLED'
    );
  }
);

test(
  'only one active reminder is allowed per purchased medicine source',
  () => {
    const source =
      read(
        'src/services/customerRefillService.js'
      );

    assert.match(
      source,
      /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*customer_id[\s\S]*source_invoice_id[\s\S]*product_id[\s\S]*WHERE lifecycle_status = 'active'/i
    );

    assert.match(
      source,
      /REFILL_ACTIVE_REMINDER_EXISTS/
    );
  }
);

test(
  'all refill routes require customer authentication',
  () => {
    const source =
      read(
        'src/routes/customerRefillRoutes.js'
      );

    assert.match(
      source,
      /verifyCustomerToken/
    );

    const routeCalls =
      source.match(
        /router\.(get|post|patch|delete)\(/g
      ) || [];

    const guards =
      source.match(
        /verifyCustomerToken/g
      ) || [];

    assert.equal(
      routeCalls.length,
      6
    );

    assert.equal(
      guards.length,
      7
    );
  }
);

test(
  'refill API does not add to cart or bypass DDI',
  () => {
    const service =
      read(
        'src/services/customerRefillService.js'
      );

    const controller =
      read(
        'src/controllers/customerRefillController.js'
      );

    assert.doesNotMatch(
      service,
      /cart|checkout|ddi-check/i
    );

    assert.doesNotMatch(
      controller,
      /cart|checkout|ddi-check/i
    );
  }
);

test(
  'server exposes customer refill API',
  () => {
    const source =
      read(
        'src/server.js'
      );

    assert.match(
      source,
      /customerRefillRoutes/
    );

    assert.match(
      source,
      /app\.use\('\/api\/refills', customerRefillRoutes\)/
    );
  }
);
