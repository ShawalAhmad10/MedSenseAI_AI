const test = require('node:test');
const assert = require('node:assert/strict');
const Product = require('../src/models/Product');
const StockHistory = require('../src/models/StockHistory');
const { sequelize } = require('../src/config/database');
const { validateStockPrices, money } = require('../src/services/productPricingService');
const { setSalePrice } = require('../src/services/salePricingService');
const products = require('../src/controllers/productController');
const stock = require('../src/controllers/stockController');
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
const fakeProduct = () => ({ product_id: 1, product_title: 'Panadol', product_price: 120, product_purchase_price: 100 });

test('batch receipt pricing', async t => {
  await t.test('receipts accept independent cost and sale price without rewriting product defaults', async t => {
    const product = fakeProduct();
    t.mock.method(Product, 'findByPk', async (_, options) => {
      assert.equal(options.lock, 'UPDATE'); return product;
    });
    for (const [purchasePrice, salePrice] of [[100, 120], [110, 130], [90, 125]]) {
      const items = [{ productId: 'prod-1', name: 'Panadol 500mg', qty: 20, purchasePrice, salePrice }];
      await validateStockPrices(items, transaction);
      assert.equal(items[0].name, 'Panadol 500mg');
      assert.equal(product.product_title, 'Panadol');
      assert.equal(items[0].productId, '1');
      assert.equal(items[0].purchasePrice, purchasePrice);
      assert.equal(items[0].salePrice, salePrice);
      assert.equal(product.product_price, 120);
      assert.equal(product.product_purchase_price, 100);
    }
  });
  await t.test('invalid costs, sale prices and quantities are rejected', async t => {
    t.mock.method(Product, 'findByPk', async id => id === 'missing' ? null : fakeProduct());
    for (const value of [0, -1, 'bad', Infinity, 0.001]) {
      assert.throws(() => money(value), /positive/);
      for (const field of ['purchasePrice', 'salePrice']) {
        await assert.rejects(validateStockPrices([{ productId: 1, qty: 20, purchasePrice: 100, salePrice: 120, [field]: value }], transaction), /positive/);
      }
    }
    for (const qty of [-1, 0.5, Infinity, 'bad']) {
      await assert.rejects(validateStockPrices([{ productId: 1, qty, purchasePrice: 100, salePrice: 120 }], transaction), /whole numbers/);
    }
    await assert.rejects(validateStockPrices([{ productId: 'missing', qty: 20, purchasePrice: 100, salePrice: 120 }], transaction), /existing product/);
  });
  await t.test('products lock in stable order to avoid receipt deadlocks', async t => {
    const locked = [];
    t.mock.method(Product, 'findByPk', async id => { locked.push(id); return fakeProduct(); });
    await validateStockPrices([2, 1].map(productId => ({ productId, qty: 20, purchasePrice: 100, salePrice: 120 })), transaction);
    assert.deepEqual(locked, ['1', '2']);
  });
  await t.test('receipts accept only the medicine assigned supplier', async t => {
    t.mock.method(Product, 'findByPk', async () => ({ ...fakeProduct(), product_supplier: 7 }));
    const item = () => ({ productId: 1, qty: 20, purchasePrice: 100, salePrice: 120 });
    await assert.rejects(validateStockPrices([item()], transaction, 8),
      error => error.status === 400 && /assigned supplier/.test(error.message));
    await validateStockPrices([item()], transaction, 7);
  });
  await t.test('product edits and global price changes cannot reprice batches', async t => {
    t.mock.method(Product, 'findByPk', async () => fakeProduct());
    for (const body of [{ price: 130 }, { purchasePrice: 110 }]) {
      const res = response();
      await products.updateProduct({ params: { id: 'prod-1' }, body }, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /batch prices/);
    }
    await assert.rejects(setSalePrice(1, 130), error => error.status === 400 && /individual batches/.test(error.message));
  });
  await t.test('profit report uses invoice cost without joining mutable batches', async t => {
    t.mock.method(sequelize, 'query', async sql => {
      assert.match(sql, /COALESCE\(ii.purchase_price, 0\)/);
      assert.doesNotMatch(sql, /JOIN stock_history/);
      return [{ product_id: 1, product_title: 'Panadol', quantity: 2, revenue: 240, cost: 200, profit: 40 }];
    });
    const res = response();
    await stock.getProfitLossReport({ query: {} }, res);
    assert.equal(res.body.data.summary.totalProfit, 40);
  });
  await t.test('historical medicine names are preserved and deletion archives the entry', async t => {
    const product = fakeProduct();
    t.mock.method(Product, 'findByPk', async () => product);
    t.mock.method(StockHistory, 'count', async () => 1);
    const renamed = response();
    await products.updateProduct({ params: { id: 'prod-1' }, body: { title: 'Panadol 500mg' } }, renamed);
    assert.equal(renamed.statusCode, 400);
    assert.equal(product.product_title, 'Panadol');
    t.mock.method(sequelize, 'transaction', async callback => callback(transaction));
    t.mock.method(sequelize, 'query', async () => []);
    product.update = async values => Object.assign(product, values);
    const deleted = response();
    await products.deleteProduct({ params: { id: 'prod-1' } }, deleted);
    assert.equal(deleted.statusCode, 200);
    assert.equal(product.archived, true);
    assert.equal(product.product_title, 'Panadol');
  });
});
