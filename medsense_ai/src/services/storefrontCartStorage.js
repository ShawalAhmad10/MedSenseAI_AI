export const CART_KEY_PREFIX =
  'medsense_storefront_cart_v3_';

export const CART_INSTANCE_KEY_PREFIX =
  'medsense_storefront_cart_instance_v1_';

function cartOwnerScope(userId) {
  return (
    userId === null ||
    userId === undefined ||
    String(userId).trim() === ''
  )
    ? 'guest'
    : String(userId);
}

export function cartStorageKey(userId) {
  return `${CART_KEY_PREFIX}${cartOwnerScope(userId)}`;
}

export function cartInstanceStorageKey(
  userId
) {
  return `${CART_INSTANCE_KEY_PREFIX}${cartOwnerScope(userId)}`;
}

function secureLifecycleSuffix() {
  const randomUuid =
    globalThis.crypto
      ?.randomUUID?.();

  if (randomUuid) {
    return randomUuid;
  }

  if (
    globalThis.crypto
      ?.getRandomValues
  ) {
    const bytes =
      new Uint8Array(16);

    globalThis.crypto
      .getRandomValues(bytes);

    return Array.from(
      bytes,
      (value) =>
        value
          .toString(16)
          .padStart(2, '0')
    ).join('');
  }

  throw new Error(
    'Secure cart lifecycle identity is unavailable'
  );
}

function createCartInstanceId() {
  return `cart-safe-${secureLifecycleSuffix()}`;
}

function validCartInstanceId(value) {
  return (
    typeof value === 'string' &&
    /^cart-safe-[A-Za-z0-9-]{12,118}$/
      .test(value)
  );
}

export function readStoredCartInstanceId(
  userId
) {
  try {
    const key =
      cartInstanceStorageKey(
        userId
      );

    const value =
      localStorage.getItem(key);

    if (!value) {
      return null;
    }

    if (
      !validCartInstanceId(
        value
      )
    ) {
      localStorage.removeItem(key);
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

export function startFreshCartInstanceId(
  userId
) {
  const value =
    createCartInstanceId();

  localStorage.setItem(
    cartInstanceStorageKey(
      userId
    ),
    value
  );

  return value;
}

export function ensureStoredCartInstanceId(
  userId
) {
  return (
    readStoredCartInstanceId(
      userId
    ) ||
    startFreshCartInstanceId(
      userId
    )
  );
}

export function clearStoredCartInstanceId(
  userId
) {
  try {
    localStorage.removeItem(
      cartInstanceStorageKey(
        userId
      )
    );
  } catch {}

  return null;
}

function normalizeProductIdentity(value) {
  const raw =
    typeof value === 'string'
      ? value.replace(/^prod-/, '')
      : value;

  const parsed = Number(raw);

  return (
    Number.isSafeInteger(parsed) &&
    parsed > 0
  )
    ? value
    : null;
}

export function normalizeStoredCart(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      !item ||
      typeof item !== 'object'
    ) {
      return [];
    }

    const id =
      normalizeProductIdentity(
        item.id ?? item.product_id
      );

    if (id === null) {
      return [];
    }

    const rawQuantity =
      Number(item.quantity);

    const quantity =
      Number.isSafeInteger(rawQuantity) &&
      rawQuantity > 0
        ? rawQuantity
        : 1;

    const rawPrice =
      Number(item.price);

    const price =
      Number.isFinite(rawPrice) &&
      rawPrice >= 0
        ? rawPrice
        : 0;

    const rawStock =
      Number(item.stockQty);

    const stockQty =
      Number.isFinite(rawStock) &&
      rawStock >= 0
        ? rawStock
        : 0;

    return [{
      ...item,
      id,
      quantity,
      price,
      stockQty,
    }];
  });
}

export function readStoredCart(userId) {
  try {
    const raw =
      localStorage.getItem(
        cartStorageKey(userId)
      );

    if (!raw) {
      return [];
    }

    return normalizeStoredCart(
      JSON.parse(raw)
    );
  } catch {
    return [];
  }
}

export function writeStoredCart(
  userId,
  items
) {
  try {
    const normalized =
      normalizeStoredCart(items);

    localStorage.setItem(
      cartStorageKey(userId),
      JSON.stringify(normalized)
    );

    return normalized;
  } catch {
    return [];
  }
}

function itemIdentity(item) {
  return String(
    item?.id ?? ''
  ).replace(/^prod-/, '');
}

export function mergeGuestCartIntoAccount(
  targetUserId
) {
  if (
    targetUserId === null ||
    targetUserId === undefined ||
    String(targetUserId).trim() === ''
  ) {
    return null;
  }

  const guestCart =
    readStoredCart(null);

  if (guestCart.length === 0) {
    return null;
  }

  const accountCart =
    readStoredCart(targetUserId);

  const merged =
    [...accountCart];

  for (const guestItem of guestCart) {
    const index =
      merged.findIndex(
        (item) =>
          itemIdentity(item) ===
          itemIdentity(guestItem)
      );

    if (index < 0) {
      merged.push(guestItem);
      continue;
    }

    const existing =
      merged[index];

    const desiredQuantity =
      existing.quantity +
      guestItem.quantity;

    const knownStocks =
      [
        Number(existing.stockQty),
        Number(guestItem.stockQty),
      ].filter(
        (value) =>
          Number.isFinite(value) &&
          value > 0
      );

    const maxQuantity =
      knownStocks.length > 0
        ? Math.max(...knownStocks)
        : desiredQuantity;

    merged[index] = {
      ...existing,
      quantity:
        Math.min(
          desiredQuantity,
          maxQuantity
        ),
      stockQty:
        maxQuantity,
    };
  }

  const normalized =
    writeStoredCart(
      targetUserId,
      merged
    );

  localStorage.removeItem(
    cartStorageKey(null)
  );

  return normalized;
}