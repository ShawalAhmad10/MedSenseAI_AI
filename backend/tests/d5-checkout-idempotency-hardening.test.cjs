const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const { sequelize } =
  require('../src/config/database');

const checkoutService =
  require('../src/services/checkoutIdempotencyService');

const invoiceNumberService =
  require('../src/services/invoiceNumberService');


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


function compact(sql) {
  return String(sql)
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}


test(
  'checkout lifecycle accepts governed CART and BUY_NOW ids only',
  () => {
    assert.equal(
      checkoutService
        .normalizeCartInstanceId(
          'cart-safe-abcdefghijklmnop'
        ),
      'cart-safe-abcdefghijklmnop'
    );

    assert.equal(
      checkoutService
        .normalizeCartInstanceId(
          'buy-now-abcdefghijklmnop'
        ),
      'buy-now-abcdefghijklmnop'
    );

    assert.throws(
      () =>
        checkoutService
          .normalizeCartInstanceId(
            'legacy-random-id'
          ),
      (error) =>
        error.code ===
        'CHECKOUT_INSTANCE_REQUIRED'
    );
  }
);


test(
  'checkout fingerprint is stable across item ordering and ignores client price or title',
  () => {
    const one =
      checkoutService
        .buildRequestFingerprint({
          customerIdValue: 8,
          requestBody: {
            customer_name: 'A',
            payment_method: 'cash',
            funnel_session_id: 'one',
            items: [
              {
                product_id: 2,
                quantity: 1,
                product_title: 'Fake',
                unit_price: 999
              },
              {
                product_id: 1,
                quantity: 3
              }
            ]
          }
        });

    const two =
      checkoutService
        .buildRequestFingerprint({
          customerIdValue: 8,
          requestBody: {
            customer_name: 'A',
            payment_method: 'cash',
            funnel_session_id: 'two',
            items: [
              {
                product_id: 1,
                quantity: 3,
                unit_price: 1
              },
              {
                product_id: 2,
                quantity: 1,
                product_title: 'Other'
              }
            ]
          }
        });

    assert.equal(
      one,
      two
    );
  }
);


test(
  'completed matching lifecycle replays existing order',
  { concurrency: false },
  async (t) => {
    const originalQuery =
      sequelize.query;

    t.after(() => {
      sequelize.query =
        originalQuery;
    });

    const requestBody = {
      customer_name: 'Customer',
      payment_method: 'cash',
      items: [
        {
          product_id: 12,
          quantity: 2
        }
      ]
    };

    const fingerprint =
      checkoutService
        .buildRequestFingerprint({
          customerIdValue: 5,
          requestBody
        });

    sequelize.query =
      async (sql) => {
        const normalized =
          compact(sql);

        if (
          normalized.includes(
            'pg_advisory_xact_lock'
          )
        ) {
          return [[], {}];
        }

        if (
          normalized.includes(
            'FROM storefront_checkout_idempotency'
          )
        ) {
          return [[{
            cart_instance_id:
              'cart-safe-abcdefghijklmnop',
            request_fingerprint:
              fingerprint,
            customer_id: 5,
            status: 'completed',
            order_id: 91
          }], {}];
        }

        if (
          normalized.includes(
            'FROM invoice'
          )
        ) {
          return [[{
            invoice_id: 91,
            invoice_number:
              'INV-000091',
            total_amount: 500,
            payment_status:
              'unpaid',
            payment_method:
              'cash',
            delivery_status:
              'pending'
          }], {}];
        }

        throw new Error(
          'Unexpected SQL: ' +
          normalized
        );
      };

    const result =
      await checkoutService
        .beginCheckout({
          cartInstanceIdValue:
            'cart-safe-abcdefghijklmnop',
          customerIdValue: 5,
          requestBody,
          transaction: {}
        });

    assert.equal(
      result.replay,
      true
    );

    assert.equal(
      result.order.orderId,
      91
    );

    assert.equal(
      result.order.orderNumber,
      'INV-000091'
    );

    assert.equal(
      result.order.idempotentReplay,
      true
    );
  }
);


test(
  'altered request cannot reuse completed lifecycle',
  { concurrency: false },
  async (t) => {
    const originalQuery =
      sequelize.query;

    t.after(() => {
      sequelize.query =
        originalQuery;
    });

    sequelize.query =
      async (sql) => {
        const normalized =
          compact(sql);

        if (
          normalized.includes(
            'pg_advisory_xact_lock'
          )
        ) {
          return [[], {}];
        }

        if (
          normalized.includes(
            'FROM storefront_checkout_idempotency'
          )
        ) {
          return [[{
            cart_instance_id:
              'cart-safe-abcdefghijklmnop',
            request_fingerprint:
              'x'.repeat(64),
            customer_id: 5,
            status: 'completed',
            order_id: 91
          }], {}];
        }

        throw new Error(
          'Unexpected SQL: ' +
          normalized
        );
      };

    await assert.rejects(
      () =>
        checkoutService
          .beginCheckout({
            cartInstanceIdValue:
              'cart-safe-abcdefghijklmnop',
            customerIdValue: 5,
            requestBody: {
              items: [
                {
                  product_id: 12,
                  quantity: 3
                }
              ]
            },
            transaction: {}
          }),
      (error) =>
        error.code ===
        'CHECKOUT_IDEMPOTENCY_CONFLICT'
    );
  }
);


