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

globalThis.sessionStorage =
  new MemoryStorage();

const session =
  await import(
    '../src/services/storefrontCheckoutSession.js'
  );

const __filename =
  fileURLToPath(
    import.meta.url
  );

const __dirname =
  path.dirname(
    __filename
  );

const root =
  path.resolve(
    __dirname,
    '..'
  );

const BUY_NOW_KEY =
  'medsense_storefront_buy_now_v2';

const LEGACY_BUY_NOW_KEY =
  'medsense_storefront_buy_now_v1';

test.beforeEach(() => {
  sessionStorage.clear();
});

test(
  'Buy Now stores exactly one normalized quantity-1 item with dedicated lifecycle',
  () => {
    const item =
      session.startBuyNowCheckout(
        {
          id: 'prod-900012',
          name: 'Metformin',
          price: '500',
          stockQty: 8,
          requiresPrescription: true,
        },
        42
      );

    assert.equal(
      item.id,
      'prod-900012'
    );

    assert.equal(
      item.quantity,
      1
    );

    assert.equal(
      item.price,
      500
    );

    const checkout =
      session.getBuyNowCheckoutSession(
        42
      );

    assert.equal(
      checkout.ownerScope,
      '42'
    );

    assert.equal(
      checkout.items.length,
      1
    );

    assert.equal(
      checkout.items[0].quantity,
      1
    );

    assert.match(
      checkout.cartInstanceId,
      /^buy-now-/
    );
  }
);

test(
  'Buy Now refresh retains the same active lifecycle',
  () => {
    session.startBuyNowCheckout(
      {
        id: 'prod-1',
        name: 'A',
        price: 10,
      },
      42
    );

    const first =
      session.getBuyNowCheckoutSession(
        42
      );

    const second =
      session.getBuyNowCheckoutSession(
        42
      );

    assert.equal(
      first.cartInstanceId,
      second.cartInstanceId
    );
  }
);

test(
  'starting a fresh Buy Now selection replaces item and rotates lifecycle',
  () => {
    session.startBuyNowCheckout(
      {
        id: 'prod-1',
        name: 'A',
        price: 10,
      },
      42
    );

    const first =
      session.getBuyNowCheckoutSession(
        42
      );

    session.startBuyNowCheckout(
      {
        id: 'prod-2',
        name: 'B',
        price: 20,
      },
      42
    );

    const second =
      session.getBuyNowCheckoutSession(
        42
      );

    assert.equal(
      second.items.length,
      1
    );

    assert.equal(
      second.items[0].id,
      'prod-2'
    );

    assert.notEqual(
      first.cartInstanceId,
      second.cartInstanceId
    );
  }
);

test(
  'malformed Buy Now session fails closed and clears itself',
  () => {
    sessionStorage.setItem(
      BUY_NOW_KEY,
      '{bad-json'
    );

    assert.deepEqual(
      session.getBuyNowCheckoutItems(
        42
      ),
      []
    );

    assert.equal(
      sessionStorage.getItem(
        BUY_NOW_KEY
      ),
      null
    );
  }
);

test(
  'unsupported Buy Now session version is rejected',
  () => {
    sessionStorage.setItem(
      BUY_NOW_KEY,
      JSON.stringify({
        version: 999,
        owner_scope: '42',
        cart_instance_id:
          'buy-now-valid-test-12345',
        item: {
          id: 'prod-1',
          price: 10,
        },
      })
    );

    assert.deepEqual(
      session.getBuyNowCheckoutItems(
        42
      ),
      []
    );

    assert.equal(
      sessionStorage.getItem(
        BUY_NOW_KEY
      ),
      null
    );
  }
);

test(
  'legacy Buy Now payload is removed rather than trusted',
  () => {
    sessionStorage.setItem(
      LEGACY_BUY_NOW_KEY,
      JSON.stringify({
        version: 1,
        item: {
          id: 'prod-1',
          price: 10,
        },
      })
    );

    assert.deepEqual(
      session.getBuyNowCheckoutItems(
        null
      ),
      []
    );

    assert.equal(
      sessionStorage.getItem(
        LEGACY_BUY_NOW_KEY
      ),
      null
    );
  }
);

