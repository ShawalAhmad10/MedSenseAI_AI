const fs =
  require('node:fs');

const path =
  require('node:path');

const test =
  require('node:test');

const assert =
  require('node:assert/strict');

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
  'refill client uses customer JWT and same-origin refill API',
  () => {
    const source =
      read(
        'src/services/storefrontRefillService.js'
      );

    assert.match(
      source,
      /\/api\/refills/
    );

    assert.match(
      source,
      /medsense_customer_auth/
    );

    assert.match(
      source,
      /Authorization:[\s\S]*Bearer/
    );

    assert.doesNotMatch(
      source,
      /medsense_auth_user/
    );
  }
);

test(
  'refill client exposes complete customer lifecycle operations',
  () => {
    const source =
      read(
        'src/services/storefrontRefillService.js'
      );

    for (
      const name of [
        'getRefillSources',
        'getRefillReminders',
        'createRefillReminder',
        'rescheduleRefillReminder',
        'completeRefillReminder',
        'cancelRefillReminder',
      ]
    ) {
      assert.match(
        source,
        new RegExp(name)
      );
    }
  }
);

test(
  'active refill page no longer consumes static refill alerts',
  () => {
    const source =
      read(
        'src/pages/storefront/RefillAlertsPage.jsx'
      );

    assert.doesNotMatch(
      source,
      /storefrontData/
    );

    assert.doesNotMatch(
      source,
      /\brefillAlerts\b/
    );

    assert.doesNotMatch(
      source,
      /Paracetamol 500mg|Cetirizine 10mg/
    );

    assert.doesNotMatch(
      source,
      /Reminder sent today|Follow-up sent/
    );
  }
);

test(
  'refill page uses real delivered purchase sources',
  () => {
    const source =
      read(
        'src/pages/storefront/RefillAlertsPage.jsx'
      );

    assert.match(
      source,
      /getRefillSources/
    );

    assert.match(
      source,
      /invoice_number/
    );

    assert.match(
      source,
      /purchased_quantity/
    );

    assert.match(
      source,
      /Select a purchased medicine/
    );
  }
);

test(
  'refill date is explicitly customer selected',
  () => {
    const source =
      read(
        'src/pages/storefront/RefillAlertsPage.jsx'
      );

    assert.match(
      source,
      /You choose the reminder date/
    );

    assert.match(
      source,
      /does not infer dose frequency, days supply, medicine consumption, or clinical refill timing/
    );

    assert.doesNotMatch(
      source,
      /automatically calculated|recommended refill date|\+\s*30/
    );
  }
);

test(
  'active reminder supports reschedule complete and cancel',
  () => {
    const source =
      read(
        'src/pages/storefront/RefillAlertsPage.jsx'
      );

    assert.match(
      source,
      /rescheduleRefillReminder/
    );

    assert.match(
      source,
      /completeRefillReminder/
    );

    assert.match(
      source,
      /cancelRefillReminder/
    );

    assert.match(
      source,
      /Mark done/
    );

    assert.match(
      source,
      /Cancel reminder/
    );
  }
);

test(
  'reorder is explicit navigation and never automatic cart mutation',
  () => {
    const page =
      read(
        'src/pages/storefront/RefillAlertsPage.jsx'
      );

    const service =
      read(
        'src/services/storefrontRefillService.js'
      );

    assert.match(
      page,
      /Reorder medicine/
    );

    assert.match(
      page,
      /\/product\/\$\{productSlug/
    );

    assert.match(
      page,
      /authoritative interaction check/
    );

    assert.doesNotMatch(
      page,
      /\baddItem\s*\(/
    );

    assert.doesNotMatch(
      service,
      /\baddItem\s*\(|\/cart|checkout|ddi-check/i
    );
  }
);

test(
  'reminder UI exposes governed backend states',
  () => {
    const source =
      read(
        'src/pages/storefront/RefillAlertsPage.jsx'
      );

    for (
      const state of [
        'SCHEDULED',
        'DUE_TODAY',
        'OVERDUE',
        'COMPLETED',
        'CANCELLED',
      ]
    ) {
      assert.match(
        source,
        new RegExp(state)
      );
    }
  }
);
