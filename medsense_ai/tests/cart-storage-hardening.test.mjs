import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

class MemoryStorage {
  constructor() {
    this.data = new Map();
  }

  getItem(key) {
    return this.data.has(key)
      ? this.data.get(key)
      : null;
  }

  setItem(key, value) {
    this.data.set(
      key,
      String(value)
    );
  }

  removeItem(key) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }
}

globalThis.localStorage =
  new MemoryStorage();

const storage =
  await import(
    '../src/services/storefrontCartStorage.js'
  );

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const root =
  path.resolve(
    __dirname,
    '..'
  );

test.beforeEach(() => {
  localStorage.clear();
});

test(
  'cart storage keys are isolated by account',
  () => {
    assert.equal(
      storage.cartStorageKey(null),
      'medsense_storefront_cart_v3_guest'
    );

    assert.equal(
      storage.cartStorageKey(42),
      'medsense_storefront_cart_v3_42'
    );

    assert.notEqual(
      storage.cartStorageKey(42),
      storage.cartStorageKey(99)
    );
  }
);

test(
  'non-array and malformed stored carts fail closed',
  () => {
    localStorage.setItem(
      storage.cartStorageKey(42),
      JSON.stringify({
        forged: true,
      })
    );

    assert.deepEqual(
      storage.readStoredCart(42),
      []
    );

    localStorage.setItem(
      storage.cartStorageKey(42),
      '{bad-json'
    );

    assert.deepEqual(
      storage.readStoredCart(42),
      []
    );
  }
);

test(
  'stored cart items are normalized before use',
  () => {
    localStorage.setItem(
      storage.cartStorageKey(42),
      JSON.stringify([
        {
          id: 'prod-7',
          quantity: '2',
          price: '125.5',
          stockQty: '10',
        },
        {
          id: 'invalid',
          quantity: 1,
          price: 5,
        },
      ])
    );

    const items =
      storage.readStoredCart(42);

    assert.equal(
      items.length,
      1
    );

    assert.equal(
      items[0].quantity,
      2
    );

    assert.equal(
      items[0].price,
      125.5
    );
  }
);

test(
  'guest cart merge uses explicit authenticated account identity',
  () => {
    storage.writeStoredCart(
      null,
      [
        {
          id: 'prod-7',
          quantity: 2,
          price: 100,
          stockQty: 10,
        },
      ]
    );

    storage.writeStoredCart(
      42,
      [
        {
          id: 'prod-7',
          quantity: 1,
          price: 100,
          stockQty: 10,
        },
        {
          id: 'prod-8',
          quantity: 1,
          price: 200,
          stockQty: 5,
        },
      ]
    );

    const merged =
      storage
        .mergeGuestCartIntoAccount(
          42
        );

    assert.equal(
      merged.length,
      2
    );

    assert.equal(
      merged.find(
        (item) =>
          String(item.id)
            .replace(/^prod-/, '') ===
          '7'
      ).quantity,
      3
    );

    assert.deepEqual(
      storage.readStoredCart(null),
      []
    );

    assert.equal(
      storage.readStoredCart(42).length,
      2
    );
  }
);

test(
  'CartContext guards owner switch writes and listens for multi-tab storage changes',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src/context/CartContext.jsx'
        ),
        'utf8'
      );

    assert.match(
      source,
      /useLayoutEffect/
    );

    assert.match(
      source,
      /loadedOwner !== cartOwner/
    );

    assert.match(
      source,
      /window\.addEventListener\(\s*'storage'/
    );

    assert.match(
      source,
      /cartStorageKey\(\s*userId\s*\)/
    );

    assert.match(
      source,
      /cartInstanceStorageKey\(\s*userId\s*\)/
    );

    assert.match(
      source,
      /readStoredCartInstanceId\(\s*userId\s*\)/
    );
  }
);

test(
  'auth modal merges guest cart using authenticated response identity',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src/components/storefront/AuthModal.jsx'
        ),
        'utf8'
      );

    assert.match(
      source,
      /response\?\.data\?\.customer\?\.id/
    );

    assert.match(
      source,
      /mergeGuestCartToAccount/
    );
  }
);