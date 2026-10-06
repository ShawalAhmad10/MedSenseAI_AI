import test from 'node:test';
import assert from 'node:assert/strict';
import { fifoQuote, fifoTotal, fifoBreakdown } from '../src/services/storefrontFifoPricing.js';

const item = { price: 5, quantity: 3, fifoBatches: [
  { batchId: 1, stockQty: 2, salePrice: 5, name: 'Panadol' },
  { batchId: 2, stockQty: 10, salePrice: 8, name: 'Panadol 500mg' }
] };
test('mixed FIFO quantity quotes each batch at its own price', () => {
  assert.equal(fifoTotal(item), 18);
  assert.deepEqual(fifoQuote(item).map(row => [row.batch_id, row.quantity, row.unit_price]), [[1, 2, 5], [2, 1, 8]]);
  assert.equal(fifoBreakdown(item), '2 × PKR 5.00 + 1 × PKR 8.00');
});
test('a quantity within old stock never takes the later price', () => {
  assert.equal(fifoTotal({ ...item, quantity: 2 }), 10);
});
test('legacy carts retain their quoted unit price until inventory refresh', () => {
  assert.equal(fifoTotal({ price: 5, quantity: 3 }), 15);
});
