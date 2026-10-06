const test = require('node:test');
const assert = require('node:assert/strict');
const { sequelize } = require('../src/config/database');
const Product = require('../src/models/Product');
const StockHistory = require('../src/models/StockHistory');
const User = require('../src/models/User');
const stock = require('../src/controllers/stockController');
const orders = require('../src/controllers/orderController');
const allocation = require('../src/services/batchAllocationService');
const market = require('../src/services/marketProductService');
const ddi = require('../src/services/ddiService');
const flags = require('../src/services/ddiPharmacistFlagService');
const { updateBatch } = require('../src/services/salePricingService');
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });

test('FIFO receipt snapshots, mixed-price checkout, depletion and restock are atomic',
  { skip: process.env.MEDSENSE_TEST_DATABASE !== '1' }, async t => {
    sequelize.options.logging = false;
    const transaction = await sequelize.transaction();
    const rollback = transaction.rollback.bind(transaction);
    try {
      const [directory] = await sequelize.query(`SELECT b.brand_id,s.supplier_id FROM brand b
        CROSS JOIN supplier_info s WHERE b.status=1 AND s.status=1 ORDER BY b.brand_id,s.supplier_id LIMIT 1`, {transaction});
      assert.ok(directory[0], 'An active brand and supplier are required for this receipt test');
      const product = await Product.create({ product_title: 'FIFO verification Panadol',
        product_brand:directory[0].brand_id,product_supplier:directory[0].supplier_id,
        product_category:'Analgesic / Antipyretic',
        product_price: 5, product_purchase_price: 3, product_status: 0,
        product_generic_name: 'FIFO verification', product_salt: 'Paracetamol' }, { transaction });
      t.mock.method(sequelize, 'transaction', async () => transaction);
      t.mock.method(transaction, 'commit', async () => {});
      t.mock.method(transaction, 'rollback', async () => {});
      t.mock.method(User, 'findAll', async () => []);
      t.mock.method(flags, 'emitCompletedOrderFlag', async () => {});
      t.mock.method(ddi, 'checkCart', async () => ({ httpStatus: 200,
        result: { status: 'CLEAR_WITH_LIMITATIONS', checkout_allowed: true, interactions: [] } }));

      const receive = async (name, quantity, purchase, sale, date) => {
        const res = response();
        await stock.createStockBatch({ body: { supplierId: directory[0].supplier_id, creationDate: date,
          createdBy: 'FIFO verification (rolled back)', items: [{ productId: product.product_id,
            name, qty: quantity, purchasePrice: purchase, salePrice: sale, productExpiry: '2030-12-31' }] } }, res);
        assert.equal(res.statusCode, 201, JSON.stringify(res.body));
        return res.body.data.items[0].id;
      };
      const first = await receive('FIFO verification Panadol', 2, 3, 5, '2026-01-01');
      const second = await receive('FIFO verification Panadol 500mg', 10, 6, 8, '2026-02-01');
      const active = await market.findCurrentMarketProduct(product.product_id, transaction);
      assert.equal(active.batch_id, first);
      assert.equal(active.available, 12);
      assert.equal(Number(active.product_price), 5);
      assert.equal(active.product_title, 'FIFO verification Panadol');
      await assert.rejects(allocation.allocateBatchesForSale(product.product_id, 13, transaction), /Insufficient stock/);
      await assert.rejects(allocation.allocateBatchesForSale(product.product_id, 1, transaction, second), /FIFO batch changed/);
      await assert.rejects(updateBatch(first, product.product_id, { salePrice: 8 }), /prices are preserved/);
      const stale = response();
      await orders.createOrder({ body: { customer_name: 'FIFO verification', payment_method: 'cash',
        items: [{ product_id: product.product_id, batch_id: first, quantity: 3,
          fifo_quote: [{ batch_id: first, quantity: 3, unit_price: 5 }] }] } }, stale);
      assert.equal(stale.statusCode, 409);
      assert.equal(stale.body.code, 'FIFO_QUOTE_CHANGED');
      assert.equal((await StockHistory.findByPk(first, { transaction })).remaining_quantity, 2);
      assert.equal((await StockHistory.findByPk(second, { transaction })).remaining_quantity, 10);

      const sell = async (quantity, batchId, quote) => {
        const res = response();
        await orders.createOrder({ body: { customer_name: 'FIFO verification', payment_method: 'cash',
          items: [{ product_id: product.product_id, batch_id: batchId, quantity, unit_price: 9999, fifo_quote: quote }] } }, res);
        assert.equal(res.statusCode, 201, JSON.stringify(res.body));
        return res.body.data;
      };
      const order = await sell(3, first, [
        { batch_id: first, quantity: 2, unit_price: 5 },
        { batch_id: second, quantity: 1, unit_price: 8 }
      ]);
      assert.equal(order.total, 18);
      const rows = await sequelize.query('SELECT * FROM invoice_report WHERE invoice_id=:id ORDER BY item_id',
        { replacements: { id: order.orderId }, type: sequelize.QueryTypes.SELECT, transaction });
      assert.deepEqual(rows.map(row => [row.batch_id, row.quantity, Number(row.unit_price), Number(row.purchase_price)]),
        [[first, 2, 5, 3], [second, 1, 8, 6]]);
      assert.equal(rows[1].product_title, 'FIFO verification Panadol 500mg');
      const old = await StockHistory.findByPk(first, { transaction });
      assert.equal(old.remaining_quantity, 0);
      assert.equal(old.batch_status, 'FINISHED');
      assert.equal(Number(old.sale_price), 5);
      assert.equal(old.product_title, 'FIFO verification Panadol');
      assert.equal(old.creation_day, '2026-01-01');
      assert.equal((await market.findCurrentMarketProduct(product.product_id, transaction)).batch_id, second);
      await sell(9, second, [{ batch_id: second, quantity: 9, unit_price: 8 }]);
      assert.equal(await market.findCurrentMarketProduct(product.product_id, transaction), null);
      await product.reload({ transaction });
      assert.equal(product.product_status, 0);
      const third = await receive('FIFO verification Panadol refreshed', 5, 4, 7, '2026-03-01');
      await product.reload({ transaction });
      assert.equal(product.product_status, 1);
      assert.equal(product.product_title, 'FIFO verification Panadol');
      assert.equal(Number(product.product_price), 5);
      assert.equal((await market.findCurrentMarketProduct(product.product_id, transaction)).batch_id, third);
    } finally {
      await rollback();
      t.mock.restoreAll();
      await sequelize.close();
    }
  });
