const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { sequelize } =
  require('../src/config/database');

const leadService =
  require('../src/services/leadScoringService');

const leadController =
  require('../src/controllers/leadController');

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

test('Lead routes remain staff authenticated', () => {
  const source =
    fs.readFileSync(
      path.join(
        __dirname,
        '../src/routes/leadRoutes.js'
      ),
      'utf8'
    );

  assert.match(
    source,
    /require\('\.\.\/middleware\/auth'\)/
  );

  assert.match(
    source,
    /router\.use\(authenticate\)/
  );
});

test('authoritative customer snapshot excludes cancelled and refunded invoices', async (t) => {
  const originalQuery =
    sequelize.query;

  const seenSql = [];

  sequelize.query =
    async (sql) => {
      seenSql.push(String(sql));

      if (
        String(sql).includes('FROM customer')
      ) {
        return [
          {
            customer_id: 2,
            customer_name: 'Customer',
            email: 'customer@example.test',
            created_at:
              '2026-09-01T00:00:00.000Z'
          }
        ];
      }

      return [
        {
          order_id: 10,
          customer_id: 2,
          created_at:
            '2026-09-10T00:00:00.000Z'
        }
      ];
    };

  t.after(() => {
    sequelize.query =
      originalQuery;
  });

  const snapshot =
    await leadService.loadCustomerSnapshot(2);

  assert.equal(
    snapshot.orders.length,
    1
  );

  const invoiceSql =
    seenSql.find((sql) =>
      sql.includes('FROM invoice')
    );

  assert.ok(invoiceSql);

  assert.match(
    invoiceSql,
    /NOT IN\s*\(\s*'cancelled'\s*,\s*'refunded'\s*\)/i
  );
});

test('valid Lead list limits are passed unchanged', async (t) => {
  const originalQuery =
    sequelize.query;

  let replacements = null;

  sequelize.query =
    async (sql, options) => {
      replacements =
        options.replacements;

      return [
        { customer_id: 2 }
      ];
    };

  t.after(() => {
    sequelize.query =
      originalQuery;
  });

  const result =
    await leadService.listActiveCustomerIds(25);

  assert.deepEqual(
    result,
    [2]
  );

  assert.equal(
    replacements.limit,
    25
  );
});

test('invalid Lead list limit fails before DB query', async (t) => {
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

  await assert.rejects(
    () =>
      leadService.listActiveCustomerIds(101),
    (error) =>
      error.code ===
      'LEAD_INVALID_LIMIT'
  );

  assert.equal(
    queried,
    false
  );
});

test('Lead controller returns HTTP 400 for invalid list limit', async (t) => {
  const original =
    leadService.scoreCustomers;

  leadService.scoreCustomers =
    async () => {
      const error =
        new Error(
          'Lead list limit must be an integer from 1 to 100'
        );

      error.code =
        'LEAD_INVALID_LIMIT';

      throw error;
    };

  t.after(() => {
    leadService.scoreCustomers =
      original;
  });

  const res =
    responseRecorder();

  await leadController.listLeads(
    {
      query: {
        limit: '999'
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
    'LEAD_INVALID_LIMIT'
  );
});