const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');

const ddiService =
  require('../src/services/ddiService');

function clearPayload() {
  return {
    status: 'CLEAR_WITH_LIMITATIONS',
    checkout_allowed: true,
    review_required: false,
    pharmacist_flag_required: false,
    highest_severity: null,
    workflow_action: 'CLEAR',
    products: [],
    pairs: [],
  };
}

test(
  'DDI timeout propagates and never invents clearance',
  { concurrency: false },
  async (t) => {
    const originalPost = axios.post;

    t.after(() => {
      axios.post = originalPost;
    });

    axios.post =
      async (url, body, options) => {
        assert.equal(
          options.timeout > 0,
          true
        );

        const error =
          new Error('timeout');

        error.code =
          'ECONNABORTED';

        throw error;
      };

    await assert.rejects(
      () =>
        ddiService.checkCart([
          { product_id: 900012 },
        ]),
      (error) =>
        error &&
        error.code ===
          'ECONNABORTED'
    );
  }
);

test(
  'DDI socket timeout propagates fail closed',
  { concurrency: false },
  async (t) => {
    const originalPost = axios.post;

    t.after(() => {
      axios.post = originalPost;
    });

    axios.post = async () => {
      const error =
        new Error('socket timeout');

      error.code =
        'ETIMEDOUT';

      throw error;
    };

    await assert.rejects(
      () =>
        ddiService.checkCart([
          { product_id: 900012 },
        ]),
      (error) =>
        error &&
        error.code ===
          'ETIMEDOUT'
    );
  }
);

test(
  'null empty and malformed DDI bodies fail closed',
  { concurrency: false },
  async (t) => {
    const originalPost = axios.post;

    t.after(() => {
      axios.post = originalPost;
    });

    const malformedBodies = [
      null,
      {},
      [],
      'CLEAR',
    ];

    for (
      const body of malformedBodies
    ) {
      axios.post =
        async () => ({
          status: 200,
          data: body,
        });

      await assert.rejects(
        () =>
          ddiService.checkCart([
            { product_id: 900012 },
          ]),
        (error) =>
          error &&
          error.code ===
            'DDI_INVALID_RESPONSE' &&
          error.upstreamStatus ===
            200
      );
    }
  }
);

test(
  'raw upstream HTTP failure cannot become successful clearance',
  { concurrency: false },
  async (t) => {
    const originalPost = axios.post;

    t.after(() => {
      axios.post = originalPost;
    });

    for (
      const upstreamStatus of
        [500, 502]
    ) {
      axios.post =
        async () => ({
          status:
            upstreamStatus,
          data:
            clearPayload(),
        });

      const result =
        await ddiService.checkCart([
          { product_id: 900012 },
        ]);

      assert.equal(
        result.httpStatus,
        upstreamStatus
      );

      // Even if an upstream body claims
      // clearance, the caller still receives
      // the non-200 status and must block it.
      assert.equal(
        result.result
          .checkout_allowed,
        true
      );
    }
  }
);

test(
  'order checkout rejects non-200 DDI before clearance branch',
  () => {
    const root =
      path.resolve(
        __dirname,
        '..'
      );

    const order =
      fs.readFileSync(
        path.join(
          root,
          'src/controllers/orderController.js'
        ),
        'utf8'
      );

    const createOrderStart =
      order.indexOf(
        'exports.createOrder ='
      );

    assert.ok(
      createOrderStart >= 0,
      'createOrder controller not found'
    );

    const createOrder =
      order.slice(
        createOrderStart
      );

    const non200Gate =
      createOrder.indexOf(
        'if (ddi.httpStatus !== 200)'
      );

    const clearanceGate =
      createOrder.indexOf(
        'if (!ddi.result.checkout_allowed)'
      );

    assert.ok(
      non200Gate >= 0,
      'Missing non-200 DDI gate'
    );

    assert.ok(
      clearanceGate > non200Gate,
      'Non-200 response must be rejected before checkout allowance is considered'
    );

    const failureWindow =
      createOrder.slice(
        non200Gate,
        clearanceGate
      );

    assert.equal(
      failureWindow.includes(
        'await transaction.rollback();'
      ),
      true
    );

    assert.equal(
      failureWindow.includes(
        'res.status(502)'
      ),
      true
    );

    assert.equal(
      failureWindow.includes(
        'DDI_UPSTREAM_ERROR'
      ),
      true
    );
  }
);

test(
  'order checkout rolls back when DDI service throws',
  () => {
    const root =
      path.resolve(
        __dirname,
        '..'
      );

    const order =
      fs.readFileSync(
        path.join(
          root,
          'src/controllers/orderController.js'
        ),
        'utf8'
      );

    const createOrderStart =
      order.indexOf(
        'exports.createOrder ='
      );

    assert.ok(
      createOrderStart >= 0,
      'createOrder controller not found'
    );

    const createOrder =
      order.slice(
        createOrderStart
      );

    const ddiTry =
      createOrder.indexOf(
        'ddi = await ddiService.checkCart'
      );

    const ddiCatch =
      createOrder.indexOf(
        '} catch (error) {',
        ddiTry
      );

    const rollback =
      createOrder.indexOf(
        'await transaction.rollback();',
        ddiCatch
      );

    const unavailableResponse =
      createOrder.indexOf(
        'DDI_SERVICE_UNAVAILABLE',
        rollback
      );

    assert.ok(
      ddiTry >= 0,
      'DDI checkout call not found'
    );

    assert.ok(
      ddiCatch > ddiTry,
      'DDI exception handler not found'
    );

    assert.ok(
      rollback > ddiCatch,
      'DDI exception must rollback transaction'
    );

    assert.ok(
      unavailableResponse > rollback,
      'DDI exception must fail closed after rollback'
    );
  }
);

test(
  'public cart DDI endpoint also fails closed on service exceptions',
  () => {
    const root =
      path.resolve(
        __dirname,
        '..'
      );

    const order =
      fs.readFileSync(
        path.join(
          root,
          'src/controllers/orderController.js'
        ),
        'utf8'
      );

    const start =
      order.indexOf(
        'exports.checkCartDDI ='
      );

    const end =
      order.indexOf(
        'exports.createOrder ='
      );

    assert.ok(
      start >= 0 &&
      end > start,
      'checkCartDDI controller window not found'
    );

    const checkCart =
      order.slice(
        start,
        end
      );

    const catchIndex =
      checkCart.indexOf(
        '} catch (error) {'
      );

    const status503 =
      checkCart.indexOf(
        'res.status(503)',
        catchIndex
      );

    const failClosedCode =
      checkCart.indexOf(
        'DDI_SERVICE_UNAVAILABLE',
        catchIndex
      );

    assert.ok(
      catchIndex >= 0,
      'DDI endpoint exception handler not found'
    );

    assert.ok(
      status503 > catchIndex,
      'DDI endpoint exception must return HTTP 503'
    );

    assert.ok(
      failClosedCode > catchIndex,
      'DDI endpoint exception must expose fail-closed service-unavailable code'
    );
  }
);
