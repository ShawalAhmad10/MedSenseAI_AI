const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { sequelize } =
  require('../src/config/database');

const funnelService =
  require('../src/services/funnelService');

const funnelController =
  require('../src/controllers/funnelController');

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('funnel metrics require pharmacist authentication while event capture remains storefront accessible', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../src/routes/funnelRoutes.js'
    ),
    'utf8'
  );

  assert.match(
    source,
    /router\.post\('\/events', optionalCustomerToken/
  );

  assert.match(
    source,
    /router\.get\('\/metrics', authenticateToken/
  );
});

test('public client event identity is stable, namespaced and partner_real', async (t) => {
  const originalQuery =
    sequelize.query;

  const originalPublish =
    funnelService.publishEvent;

  const published = [];

  sequelize.query =
    async () => [
      {
        product_id: 900001
      }
    ];

  funnelService.publishEvent =
    async (payload) => {
      published.push(payload);

      return {
        httpStatus: 200,
        result: {
          accepted: true,
          duplicate: false
        }
      };
    };

  t.after(() => {
    sequelize.query =
      originalQuery;

    funnelService.publishEvent =
      originalPublish;
  });

  const occurredAt =
    new Date().toISOString();

  const body = {
    event_id:
      'browser-event-123',
    occurred_at:
      occurredAt,
    event_name:
      'product_viewed',
    session_id:
      'session-test',
    cart_id:
      'cart-test',
    product_ids:
      [900001]
  };

  for (let index = 0; index < 2; index += 1) {
    const res =
      responseRecorder();

    await funnelController.captureEvent(
      {
        body,
        customerUser: null
      },
      res
    );

    assert.equal(
      res.statusCode,
      200
    );
  }

  assert.equal(
    published.length,
    2
  );

  assert.equal(
    published[0].event_id,
    published[1].event_id
  );

  assert.match(
    published[0].event_id,
    /^amna-client-[0-9a-f]{64}$/
  );

  assert.notEqual(
    published[0].event_id,
    body.event_id
  );

  assert.equal(
    published[0].occurred_at,
    occurredAt
  );

  assert.equal(
    published[1].occurred_at,
    occurredAt
  );

  assert.equal(
    published[0].data_origin,
    'partner_real'
  );
});

test('event_id and occurred_at must be supplied together', async (t) => {
  const originalQuery =
    sequelize.query;

  let queried = false;

  sequelize.query =
    async () => {
      queried = true;
      return [];
    };

  t.after(() => {
    sequelize.query =
      originalQuery;
  });

  const res =
    responseRecorder();

  await funnelController.captureEvent(
    {
      body: {
        event_id:
          'browser-event-123',
        event_name:
          'product_viewed',
        session_id:
          'session-test',
        cart_id:
          'cart-test',
        product_ids:
          [900001]
      }
    },
    res
  );

  assert.equal(
    res.statusCode,
    400
  );

  assert.equal(
    res.body.code,
    'INVALID_FUNNEL_EVENT_IDENTITY'
  );

  assert.equal(
    queried,
    false
  );
});

test('malformed or stale client timestamp is rejected before DB lookup', async (t) => {
  const originalQuery =
    sequelize.query;

  let queried = false;

  sequelize.query =
    async () => {
      queried = true;
      return [];
    };

  t.after(() => {
    sequelize.query =
      originalQuery;
  });

  const res =
    responseRecorder();

  await funnelController.captureEvent(
    {
      body: {
        event_id:
          'browser-event-123',
        occurred_at:
          '2000-01-01T00:00:00.000Z',
        event_name:
          'product_viewed',
        session_id:
          'session-test',
        cart_id:
          'cart-test',
        product_ids:
          [900001]
      }
    },
    res
  );

  assert.equal(
    res.statusCode,
    400
  );

  assert.equal(
    queried,
    false
  );
});