test(
  'Buy Now owner mismatch fails closed and clears stale account session',
  () => {
    session.startBuyNowCheckout(
      {
        id: 'prod-1',
        price: 10,
      },
      42
    );

    assert.deepEqual(
      session.getBuyNowCheckoutItems(
        99
      ),
      []
    );

    assert.equal(
      sessionStorage.getItem(
        BUY_NOW_KEY
      ),
      null
    );
  }
);

test(
  'guest Buy Now can be deliberately adopted after successful authentication',
  () => {
    session.startBuyNowCheckout(
      {
        id: 'prod-1',
        price: 10,
      }
    );

    const guest =
      session.getBuyNowCheckoutSession();

    const adopted =
      session.adoptGuestBuyNowCheckout(
        42
      );

    assert.ok(adopted);

    assert.equal(
      adopted.ownerScope,
      '42'
    );

    assert.equal(
      adopted.cartInstanceId,
      guest.cartInstanceId
    );

    const account =
      session.getBuyNowCheckoutSession(
        42
      );

    assert.equal(
      account.items[0].id,
      'prod-1'
    );
  }
);

test(
  'one authenticated customer Buy Now cannot be adopted by another customer',
  () => {
    session.startBuyNowCheckout(
      {
        id: 'prod-1',
        price: 10,
      },
      42
    );

    const before =
      session.getBuyNowCheckoutSession(
        42
      );

    const adopted =
      session.adoptGuestBuyNowCheckout(
        99
      );

    assert.equal(
      adopted,
      null
    );

    const after =
      session.getBuyNowCheckoutSession(
        42
      );

    assert.equal(
      after.cartInstanceId,
      before.cartInstanceId
    );

    assert.equal(
      after.ownerScope,
      '42'
    );
  }
);

test(
  'clearing Buy Now removes only Buy Now session keys',
  () => {
    sessionStorage.setItem(
      'normal-cart-proof',
      'preserve-me'
    );

    session.startBuyNowCheckout(
      {
        id: 'prod-1',
        price: 10,
      },
      42
    );

    session.clearBuyNowCheckout();

    assert.equal(
      sessionStorage.getItem(
        BUY_NOW_KEY
      ),
      null
    );

    assert.equal(
      sessionStorage.getItem(
        LEGACY_BUY_NOW_KEY
      ),
      null
    );

    assert.equal(
      sessionStorage.getItem(
        'normal-cart-proof'
      ),
      'preserve-me'
    );
  }
);

test(
  'Buy Now rejects missing product identity',
  () => {
    assert.throws(
      () =>
        session.startBuyNowCheckout(
          {
            price: 10,
          },
          42
        ),
      /valid product/
    );
  }
);

test(
  'frontend binds Buy Now start, auth adoption and checkout reads to owner lifecycle',
  () => {
    const productPage =
      fs.readFileSync(
        path.join(
          root,
          'src/pages/storefront/ProductPage.jsx'
        ),
        'utf8'
      );

    const authModal =
      fs.readFileSync(
        path.join(
          root,
          'src/components/storefront/AuthModal.jsx'
        ),
        'utf8'
      );

    const checkoutPage =
      fs.readFileSync(
        path.join(
          root,
          'src/pages/storefront/CheckoutPage.jsx'
        ),
        'utf8'
      );

    assert.match(
      productPage,
      /startBuyNowCheckout\(\s*product,\s*isAuthenticated && user\?\.id/
    );

    assert.match(
      authModal,
      /adoptGuestBuyNowCheckout/
    );

    assert.match(
      checkoutPage,
      /getBuyNowCheckoutSession/
    );

    assert.match(
      checkoutPage,
      /buyNowSession\?\.ownerScope ===\s*buyNowOwnerScope/
    );

    assert.match(
      checkoutPage,
      /setBuyNowSession\(\s*getBuyNowCheckoutSession/
    );
  }
);
