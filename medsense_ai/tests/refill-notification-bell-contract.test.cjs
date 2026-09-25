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
  'storefront bell preserves real order notifications',
  () => {
    const source =
      read(
        'src/components/storefront/NotificationBell.jsx'
      );

    assert.match(
      source,
      /getCustomerOrders/
    );

    assert.match(
      source,
      /order-\$\{order\.invoice_id\}/
    );

    assert.match(
      source,
      /href:[\s\S]*'\/orders'/
    );
  }
);

test(
  'storefront bell reads real customer refill reminders',
  () => {
    const source =
      read(
        'src/components/storefront/NotificationBell.jsx'
      );

    assert.match(
      source,
      /getRefillReminders/
    );

    assert.match(
      source,
      /refill-\$\{reminder\.reminder_id\}/
    );

    assert.match(
      source,
      /href:[\s\S]*'\/refills'/
    );
  }
);

test(
  'only active due-today or overdue refills enter the bell',
  () => {
    const source =
      read(
        'src/components/storefront/NotificationBell.jsx'
      );

    assert.match(
      source,
      /lifecycle_status[\s\S]*'active'/
    );

    assert.match(
      source,
      /state !== 'DUE_TODAY'[\s\S]*state !== 'OVERDUE'/
    );

    assert.doesNotMatch(
      source,
      /state === 'SCHEDULED'[\s\S]*return \{/
    );
  }
);

test(
  'refill bell copy is factual and based on selected reminder date',
  () => {
    const source =
      read(
        'src/components/storefront/NotificationBell.jsx'
      );

    assert.match(
      source,
      /Your selected reminder date/
    );

    assert.match(
      source,
      /has passed/
    );

    assert.match(
      source,
      /is today/
    );

    assert.doesNotMatch(
      source,
      /medicine is due|time to take|running out|needs refill/i
    );
  }
);

test(
  'refill bell never claims a notification was sent',
  () => {
    const source =
      read(
        'src/components/storefront/NotificationBell.jsx'
      );

    assert.doesNotMatch(
      source,
      /reminder sent|notification sent|follow-up sent/i
    );
  }
);

test(
  'bell navigation never mutates cart or bypasses DDI',
  () => {
    const source =
      read(
        'src/components/storefront/NotificationBell.jsx'
      );

    assert.doesNotMatch(
      source,
      /\baddItem\s*\(|\/cart|checkout|ddi-check/i
    );
  }
);

test(
  'order failure does not erase independently available refill notifications',
  () => {
    const source =
      read(
        'src/components/storefront/NotificationBell.jsx'
      );

    assert.match(
      source,
      /let orderNotifications[\s\S]*let refillNotifications/
    );

    assert.match(
      source,
      /Failed to load order notifications/
    );

    assert.match(
      source,
      /Failed to load refill notifications/
    );

    assert.match(
      source,
      /\.\.\.refillNotifications[\s\S]*\.\.\.orderNotifications/
    );
  }
);

test(
  'bell continues periodic refresh without synthetic timers',
  () => {
    const source =
      read(
        'src/components/storefront/NotificationBell.jsx'
      );

    assert.match(
      source,
      /window\.setInterval[\s\S]*30000/
    );

    assert.match(
      source,
      /window\.clearInterval/
    );

    assert.doesNotMatch(
      source,
      /setTimeout/
    );
  }
);
