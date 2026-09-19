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

function responseRecorder() {
  return {
    statusCode:
      200,

    payload:
      null,

    status(code) {
      this.statusCode =
        code;

      return this;
    },

    json(payload) {
      this.payload =
        payload;

      return this;
    },
  };
}

test(
  'sales routes require staff authentication',
  () => {
    const source =
      read(
        'src/routes/salesRoutes.js'
      );

    assert.match(
      source,
      /authenticateToken/
    );

    assert.match(
      source,
      /router\.use\([\s\S]*authenticateToken/
    );
  }
);

test(
  'sales lifecycle excludes cancelled and refunded while preserving returned',
  () => {
    const controller =
      require(
        '../src/controllers/salesController'
      );

    const condition =
      controller
        .activeInvoiceCondition(
          'i'
        );

    assert.match(
      condition,
      /status = 1/
    );

    assert.match(
      condition,
      /cancelled/
    );

    assert.match(
      condition,
      /refunded/
    );

    assert.doesNotMatch(
      condition,
      /returned/
    );
  }
);

test(
  'sales period parser rejects malformed values',
  () => {
    const controller =
      require(
        '../src/controllers/salesController'
      );

    for (
      const value
      of [
        '0',
        '-1',
        '7abc',
        '1.5',
        '366',
      ]
    ) {
      assert.throws(
        () =>
          controller
            .parseDays(
              value
            ),
        /days must be an integer/
      );
    }

    assert.equal(
      controller
        .parseDays(
          undefined
        ),
      30
    );
  }
);

test(
  'sales list limit is bounded',
  () => {
    const controller =
      require(
        '../src/controllers/salesController'
      );

    assert.equal(
      controller
        .parseLimit(
          undefined,
          8
        ),
      8
    );

    assert.throws(
      () =>
        controller
          .parseLimit(
            '101',
            8
          ),
      /limit must be an integer/
    );
  }
);

test(
  'invalid overview days fail before any database query',
  async () => {
    const controller =
      require(
        '../src/controllers/salesController'
      );

    const {
      sequelize,
    } =
      require(
        '../src/config/database'
      );

    const originalQuery =
      sequelize.query;

    let queryCalled =
      false;

    sequelize.query =
      async () => {
        queryCalled =
          true;

        return [];
      };

    try {
      const res =
        responseRecorder();

      await controller
        .getSalesOverview(
          {
            query: {
              days:
                'bad',
            },
          },
          res
        );

      assert.equal(
        res.statusCode,
        400
      );

      assert.equal(
        res.payload.code,
        'INVALID_SALES_PARAMETER'
      );

      assert.equal(
        queryCalled,
        false
      );
    } finally {
      sequelize.query =
        originalQuery;
    }
  }
);

test(
  'overview uses invoice_date and factual Recorded Sales terminology',
  () => {
    const source =
      read(
        'src/controllers/salesController.js'
      );

    assert.match(
      source,
      /invoice_date::date/
    );

    assert.match(
      source,
      /recordedSales/
    );

    assert.match(
      source,
      /It is not cash collected/
    );

    assert.doesNotMatch(
      source,
      /total_revenue/
    );
  }
);

test(
  'top products use active invoice lines and real product category',
  () => {
    const source =
      read(
        'src/controllers/salesController.js'
      );

    assert.match(
      source,
      /FROM invoice_report ir/
    );

    assert.match(
      source,
      /ir\.status = 1/
    );

    assert.match(
      source,
      /p\.product_category/
    );

    assert.match(
      source,
      /"totalQty" DESC/
    );

    assert.match(
      source,
      /"recordedSales" DESC/
    );

    assert.doesNotMatch(
      source,
      /'General' as category/i
    );
  }
);

test(
  'slow movers use live stock and never invent selected period as last-sale age',
  () => {
    const source =
      read(
        'src/controllers/salesController.js'
      );

    assert.match(
      source,
      /SUM\([\s\S]*remaining_quantity/
    );

    assert.match(
      source,
      /neverSold/
    );

    assert.match(
      source,
      /daysNoSales:[\s\S]*hasLastSale[\s\S]*null/
    );
  }
);

test(
  'recommendations use configured minimum threshold instead of arbitrary stock constants',
  () => {
    const source =
      read(
        'src/controllers/salesController.js'
      );

    assert.match(
      source,
      /product_min_threshold/
    );

    assert.match(
      source,
      /REPLENISHMENT_REVIEW/
    );

    assert.match(
      source,
      /SLOW_MOVING_STOCK_REVIEW/
    );

    assert.doesNotMatch(
      source,
      /stock_qty[\s\S]*< 10/
    );

    assert.doesNotMatch(
      source,
      /stock_qty[\s\S]*> 50/
    );
  }
);

test(
  'sales optimization backend is read-only',
  () => {
    const source =
      read(
        'src/controllers/salesController.js'
      );

    assert.doesNotMatch(
      source,
      /\bUPDATE\s+|\bINSERT\s+INTO\b|\bDELETE\s+FROM\b|\bDROP\s+TABLE\b|\bTRUNCATE\b|\bALTER\s+TABLE\b/i
    );
  }
);

test(
  'sales recommendations do not claim forecast or automatic commercial action',
  () => {
    const source =
      read(
        'src/controllers/salesController.js'
      );

    assert.match(
      source,
      /deterministic operational review flags/
    );

    assert.match(
      source,
      /No forecast model or synthetic sales dataset is used/
    );

    assert.doesNotMatch(
      source,
      /projected.*uplift|forecast to|discount applied|reorder initiated/i
    );
  }
);

test(
  'zero previous baseline does not invent growth',
  () => {
    const controller =
      require(
        '../src/controllers/salesController'
      );

    assert.equal(
      controller
        .pctChange(
          100,
          0
        ),
      0
    );

    assert.equal(
      controller
        .pctChange(
          0,
          0
        ),
      0
    );
  }
);
