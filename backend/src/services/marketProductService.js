const { sequelize } = require('../config/database');

const normalize = value => String(value || '').trim().toLowerCase();
function medicineKey(product) {
  if (product.familyId != null) return `family-${product.familyId}`;
  return JSON.stringify([normalize(product.title), normalize(product.genericName), normalize(product.salt),
    product.brandId ?? null, Number(product.packSize || 1)]);
}

function compareArrival(a, b) {
  const timestamp = value => value instanceof Date ? value.toISOString() : String(value || '9999');
  return String(a.arrivalDate || a.latestArrival || '9999').localeCompare(String(b.arrivalDate || b.latestArrival || '9999')) ||
    timestamp(a.createdAt || a.latestCreatedAt).localeCompare(timestamp(b.createdAt || b.latestCreatedAt)) ||
    Number(a.batchId || a.latestReceiptId || 0) - Number(b.batchId || b.latestReceiptId || 0);
}

// Names on receipts are snapshots; the selected medicine defines the FIFO queue.
function selectMarketProducts(products) {
  const groups = new Map();
  for (const product of products.filter(product => !product.archived)) {
    const key = medicineKey(product);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }
  return [...groups.values()].map(versions => {
    const queue = versions.flatMap(product => (product.batches || [{ batchId: product.activeBatchId,
      salePrice: product.activeBatchPrice ?? product.price, stockQty: product.activeBatchQty ?? product.stockQty,
      arrivalDate: product.latestArrival, createdAt: product.latestCreatedAt, available: true }])
      .filter(batch => !product.manuallyInactive && batch.available && Number(batch.stockQty) > 0)
      .map(batch => ({ ...batch, productId: product.id, name: batch.name || product.title }))).sort(compareArrival);
    const first = queue[0];
    const selected = first ? versions.find(product => product.id === first.productId) : [...versions].sort(compareArrival)[0];
    return { ...selected, canonicalTitle: [...versions].sort((a, b) => Number(String(a.id).replace('prod-', '')) - Number(String(b.id).replace('prod-', '')))[0].title, title: first?.name || selected.title,
      price: Number(first?.salePrice ?? selected.price), status: first ? 'active' : 'inactive',
      activeBatchId: first?.batchId || null, activeBatchNumber: first?.batchNumber || '',
      activeBatchQty: Number(first?.stockQty || 0), activeBatchPrice: first ? Number(first.salePrice) : null,
      stockQty: queue.reduce((sum, batch) => sum + Number(batch.stockQty), 0),
      fifoBatches: queue.map(batch => ({ batchId: batch.batchId, productId: batch.productId,
        name: batch.name, salePrice: Number(batch.salePrice), stockQty: Number(batch.stockQty),
        arrivalDate: batch.arrivalDate, batchNumber: batch.batchNumber })),
      versionIds: versions.map(product => product.id) };
  });
}

