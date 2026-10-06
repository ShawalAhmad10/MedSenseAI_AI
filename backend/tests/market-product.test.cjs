const test = require('node:test');
const assert = require('node:assert/strict');
const { selectMarketProducts } = require('../src/services/marketProductService');

const version = (id, price, receipt, overrides = {}) => ({
  id: `prod-${id}`, title: 'Panadol', genericName: 'Paracetamol', salt: 'Paracetamol',
  brandId: 1, packSize: 10, price, activeBatchPrice: price, activeBatchQty: overrides.stockQty ?? 20,
  latestReceiptId: receipt, activeBatchId: receipt, latestArrival: `2026-01-${String(receipt || 1).padStart(2, '0')}`,
  stockQty: 20, status: 'active', ...overrides
});

test('one card displays the oldest stocked version when price increases', () => {
  const products = selectMarketProducts([version(1, 8, 3), version(2, 10, 4)]);
  assert.equal(products.length, 1);
  assert.equal(products[0].id, 'prod-1');
  assert.equal(products[0].price, 8);
  assert.equal(products[0].stockQty, 40);
});
test('later cheaper arrivals wait until older stock is sold', () => {
  const products = selectMarketProducts([version(1, 8, 5), version(2, 10, 4)]);
  assert.equal(products[0].price, 10);
});
test('sold-out current version falls back to remaining stock at its updated sale price', () => {
  const products = selectMarketProducts([version(1, 7, 3), version(2, 10, 4, { stockQty: 0 })]);
  assert.equal(products[0].price, 7);
  assert.equal(products[0].id, 'prod-1');
});
test('creating an unstocked new version does not switch the customer card', () => {
  assert.equal(selectMarketProducts([version(1, 8, 3), version(2, 10, 0, { stockQty: 0 })])[0].price, 8);
});
test('different brands, strengths and pack sizes remain different medicines', () => {
  const products = selectMarketProducts([version(1, 8, 1), version(2, 8, 2, { brandId: 2 }),
    version(3, 8, 3, { title: 'Panadol Extra' }), version(4, 8, 4, { packSize: 20 })]);
  assert.equal(products.length, 4);
});
test('inactive versions never become the customer market card', () => {
  assert.equal(selectMarketProducts([version(1, 8, 3), version(2, 10, 4, { status: 'inactive', manuallyInactive: true })])[0].price, 8);
});

test('arrival date takes priority over price and numeric receipt ID', () => {
  const products = selectMarketProducts([version(1, 130, 99, { latestArrival: '2026-01-01' }),
    version(2, 120, 10, { latestArrival: '2026-02-01' })]);
  assert.equal(products[0].price, 130);
});

test('all exhausted batches produce an out of stock card', () => {
  assert.equal(selectMarketProducts([version(1, 120, 1, { stockQty: 0 }), version(2, 130, 2, { stockQty: 0 })])[0].stockQty, 0);
});


test('renamed price versions share one FIFO card and advance after depletion', () => {
  const versions = [version(1, 10, 1, { familyId: 1 }),
    version(2, 18, 2, { familyId: 1, title: 'Panadol(new)' }),
    version(3, 20, 3, { familyId: 1, title: 'Panadol(newest)' })];
  const first = selectMarketProducts(versions);
  assert.equal(first.length, 1);
  assert.equal(first[0].price, 10);
  assert.equal(first[0].fifoBatches.length, 3);
  versions[0].stockQty = 0; versions[0].activeBatchQty = 0;
  const next = selectMarketProducts(versions);
  assert.equal(next.length, 1);
  assert.equal(next[0].price, 18);
  assert.equal(next[0].canonicalTitle, 'Panadol');
  versions[1].archived = true;
  assert.equal(selectMarketProducts(versions)[0].price, 20);
});
