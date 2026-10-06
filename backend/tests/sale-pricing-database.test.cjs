const test = require('node:test');
const assert = require('node:assert/strict');
const Product = require('../src/models/Product');
const StockHistory = require('../src/models/StockHistory');
const { sequelize } = require('../src/config/database');
const { findCurrentMarketProduct, synchronizeProductStatus } = require('../src/services/marketProductService');
const Allocation = require('../src/services/batchAllocationService');

test('FIFO spans existing price versions, excludes expired stock and isolates different medicines',
  { skip: process.env.MEDSENSE_TEST_DATABASE !== '1' }, async () => {
    sequelize.options.logging = false;
    const transaction = await sequelize.transaction();
    try {
      const title = `FIFO versions ${Date.now()}`;
      const [directory] = await sequelize.query(`SELECT b.brand_id,s.supplier_id FROM brand b CROSS JOIN supplier_info s
        WHERE b.status=1 AND s.status=1 ORDER BY b.brand_id,s.supplier_id LIMIT 1`, { transaction });
      assert.ok(directory[0]);
      const assignment = { product_brand: directory[0].brand_id, product_supplier: directory[0].supplier_id,
        product_category: 'Analgesic / Antipyretic' };
      const product = await Product.create({ product_title: title, product_generic_name: 'Paracetamol',
        ...assignment, product_salt: 'Paracetamol', product_pack_size: 10, product_price: 5, product_status: 1 }, { transaction });
      await product.update({ fifo_family_id: product.product_id }, { transaction });
      const version = await Product.create({ fifo_family_id: product.product_id, product_title: title + '(new)', product_generic_name: 'Paracetamol',
        ...assignment, product_salt: 'Paracetamol', product_pack_size: 10, product_price: 8, product_status: 1 }, { transaction });
      const different = await Product.create({ product_title: title + ' Extra', product_generic_name: 'Paracetamol',
        ...assignment, product_salt: 'Paracetamol', product_pack_size: 10, product_price: 2, product_status: 1 }, { transaction });
      const receive = (owner, quantity, sale, date, expiry = '2030-12-31') => StockHistory.create({
        product_id: owner.product_id, product_title: owner.product_title, batch_number: `FIFO-${owner.product_id}-${date}`,
        product_quantity: quantity, initial_quantity: quantity, remaining_quantity: quantity,
        product_price: 1, sale_price: sale, creation_day: date, expiry_date: expiry,
        batch_status: 'ACTIVE', status: 1 }, { transaction });
      await receive(product, 100, 1, '2025-01-01', '2025-12-31');
      const old = await receive(product, 2, 5, '2026-01-01');
      const later = await receive(version, 10, 8, '2026-02-01');
      await receive(different, 100, 2, '2026-01-01');
      const selected = await findCurrentMarketProduct(version.product_id, transaction);
      assert.equal(selected.batch_id, old.batch_id);
      assert.equal(selected.available, 12);
      const rows = await Allocation.allocateBatchesForSale(product.product_id, 3, transaction);
      assert.deepEqual(rows.map(row => [row.batch_id, row.product_id, row.quantity, row.sale_price]),
        [[old.batch_id, product.product_id, 2, 5], [later.batch_id, version.product_id, 1, 8]]);
      await Allocation.deductBatches(rows, { type: 'MANUAL', number: 'FIFO verification' }, transaction);
      await synchronizeProductStatus([product.product_id, version.product_id], transaction);
      assert.equal((await product.reload({ transaction })).product_status, 0);
      assert.equal((await version.reload({ transaction })).product_status, 1);
      assert.equal((await findCurrentMarketProduct(product.product_id, transaction)).batch_id, later.batch_id);
      assert.equal((await findCurrentMarketProduct(different.product_id, transaction)).available, 100);
      await version.update({ manually_inactive: true }, { transaction });
      await synchronizeProductStatus([version.product_id], transaction);
      assert.equal((await version.reload({ transaction })).product_status, 0);
      assert.equal(await findCurrentMarketProduct(product.product_id, transaction), null);
      await version.update({ manually_inactive: false }, { transaction });
      await synchronizeProductStatus([version.product_id], transaction);
      assert.equal((await version.reload({ transaction })).product_status, 1);
      assert.equal((await findCurrentMarketProduct(product.product_id, transaction)).batch_id, later.batch_id);
      await version.update({ archived: true }, { transaction });
      assert.equal(await findCurrentMarketProduct(product.product_id, transaction), null);
      assert.equal((await later.reload({ transaction })).remaining_quantity, 9);
      assert.equal(version.product_title, title + '(new)');
    } finally {
      await transaction.rollback();
      await sequelize.close();
    }
  });
