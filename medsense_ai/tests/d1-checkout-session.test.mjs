import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.data = new Map();
  }

  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }

  setItem(key, value) {
    this.data.set(key, String(value));
  }

  removeItem(key) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }
}

globalThis.sessionStorage = new MemoryStorage();

const session = await import('../src/services/storefrontCheckoutSession.js');

test.beforeEach(() => {
  sessionStorage.clear();
});

test('Buy Now stores exactly one normalized quantity-1 item', () => {
  const item = session.startBuyNowCheckout({
    id: 'prod-900012',
    name: 'Metformin',
    price: '500',
    stockQty: 8,
    requiresPrescription: true,
  });

  assert.equal(item.id, 'prod-900012');
  assert.equal(item.quantity, 1);
  assert.equal(item.price, 500);

  const items = session.getBuyNowCheckoutItems();

  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 1);
  assert.equal(items[0].id, 'prod-900012');
});

test('Buy Now session does not accumulate previous selected products', () => {
  session.startBuyNowCheckout({ id: 'prod-1', name: 'A', price: 10 });
  session.startBuyNowCheckout({ id: 'prod-2', name: 'B', price: 20 });

  const items = session.getBuyNowCheckoutItems();

  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'prod-2');
});

test('malformed Buy Now session fails closed and clears itself', () => {
  sessionStorage.setItem('medsense_storefront_buy_now_v1', '{bad-json');

  assert.deepEqual(session.getBuyNowCheckoutItems(), []);
  assert.equal(sessionStorage.getItem('medsense_storefront_buy_now_v1'), null);
});

test('unsupported Buy Now session version is rejected', () => {
  sessionStorage.setItem(
    'medsense_storefront_buy_now_v1',
    JSON.stringify({
      version: 999,
      item: { id: 'prod-1', price: 10 },
    }),
  );

  assert.deepEqual(session.getBuyNowCheckoutItems(), []);
});

test('clearing Buy Now removes only the Buy Now session key', () => {
  sessionStorage.setItem('normal-cart-proof', 'preserve-me');
  session.startBuyNowCheckout({ id: 'prod-1', price: 10 });

  session.clearBuyNowCheckout();

  assert.equal(sessionStorage.getItem('medsense_storefront_buy_now_v1'), null);
  assert.equal(sessionStorage.getItem('normal-cart-proof'), 'preserve-me');
});

test('Buy Now rejects missing product identity', () => {
  assert.throws(
    () => session.startBuyNowCheckout({ price: 10 }),
    /valid product/,
  );
});