async function findFifoBatches(productId, transaction, lock = false) {
  if (!Number.isSafeInteger(Number(productId)) || Number(productId) <= 0 || Number(productId) > 2147483647) {
    const error = new Error('A valid product ID is required.'); error.status = 400; throw error;
  }
  const rows = await sequelize.query(`
    SELECT p.product_id, h.sale_price AS product_price, h.product_price AS product_purchase_price,
      h.batch_id, h.batch_number, h.product_title, h.remaining_quantity AS available, h.expiry_date,
      h.creation_day, h.created_at
    FROM product p
    JOIN product source ON source.product_id = :productId
      AND (p.fifo_family_id IS NOT NULL AND p.fifo_family_id = source.fifo_family_id OR
        p.fifo_family_id IS NULL AND source.fifo_family_id IS NULL AND
        LOWER(TRIM(COALESCE(p.product_title,''))) = LOWER(TRIM(COALESCE(source.product_title,''))) AND
        LOWER(TRIM(COALESCE(p.product_generic_name,''))) = LOWER(TRIM(COALESCE(source.product_generic_name,''))) AND
        LOWER(TRIM(COALESCE(p.product_salt,''))) = LOWER(TRIM(COALESCE(source.product_salt,''))) AND
        p.product_brand IS NOT DISTINCT FROM source.product_brand AND
        COALESCE(NULLIF(p.product_pack_size,0),1) = COALESCE(NULLIF(source.product_pack_size,0),1))
    JOIN stock_history h ON h.product_id = p.product_id
    WHERE NOT p.archived AND NOT p.manually_inactive AND h.status = 1 AND h.remaining_quantity > 0 AND h.sale_price > 0
      AND COALESCE(h.batch_status, 'ACTIVE') = 'ACTIVE'
      AND (h.expiry_date IS NULL OR h.expiry_date >= CURRENT_DATE)
    ORDER BY COALESCE(h.creation_day, h.created_at::date) ASC NULLS LAST,
      h.created_at ASC NULLS LAST, h.batch_id ASC
    ${lock ? 'FOR UPDATE OF h' : ''}`, {
    replacements: { productId }, type: sequelize.QueryTypes.SELECT, transaction
  });
  return rows;
}

async function findCurrentMarketProduct(productId, transaction, lock = false) {
  const rows = await findFifoBatches(productId, transaction, lock);
  if (!rows.length) return null;
  return { ...rows[0], available: rows.reduce((sum, row) => sum + Number(row.available), 0),
    fifoBatches: rows.map(row => ({ batchId: row.batch_id, productId: `prod-${row.product_id}`,
      name: row.product_title, stockQty: Number(row.available), salePrice: Number(row.product_price),
      batchNumber: row.batch_number, arrivalDate: row.creation_day })) };
}

async function listProductBatches(transaction) {
  return sequelize.query(`SELECT h.*,
    (h.status = 1 AND h.remaining_quantity > 0 AND h.batch_status = 'ACTIVE' AND h.sale_price > 0
      AND (h.expiry_date IS NULL OR h.expiry_date >= CURRENT_DATE)) AS available
    FROM stock_history h ORDER BY COALESCE(h.creation_day, h.created_at::date) ASC NULLS LAST,
      h.created_at ASC NULLS LAST, h.batch_id ASC`, { type: sequelize.QueryTypes.SELECT, transaction });
}

async function activeCustomerBatchIds() {
  const products = await require('../models/Product').findAll({ where: { archived: false } });
  const ids = new Set();
  const families = new Set();
  for (const product of products) {
    const key = product.fifo_family_id || product.product_id;
    if (families.has(key)) continue;
    families.add(key);
    const rows = await findFifoBatches(product.product_id);
    if (rows.length) ids.add(Number(rows[0].batch_id));
  }
  return ids;
}

async function synchronizeProductStatus(productIds, transaction) {
  if (!transaction) return sequelize.transaction(async statusTransaction => {
    await sequelize.query('SELECT pg_advisory_xact_lock(44201, 17001)', { transaction: statusTransaction });
    return synchronizeProductStatus(productIds, statusTransaction);
  });
  await sequelize.query(`UPDATE product p SET product_status = CASE WHEN NOT p.archived AND NOT p.manually_inactive AND EXISTS (
    SELECT 1 FROM stock_history h WHERE h.product_id = p.product_id AND h.status = 1
    AND h.batch_status = 'ACTIVE' AND h.remaining_quantity > 0 AND h.sale_price > 0
    AND (h.expiry_date IS NULL OR h.expiry_date >= CURRENT_DATE)) THEN 1 ELSE 0 END
    WHERE p.product_id IN (:productIds)`, { replacements: { productIds }, transaction });
}

module.exports = { selectMarketProducts, medicineKey, findCurrentMarketProduct, findFifoBatches,
  listProductBatches, activeCustomerBatchIds, synchronizeProductStatus };
