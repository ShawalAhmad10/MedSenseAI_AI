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

globalThis.sessionStorage =
  new MemoryStorage();

const cartStorage =
  await import(
    '../src/services/storefrontCartStorage.js'
  );

const checkoutSession =
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

test.beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test(
  'normal cart lifecycle remains stable for the same owner',
  () => {
    const first =
      cartStorage
        .ensureStoredCartInstanceId(
          42
        );

    const second =
      cartStorage
        .ensureStoredCartInstanceId(
          42
        );

    assert.match(
      first,
      /^cart-safe-/
    );

    assert.equal(
      first,
      second
    );

    assert.notEqual(
      cartStorage
        .cartInstanceStorageKey(
          42
        ),
      cartStorage
        .cartInstanceStorageKey(
          99
        )
    );
  }
);

test(
  'fresh normal cart rotates lifecycle and clear invalidates it',
  () => {
    const first =
      cartStorage
        .startFreshCartInstanceId(
          42
        );

    const second =
      cartStorage
        .startFreshCartInstanceId(
          42
        );

    assert.notEqual(
      first,
      second
    );

    cartStorage
      .clearStoredCartInstanceId(
        42
      );

    assert.equal(
      cartStorage
        .readStoredCartInstanceId(
          42
        ),
      null
    );
  }
);

test(
  'normal cart and Buy Now safety namespaces are independent',
  () => {
    const cartId =
      cartStorage
        .startFreshCartInstanceId(
          42
        );

    checkoutSession
      .startBuyNowCheckout(
        {
          id: 'prod-7',
          price: 100,
        },
        42
      );

    const buyNow =
      checkoutSession
        .getBuyNowCheckoutSession(
          42
        );

    assert.match(
      cartId,
      /^cart-safe-/
    );

    assert.match(
      buyNow.cartInstanceId,
      /^buy-now-/
    );

    assert.notEqual(
      cartId,
      buyNow.cartInstanceId
    );
  }
);

test(
  'malformed normal cart lifecycle fails closed',
  () => {
    const key =
      cartStorage
        .cartInstanceStorageKey(
          42
        );

    localStorage.setItem(
      key,
      'forged-id'
    );

    assert.equal(
      cartStorage
        .readStoredCartInstanceId(
          42
        ),
      null
    );

    assert.equal(
      localStorage.getItem(
        key
      ),
      null
    );
  }
);

test(
  'CartContext owns and exposes dedicated cart safety lifecycle',
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
      /cartInstanceId/
    );

    assert.match(
      source,
      /startFreshCartInstanceId/
    );

    assert.match(
      source,
      /clearStoredCartInstanceId/
    );

    assert.match(
      source,
      /cartInstanceStorageKey/
    );

    assert.match(
      source,
      /readStoredCartInstanceId/
    );

    assert.doesNotMatch(
      source,
      /storedItems\.length\s*>\s*0\s*\?\s*ensureStoredCartInstanceId/
    );
  }
);

test(
  'CartPage approval matching does not use funnel telemetry lifecycle',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src/pages/storefront/CartPage.jsx'
        ),
        'utf8'
      );

    assert.match(
      source,
      /cartInstanceId/
    );

    assert.doesNotMatch(
      source,
      /getFunnelCartId/
    );
  }
);

test(
  'consultation request receives explicit safety lifecycle',
  () => {
    const service =
      fs.readFileSync(
        path.join(
          root,
          'src/services/storefrontConsultationService.js'
        ),
        'utf8'
      );

    const modal =
      fs.readFileSync(
        path.join(
          root,
          'src/components/storefront/EscalateToPharmacistModal.jsx'
        ),
        'utf8'
      );

    assert.doesNotMatch(
      service,
      /getFunnelCartId/
    );

    assert.match(
      service,
      /CONSULT_CART_INSTANCE_REQUIRED/
    );

    assert.match(
      modal,
      /createCartConsultation\(\s*items,\s*cartInstanceId,\s*message/
    );
  }
);

test(
  'checkout keeps telemetry IDs separate from safety lifecycle ID',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src/pages/storefront/CheckoutPage.jsx'
        ),
        'utf8'
      );

    assert.match(
      source,
      /funnel_session_id:\s*funnelContext\.session_id/
    );

    assert.match(
      source,
      /funnel_cart_id:\s*funnelContext\.cart_id/
    );

    assert.match(
      source,
      /cart_instance_id:\s*checkoutCartInstanceId/
    );

    assert.match(
      source,
      /activeBuyNowSession\s*\?\.cartInstanceId/
    );
  }
);

test(
  'guest cart merge creates a fresh authenticated safety lifecycle',
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
      /clearStoredCartInstanceId\(\s*null/
    );

    assert.match(
      source,
      /startFreshCartInstanceId\(\s*targetUserId/
    );

    assert.match(
      source,
      /mergedCartInstanceId/
    );
  }
);