test(
  'new lifecycle is reserved inside caller transaction',
  { concurrency: false },
  async (t) => {
    const originalQuery =
      sequelize.query;

    t.after(() => {
      sequelize.query =
        originalQuery;
    });

    let inserted =
      false;

    sequelize.query =
      async (sql) => {
        const normalized =
          compact(sql);

        if (
          normalized.includes(
            'pg_advisory_xact_lock'
          )
        ) {
          return [[], {}];
        }

        if (
          normalized.includes(
            'FROM storefront_checkout_idempotency'
          )
        ) {
          return [[], {}];
        }

        if (
          normalized.includes(
            'INSERT INTO storefront_checkout_idempotency'
          )
        ) {
          inserted =
            true;

          return [[], {}];
        }

        throw new Error(
          'Unexpected SQL: ' +
          normalized
        );
      };

    const result =
      await checkoutService
        .beginCheckout({
          cartInstanceIdValue:
            'buy-now-abcdefghijklmnop',
          customerIdValue: 5,
          requestBody: {
            items: [
              {
                product_id: 1,
                quantity: 1
              }
            ]
          },
          transaction: {}
        });

    assert.equal(
      result.replay,
      false
    );

    assert.equal(
      inserted,
      true
    );
  }
);


test(
  'authenticated storefront checkout requires lifecycle while anonymous legacy flow may omit it',
  () => {
    const source =
      read(
        'src/controllers/orderController.js'
      );

    assert.equal(
      source.includes(
        'hasAuthenticatedCheckoutCustomer &&'
      ),
      true
    );

    assert.equal(
      source.includes(
        '!checkoutInstanceId'
      ),
      true
    );

    assert.equal(
      source.includes(
        'if (checkoutInstanceId)'
      ),
      true
    );

    assert.equal(
      source.includes(
        'CHECKOUT_INSTANCE_REQUIRED'
      ),
      true
    );
  }
);


test(
  'replay exits before DDI invoice and stock mutation',
  () => {
    const source =
      read(
        'src/controllers/orderController.js'
      );

    const start =
      source.indexOf(
        'exports.createOrder ='
      );

    const scope =
      source.slice(start);

    const replay =
      scope.indexOf(
        'checkoutIdempotency'
      );

    const ddi =
      scope.indexOf(
        'ddiService.checkCart'
      );

    const invoice =
      scope.indexOf(
        'INSERT INTO invoice ('
      );

    assert.ok(
      replay >= 0
    );

    assert.ok(
      ddi > replay
    );

    assert.ok(
      invoice > ddi
    );
  }
);


test(
  'idempotency completion occurs before durable commerce commit',
  () => {
    const source =
      read(
        'src/controllers/orderController.js'
      );

    const start =
      source.indexOf(
        'exports.createOrder ='
      );

    const scope =
      source.slice(start);

    const complete =
      scope.indexOf(
        '.completeCheckout({'
      );

    const durableComment =
      scope.indexOf(
        'The order is durable before'
      );

    const commit =
      scope.lastIndexOf(
        'await transaction.commit();',
        durableComment
      );

    assert.ok(
      complete >= 0
    );

    assert.ok(
      commit > complete
    );
  }
);


test(
  'shared invoice number service requires caller transaction',
  async () => {
    await assert.rejects(
      () =>
        invoiceNumberService
          .generateNextInvoiceNumber(
            null
          ),
      (error) =>
        error.code ===
        'INVOICE_NUMBER_TRANSACTION_REQUIRED'
    );
  }
);


test(
  'shared invoice number service locks before reading next number',
  () => {
    const source =
      read(
        'src/services/invoiceNumberService.js'
      );

    const lock =
      source.indexOf(
        'pg_advisory_xact_lock'
      );

    const numberRead =
      source.indexOf(
        'SELECT invoice_number'
      );

    assert.ok(
      lock >= 0
    );

    assert.ok(
      numberRead > lock
    );
  }
);


test(
  'storefront and POS invoice writers use the same serialized generator',
  () => {
    const order =
      read(
        'src/controllers/orderController.js'
      );

    const invoice =
      read(
        'src/controllers/invoiceController.js'
      );

    assert.equal(
      order.includes(
        'invoiceNumberService'
      ),
      true
    );

    assert.equal(
      order.includes(
        '.generateNextInvoiceNumber('
      ),
      true
    );

    assert.equal(
      invoice.includes(
        'invoiceNumberService'
      ),
      true
    );

    assert.match(
      invoice,
      /generateInvoiceNumber\(\s*transaction\s*\)/
    );
  }
);
