const BUY_NOW_SESSION_KEY =
  'medsense_storefront_buy_now_v2';

const LEGACY_BUY_NOW_SESSION_KEY =
  'medsense_storefront_buy_now_v1';

const BUY_NOW_SESSION_VERSION = 2;

function normalizeBuyNowItem(product) {
  if (!product?.id) {
    throw new Error(
      'A valid product is required for Buy Now checkout.'
    );
  }

  const price = Number(product.price);

  return {
    id: product.id,
    batchId: product.batchId,
    fifoBatches: product.fifoBatches,
    name:
      product.name ||
      product.title ||
      'Medicine',
    price:
      Number.isFinite(price)
        ? price
        : 0,
    quantity: 1,
    requiresPrescription:
      Boolean(
        product.requiresPrescription
      ),
    stockQty:
      Number(
        product.stockQty ?? 0
      ),
  };
}

function normalizeOwnerScope(
  userId
) {
  if (
    userId === null ||
    userId === undefined ||
    String(userId).trim() === ''
  ) {
    return 'guest';
  }

  const parsed =
    Number(userId);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      'A valid customer identity is required for Buy Now checkout.'
    );
  }

  return String(parsed);
}

function validStoredOwnerScope(
  value
) {
  if (value === 'guest') {
    return true;
  }

  const parsed =
    Number(value);

  return (
    Number.isSafeInteger(parsed) &&
    parsed > 0 &&
    String(parsed) ===
      String(value)
  );
}

function createBuyNowInstanceId() {
  const randomUuid =
    globalThis.crypto
      ?.randomUUID?.();

  const suffix =
    randomUuid ||
    [
      Date.now().toString(36),
      Math.random()
        .toString(36)
        .slice(2),
      Math.random()
        .toString(36)
        .slice(2),
    ].join('-');

  return `buy-now-${suffix}`;
}

function validBuyNowInstanceId(
  value
) {
  return (
    typeof value === 'string' &&
    /^buy-now-[A-Za-z0-9-]{12,120}$/
      .test(value)
  );
}

function removeLegacyBuyNowSession() {
  sessionStorage.removeItem(
    LEGACY_BUY_NOW_SESSION_KEY
  );
}

function clearCurrentBuyNowSession() {
  sessionStorage.removeItem(
    BUY_NOW_SESSION_KEY
  );
}

function readBuyNowPayload() {
  removeLegacyBuyNowSession();

  try {
    const raw =
      sessionStorage.getItem(
        BUY_NOW_SESSION_KEY
      );

    if (!raw) {
      return null;
    }

    const payload =
      JSON.parse(raw);

    if (
      payload?.version !==
        BUY_NOW_SESSION_VERSION ||
      !validStoredOwnerScope(
        payload?.owner_scope
      ) ||
      !validBuyNowInstanceId(
        payload?.cart_instance_id
      ) ||
      !payload?.item?.id
    ) {
      clearCurrentBuyNowSession();
      return null;
    }

    return {
      version:
        BUY_NOW_SESSION_VERSION,

      owner_scope:
        payload.owner_scope,

      cart_instance_id:
        payload.cart_instance_id,

      item:
        normalizeBuyNowItem(
          payload.item
        ),
    };
  } catch {
    clearCurrentBuyNowSession();
    return null;
  }
}

function publicSession(
  payload
) {
  if (!payload) {
    return null;
  }

  return {
    ownerScope:
      payload.owner_scope,

    cartInstanceId:
      payload.cart_instance_id,

    items: [
      payload.item,
    ],
  };
}

export function startBuyNowCheckout(
  product,
  userId = null
) {
  const item =
    normalizeBuyNowItem(
      product
    );

  const ownerScope =
    normalizeOwnerScope(
      userId
    );

  const payload = {
    version:
      BUY_NOW_SESSION_VERSION,

    owner_scope:
      ownerScope,

    cart_instance_id:
      createBuyNowInstanceId(),

    item,
  };

  removeLegacyBuyNowSession();

  sessionStorage.setItem(
    BUY_NOW_SESSION_KEY,
    JSON.stringify(payload)
  );

  return item;
}

export function getBuyNowCheckoutSession(
  userId = null
) {
  const expectedOwnerScope =
    normalizeOwnerScope(
      userId
    );

  const payload =
    readBuyNowPayload();

  if (!payload) {
    return null;
  }

  if (
    payload.owner_scope !==
      expectedOwnerScope
  ) {
    clearCurrentBuyNowSession();
    return null;
  }

  return publicSession(
    payload
  );
}

export function getBuyNowCheckoutItems(
  userId = null
) {
  return (
    getBuyNowCheckoutSession(
      userId
    )?.items || []
  );
}

export function getBuyNowCartInstanceId(
  userId = null
) {
  return (
    getBuyNowCheckoutSession(
      userId
    )?.cartInstanceId ||
    null
  );
}

export function adoptGuestBuyNowCheckout(
  targetUserId
) {
  if (
    targetUserId === null ||
    targetUserId === undefined ||
    String(targetUserId).trim() === ''
  ) {
    return null;
  }

  const targetOwnerScope =
    normalizeOwnerScope(
      targetUserId
    );

  const payload =
    readBuyNowPayload();

  if (
    !payload ||
    payload.owner_scope !==
      'guest'
  ) {
    return null;
  }

  const adopted = {
    ...payload,
    owner_scope:
      targetOwnerScope,
  };

  sessionStorage.setItem(
    BUY_NOW_SESSION_KEY,
    JSON.stringify(adopted)
  );

  return publicSession(
    adopted
  );
}

export function clearBuyNowCheckout() {
  clearCurrentBuyNowSession();
  removeLegacyBuyNowSession();
}
