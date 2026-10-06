const { money } = require('./productPricingService');
const StockHistory = require('../models/StockHistory');
const StockReport = require('../models/StockReport');
const { sequelize } = require('../config/database');

async function updateBatch(batchId, productId, changes, actor = 'System') {
  if (changes.salePrice !== undefined) {
    const error = new Error('Arrival prices are preserved. Receive the changed price as a new stock batch.');
    error.status = 400; throw error;
  }
  const normalizedProductId = Number(String(productId || '').replace(/^prod-/, ''));
  if (!Number.isSafeInteger(Number(batchId)) || Number(batchId) <= 0 || Number(batchId) > 2147483647 ||
      !Number.isSafeInteger(normalizedProductId) || normalizedProductId <= 0 || normalizedProductId > 2147483647) {
    const error = new Error('Valid batch and product IDs are required.'); error.status = 400; throw error;
  }
  return sequelize.transaction(async transaction => {
    await sequelize.query('SELECT pg_advisory_xact_lock(44201, 17001)', { transaction });
    const batch = await StockHistory.findByPk(batchId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!batch) { const error = new Error('Batch not found.'); error.status = 404; throw error; }
    if (String(batch.product_id) !== String(productId).replace(/^prod-/, '')) {
      const error = new Error('Batch does not belong to the selected product.'); error.status = 400; throw error;
    }
    const values = { updated_at: new Date() };
    if (changes.salePrice !== undefined) values.sale_price = money(changes.salePrice);
    if (changes.stock !== undefined) {
      const quantity = Number(changes.stock);
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > Number(batch.remaining_quantity)) {
        const error = new Error('Stock corrections can only reduce remaining stock. Receive additional stock as a new arrival batch.');
        error.status = 400; throw error;
      }
      if (!['ACTIVE', 'FINISHED'].includes(batch.batch_status)) {
        const error = new Error('Expired, quarantined or disposed batches cannot be reactivated.'); error.status = 400; throw error;
      }
      values.remaining_quantity = quantity;
      values.batch_status = quantity === 0 ? 'FINISHED' : 'ACTIVE';
    }
    await StockReport.createEntry({ batch_id: batch.batch_id, product_id: batch.product_id,
      transaction_type: 'ADJUSTMENT', quantity_change: changes.stock === undefined ? 0 : Number(changes.stock) - Number(batch.remaining_quantity),
      balance_after: changes.stock === undefined ? Number(batch.remaining_quantity) : Number(changes.stock),
      reference_type: 'MANUAL', unit_price: values.sale_price ?? batch.sale_price,
      notes: changes.salePrice !== undefined ? `Batch sale price changed from ${batch.sale_price} to ${values.sale_price}` : 'Batch stock adjusted',
      performed_by: actor }, transaction);
    await batch.update(values, { transaction });
    await require('./marketProductService').synchronizeProductStatus([batch.product_id], transaction);
    return { batchId: batch.batch_id, productId: batch.product_id, salePrice: Number(batch.sale_price), stock: Number(batch.remaining_quantity) };
  });
}

async function setSalePrice(productId, value) {
  money(value);
  const error = new Error('Sale prices belong to individual batches and are preserved. Receive a new price as a new stock arrival.');
  error.status = 400;
  throw error;
}

module.exports = { setSalePrice, updateBatch };
