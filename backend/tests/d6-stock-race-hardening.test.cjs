const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const StockHistory =
  require('../src/models/StockHistory');

const StockReport =
  require('../src/models/StockReport');
const { sequelize } = require('../src/config/database');

const BatchAllocationService =
  require('../src/services/batchAllocationService');


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
  'sale allocation requires caller transaction',
  async () => {
    await assert.rejects(
      () =>
        BatchAllocationService
          .allocateBatchesForSale(
            1,
            1,
            null
          ),
      (error) =>
        error.code ===
        'STOCK_ALLOCATION_TRANSACTION_REQUIRED'
    );
  }
);


test(
  'POS allocation reads available batches with transaction row lock',
  { concurrency: false },
  async (t) => {
    const originalFindAll = sequelize.query;

    t.after(() => {
      sequelize.query =
        originalFindAll;
    });

    const transaction =
      {
        marker:
          'transaction'
      };

    let optionsSeen =
      null;

    sequelize.query =
      async (sql, options) => {
        assert.match(sql, /FOR UPDATE OF h/);
        assert.match(sql, /ASC NULLS LAST/);
        optionsSeen =
          options;

        return [
          {
            batch_id: 11,
            batch_number:
              'B-11',
            available:
              5,
            product_purchase_price:
              10,
            product_price:
              20,
            expiry_date:
              new Date(
                '2030-01-01'
              )
          }
        ];
      };

    const allocations =
      await BatchAllocationService
        .allocateBatchesForSale(
          4,
          3,
          transaction
        );

    assert.equal(
      optionsSeen.transaction,
      transaction
    );

    assert.equal(
      optionsSeen.replacements.productId,
      4
    );

    assert.equal(
      allocations.length,
      1
    );

    assert.equal(
      allocations[0].quantity,
      3
    );
  }
);


test(
  'locked allocation rejects insufficient current stock',
  { concurrency: false },
  async (t) => {
    const originalFindAll = sequelize.query;

    t.after(() => {
      sequelize.query =
        originalFindAll;
    });

    sequelize.query =
      async () => [
        {
          batch_id: 1,
          batch_number: 'B-1',
          available: 2,
          product_purchase_price: 5,
          product_price: 10,
          expiry_date:
            new Date('2030-01-01')
        }
      ];

    await assert.rejects(
      () =>
        BatchAllocationService
          .allocateBatchesForSale(
            1,
            3,
            {}
          ),
      /Insufficient stock/
    );
  }
);


test(
  'deduction defensively re-locks current batch before quantity calculation',
  { concurrency: false },
  async (t) => {
    t.mock.method(sequelize, 'query', async (sql, options) => {
      assert.match(sql, /UPDATE product/);
      assert.equal(options.transaction.marker, 'tx');
      return [];
    });
    const originalFindByPk =
      StockHistory.findByPk;

    const originalCreateEntry =
      StockReport.createEntry;

    t.after(() => {
      StockHistory.findByPk =
        originalFindByPk;

      StockReport.createEntry =
        originalCreateEntry;
    });

    const transaction =
      {
        marker:
          'tx'
      };

    let optionsSeen =
      null;

    let updatedQuantity =
      null;

    StockHistory.findByPk =
      async (
        id,
        options
      ) => {
        optionsSeen =
          options;

        return {
          batch_id:
            id,

          batch_number:
            'B-1',

          product_id:
            1,

          remaining_quantity:
            5,

          batch_status:
            'ACTIVE',

          async update(
            values,
            updateOptions
          ) {
            assert.equal(
              updateOptions
                .transaction,
              transaction
            );

            updatedQuantity =
              values
                .remaining_quantity;
          }
        };
      };

    StockReport.createEntry =
      async () => {};

    await BatchAllocationService
      .deductBatches(
        [
          {
            batch_id: 1,
            quantity: 3,
            sale_price: 20
          }
        ],
        {
          type: 'INVOICE',
          id: 9,
          number:
            'INV-000009'
        },
        transaction
      );

    assert.equal(
      optionsSeen.transaction,
      transaction
    );

    assert.equal(
      optionsSeen.lock,
      true
    );

    assert.equal(
      updatedQuantity,
      2
    );
  }
);


test(
  'deduction rejects stale allocation when locked quantity is now insufficient',
  { concurrency: false },
  async (t) => {
    const originalFindByPk =
      StockHistory.findByPk;

    const originalCreateEntry =
      StockReport.createEntry;

    t.after(() => {
      StockHistory.findByPk =
        originalFindByPk;

      StockReport.createEntry =
        originalCreateEntry;
    });

    let updateCalled =
      false;

    StockHistory.findByPk =
      async () => ({
        batch_id: 1,
        batch_number:
          'B-1',
        product_id: 1,
        remaining_quantity:
          1,
        batch_status:
          'ACTIVE',
        async update() {
          updateCalled =
            true;
        }
      });

    StockReport.createEntry =
      async () => {};

    await assert.rejects(
      () =>
        BatchAllocationService
          .deductBatches(
            [
              {
                batch_id: 1,
                quantity: 2,
                sale_price: 10
              }
            ],
            {
              type:
                'INVOICE',
              id: 1,
              number:
                'INV-000001'
            },
            {}
          ),
      /Insufficient quantity/
    );

    assert.equal(
      updateCalled,
      false
    );
  }
);


test(
  'POS invoice passes its transaction into stock allocation',
  () => {
    const source =
      read(
        'src/controllers/invoiceController.js'
      );

    assert.equal(
      source.includes(
        '.allocateBatchesForSale('
      ),
      true
    );

    const allocation =
      source.indexOf(
        '.allocateBatchesForSale('
      );

    const window =
      source.slice(
        allocation,
        allocation + 300
      );

    assert.equal(
      window.includes(
        'transaction'
      ),
      true
    );
  }
);


test(
  'POS and storefront acquire invoice-number lock before stock row locks',
  () => {
    const pos =
      read(
        'src/controllers/invoiceController.js'
      );

    const storefront =
      read(
        'src/controllers/orderController.js'
      );

    const posNumber =
      pos.indexOf(
        'generateInvoiceNumber('
      );

    const posAllocation =
      pos.indexOf(
        '.allocateBatchesForSale('
      );

    assert.ok(
      posNumber >= 0
    );

    assert.ok(
      posAllocation >
        posNumber
    );

    const storefrontNumber =
      storefront.indexOf(
        '.generateNextInvoiceNumber('
      );

    const storefrontLock =
      storefront.indexOf(
        'FOR UPDATE',
        storefrontNumber
      );

    assert.ok(
      storefrontNumber >= 0
    );

    assert.ok(
      storefrontLock >
        storefrontNumber
    );
  }
);


test(
  'POS early validation rolls back its opened transaction',
  () => {
    const source =
      read(
        'src/controllers/invoiceController.js'
      );

    const validation =
      source.indexOf(
        'if (!customerName || !items || items.length === 0)'
      );

    const allocation =
      source.indexOf(
        '.allocateBatchesForSale('
      );

    const scope =
      source.slice(
        validation,
        allocation
      );

    assert.equal(
      scope.includes(
        'await transaction.rollback();'
      ),
      true
    );
  }
);
