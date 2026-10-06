const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sequelize } = require('../src/config/database');
const Product = require('../src/models/Product');
const Supplier = require('../src/models/Supplier');
const stock = require('../src/controllers/stockController');

test('supplier receipt saves stock, fixed cost, inventory ledger and payable together',
  { skip: process.env.MEDSENSE_TEST_DATABASE !== '1' }, async t => {
    sequelize.options.logging = false;
    const transaction = await sequelize.transaction();
    let commitRequested = false;
    try {
      const supplier = await Supplier.create({ supplier_name: 'Receipt test (rolled back)', status: 1 }, { transaction });
      const [brands] = await sequelize.query('SELECT brand_id FROM brand WHERE status=1 ORDER BY brand_id LIMIT 1', { transaction });
      assert.ok(brands[0]);
      const product = await Product.create({ product_title: 'Receipt test medicine', product_supplier: supplier.supplier_id,
        product_brand: brands[0].brand_id, product_category: 'Analgesic / Antipyretic',
        product_price: 8, product_status: 1 }, { transaction });
      t.mock.method(sequelize, 'transaction', async () => transaction);
      t.mock.method(transaction, 'commit', async () => { commitRequested = true; });
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
      await stock.createStockBatch({ body: {
        supplierId: supplier.supplier_id, supplierName: supplier.supplier_name, createdBy: 'Database verification',
        items: [{ productId: product.product_id, qty: 10, purchasePrice: 5, salePrice: 8, productExpiry: '2030-12-31' }]
      } }, res);
      assert.equal(res.statusCode, 201, res.body?.error || res.body?.message);
      assert.equal(commitRequested, true);
      assert.equal(res.body.data.items[0].purchasePrice, 5);
      assert.equal(res.body.data.items[0].salePrice, 8);
      const [accounts] = await sequelize.query('SELECT current_balance,total_debit FROM supplier_accounts WHERE supplier_id=:id',
        { replacements: { id: supplier.supplier_id }, transaction });
      assert.equal(Number(accounts[0].current_balance), 50);
      assert.equal(Number(accounts[0].total_debit), 50);
      const [ledger] = await sequelize.query('SELECT debit_amount FROM supplier_ledger WHERE stock_id=:id',
        { replacements: { id: res.body.data.stock_id }, transaction });
      assert.equal(Number(ledger[0].debit_amount), 50);
      const [inventory] = await sequelize.query('SELECT quantity_change FROM stock_report WHERE batch_id=:id',
        { replacements: { id: res.body.data.items[0].id }, transaction });
      assert.equal(inventory[0].quantity_change, 10);

      // The existing-account branch must also save another batch at the same cost.
      const second = { ...res, body: undefined };
      await stock.createStockBatch({ body: {
        supplierId: supplier.supplier_id, supplierName: supplier.supplier_name,
        items: [{ productId: product.product_id, qty: 10, purchasePrice: 5, salePrice: 8, productExpiry: '2030-12-31' }]
      } }, second);
      assert.equal(second.statusCode, 201, second.body?.error);
      const [updated] = await sequelize.query('SELECT current_balance,total_debit FROM supplier_accounts WHERE supplier_id=:id',
        { replacements: { id: supplier.supplier_id }, transaction });
      assert.equal(Number(updated[0].current_balance), 100);
      assert.equal(Number(updated[0].total_debit), 100);

      // Repeat startup migration without resetting the accumulated payable or duplicating entries.
      const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261002_supplier_accounts.sql'), 'utf8')
        .replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, '');
      await sequelize.query(migration, { transaction });
      const [preserved] = await sequelize.query('SELECT current_balance FROM supplier_accounts WHERE supplier_id=:id',
        { replacements: { id: supplier.supplier_id }, transaction });
      assert.equal(Number(preserved[0].current_balance), 100);
      const [entries] = await sequelize.query('SELECT COUNT(*) AS count FROM supplier_ledger WHERE supplier_id=:id',
        { replacements: { id: supplier.supplier_id }, transaction });
      assert.equal(Number(entries[0].count), 2);
    } finally {
      if (!transaction.finished) await transaction.rollback();
      t.mock.restoreAll();
      await sequelize.close();
    }
  });
