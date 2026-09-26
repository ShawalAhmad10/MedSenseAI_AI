import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';


function read(path) {
  return fs.readFileSync(
    path,
    'utf8'
  );
}


const service =
  read(
    'src/services/storefrontOrderService.js'
  );

const account =
  read(
    'src/pages/storefront/AccountPage.jsx'
  );

const orders =
  read(
    'src/pages/storefront/OrdersPage.jsx'
  );

const refund =
  read(
    'src/pages/storefront/RefundPage.jsx'
  );


test(
  'customer order service reads both session and remembered authentication',
  () => {
    assert.match(
      service,
      /sessionStorage\.getItem/
    );

    assert.match(
      service,
      /localStorage\.getItem/
    );

    const session =
      service.indexOf(
        'sessionStorage.getItem'
      );

    const local =
      service.indexOf(
        'localStorage.getItem'
      );

    assert.ok(
      session >= 0
    );

    assert.ok(
      local > session
    );
  }
);


test(
  'customer list uses dedicated authenticated my-orders endpoint',
  () => {
    assert.match(
      service,
      /\/my-orders\?limit=100/
    );
  }
);


test(
  'customer detail uses dedicated authenticated my-orders detail endpoint',
  () => {
    assert.match(
      service,
      /\/my-orders\/\$\{orderId\}/
    );
  }
);


test(
  'AccountPage never reads customer order detail through staff endpoint',
  () => {
    assert.match(
      account,
      /getOrderById/
    );

    assert.doesNotMatch(
      account,
      /api\.get\(`\/orders\/\$\{order\.invoice_id\}`/
    );
  }
);


test(
  'OrdersPage never reads customer order detail through staff endpoint',
  () => {
    assert.match(
      orders,
      /getOrderById/
    );

    assert.doesNotMatch(
      orders,
      /api\.get\(`\/orders\/\$\{order\.invoice_id\}`/
    );
  }
);


test(
  'RefundPage never reads customer order detail through staff endpoint',
  () => {
    assert.match(
      refund,
      /getOrderById/
    );

    assert.doesNotMatch(
      refund,
      /axios\.get\(`\$\{API\}\/orders\/\$\{o\.invoice_id\}`/
    );
  }
);


test(
  'storefront pages pass authenticated customer identity only as defensive client context',
  () => {
    for (
      const source
      of [
        account,
        orders,
        refund
      ]
    ) {
      assert.match(
        source,
        /user\.id/
      );

      assert.match(
        source,
        /user\.email/
      );

      assert.match(
        source,
        /user\.phone/
      );
    }
  }
);


test(
  'storefront source contains no direct raw staff order detail request',
  () => {
    const combined =
      account +
      '\n' +
      orders +
      '\n' +
      refund;

    assert.doesNotMatch(
      combined,
      /(?:api|axios)\.get\([^\n]*\/orders\/\$\{/
    );
  }
);
