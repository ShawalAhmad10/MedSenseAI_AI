const test = require('node:test');
const assert = require('node:assert/strict');

const { sequelize } = require('../src/config/database');
const analytics = require('../src/controllers/analyticsController');

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

async function withQueryStub(t, stub, fn) {
  const original = sequelize.query;
  sequelize.query = stub;

  t.after(() => {
    sequelize.query = original;
  });

  await fn();
}

test('summary rejects invalid days without querying DB', async (t) => {
  const invalid = ['0', '-1', 'abc', '1.5', '366'];

  for (const days of invalid) {
    await withQueryStub(
      t,
      async () => {
        throw new Error('DB must not be queried');
      },
      async () => {
        const res = responseRecorder();

        await analytics.getSummary(
          { query: { days } },
          res
        );

        assert.equal(res.statusCode, 400);
        assert.equal(
          res.body.code,
          'INVALID_ANALYTICS_PARAMETER'
        );
      }
    );
  }
});

test('trend rejects invalid days', async (t) => {
  await withQueryStub(
    t,
    async () => {
      throw new Error('DB must not be queried');
    },
    async () => {
      const res = responseRecorder();

      await analytics.getTrend(
        { query: { days: '50000' } },
        res
      );

      assert.equal(res.statusCode, 400);
      assert.equal(
        res.body.code,
        'INVALID_ANALYTICS_PARAMETER'
      );
    }
  );
});

test('top medicines rejects invalid limit', async (t) => {
  const invalid = ['0', '-5', 'abc', '1.5', '101'];

  for (const limit of invalid) {
    await withQueryStub(
      t,
      async () => {
        throw new Error('DB must not be queried');
      },
      async () => {
        const res = responseRecorder();

        await analytics.getTopMedicines(
          { query: { limit } },
          res
        );

        assert.equal(res.statusCode, 400);
        assert.equal(
          res.body.code,
          'INVALID_ANALYTICS_PARAMETER'
        );
      }
    );
  }
});

test('missing parameters retain documented defaults', async (t) => {
  await withQueryStub(
    t,
    async () => [{
      current_sales: 0,
      current_orders: 0,
      current_customers: 0,
      current_paid: 0,
      current_due: 0,
      previous_sales: 0,
      previous_orders: 0
    }],
    async () => {
      const res = responseRecorder();

      await analytics.getSummary(
        { query: {} },
        res
      );

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.days, 30);
    }
  );
});

test('zero previous baseline does not invent +100 percent growth', async (t) => {
  await withQueryStub(
    t,
    async () => [{
      current_sales: 100,
      current_orders: 2,
      current_customers: 1,
      current_paid: 25,
      current_due: 75,
      previous_sales: 0,
      previous_orders: 0
    }],
    async () => {
      const res = responseRecorder();

      await analytics.getSummary(
        { query: { days: '30' } },
        res
      );

      assert.equal(res.statusCode, 200);
      assert.equal(
        res.body.data.recordedSales.delta,
        null
      );
      assert.equal(
        res.body.data.orders.delta,
        null
      );
      assert.equal(
        res.body.data.averageInvoiceValue.delta,
        null
      );
    }
  );
});

test('zero versus zero comparison remains zero percent', async (t) => {
  await withQueryStub(
    t,
    async () => [{
      current_sales: 0,
      current_orders: 0,
      current_customers: 0,
      current_paid: 0,
      current_due: 0,
      previous_sales: 0,
      previous_orders: 0
    }],
    async () => {
      const res = responseRecorder();

      await analytics.getSummary(
        { query: { days: '1' } },
        res
      );

      assert.equal(
        res.body.data.recordedSales.delta,
        0
      );
      assert.equal(
        res.body.data.orders.delta,
        0
      );
    }
  );
});

test('summary SQL excludes cancelled and refunded invoices', async (t) => {
  let capturedSql = '';

  await withQueryStub(
    t,
    async (sql) => {
      capturedSql = String(sql);

      return [{
        current_sales: 0,
        current_orders: 0,
        current_customers: 0,
        current_paid: 0,
        current_due: 0,
        previous_sales: 0,
        previous_orders: 0
      }];
    },
    async () => {
      const res = responseRecorder();

      await analytics.getSummary(
        { query: { days: '30' } },
        res
      );
    }
  );

  assert.match(capturedSql, /delivery_status/i);
  assert.match(capturedSql, /cancelled/i);
  assert.match(capturedSql, /refunded/i);
  assert.doesNotMatch(
    capturedSql,
    /NOT IN\s*\([^)]*returned/i
  );
});

test('trend SQL excludes cancelled and refunded but preserves returned', async (t) => {
  let capturedSql = '';

  await withQueryStub(
    t,
    async (sql) => {
      capturedSql = String(sql);

      return [
        {
          day: '2026-09-17',
          label: 'Sep 17',
          orders: 0,
          recorded_sales: 0,
          paid_amount: 0
        },
        {
          day: '2026-09-18',
          label: 'Sep 18',
          orders: 0,
          recorded_sales: 0,
          paid_amount: 0
        }
      ];
    },
    async () => {
      const res = responseRecorder();

      await analytics.getTrend(
        { query: { days: '1' } },
        res
      );

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.daily.length, 1);
    }
  );

  assert.match(capturedSql, /i\.delivery_status/i);
  assert.match(capturedSql, /cancelled/i);
  assert.match(capturedSql, /refunded/i);
  assert.doesNotMatch(
    capturedSql,
    /NOT IN\s*\([^)]*returned/i
  );
});

test('top medicines uses factual recordedSales with compatibility alias', async (t) => {
  let capturedSql = '';

  await withQueryStub(
    t,
    async (sql) => {
      capturedSql = String(sql);

      return [{
        product_id: 10,
        product_title: 'Medicine A',
        units: 2,
        recorded_sales: 250,
        total_units: 2
      }];
    },
    async () => {
      const res = responseRecorder();

      await analytics.getTopMedicines(
        {
          query: {
            days: '30',
            limit: '10'
          }
        },
        res
      );

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.length, 1);
      assert.equal(
        res.body.data[0].recordedSales,
        250
      );
      assert.equal(
        res.body.data[0].revenue,
        250
      );
      assert.equal(
        res.body.data[0].pctOfTotal,
        100
      );
    }
  );

  assert.match(capturedSql, /i\.delivery_status/i);
  assert.match(capturedSql, /cancelled/i);
  assert.match(capturedSql, /refunded/i);
  assert.match(
    capturedSql,
    /ORDER BY[\s\S]*units DESC[\s\S]*recorded_sales DESC[\s\S]*product_id ASC/i
  );
});