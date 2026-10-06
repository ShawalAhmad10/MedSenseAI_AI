const Product = require('../models/Product');

function priceError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw priceError('A positive per-unit price is required.');
  }
  const rounded = Math.round(number * 100) / 100;
  if (!Number.isFinite(rounded) || rounded <= 0) throw priceError('A positive per-unit price is required.');
  return rounded;
}

// Lock products in a stable order to avoid concurrent receipt deadlocks.
async function validateStockPrices(items, transaction, supplierId) {
  const ids = [...new Set(items.map(item => String(item.productId || '').replace(/^prod-/, '')))].sort();
  const products = new Map();
  for (const id of ids) {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0 || Number(id) > 2147483647) {
      throw priceError('Select an existing product with a valid ID for every stock item.');
    }
    const product = await Product.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!product || product.archived) throw priceError('Select an existing product for every stock item.');
    if (supplierId !== undefined && Number(product.product_supplier) !== Number(supplierId)) {
      throw priceError('Every stock item must come from its medicine assigned supplier.');
    }
    products.set(id, product);
  }
  for (const item of items) {
    const id = String(item.productId).replace(/^prod-/, '');
    const product = products.get(id);
    const purchasePrice = money(item.purchasePrice);
    const salePrice = money(item.salePrice);
    const quantity = Number(item.qty);
    const bonus = Number(item.bonus || 0);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(bonus) || bonus < 0 || quantity + bonus > 2147483647) {
      throw priceError('Batch stock and bonus must be non-negative whole numbers.');
    }
    item.productId = id;
    const arrivalName = String(item.name || product.product_title || '').trim();
    if (!arrivalName || arrivalName.length > 255) throw priceError('Enter an arrival name of 1 to 255 characters.');
    item.name = arrivalName;
    item.purchasePrice = purchasePrice;
    item.salePrice = salePrice;
  }
}

module.exports = { validateStockPrices, money };
