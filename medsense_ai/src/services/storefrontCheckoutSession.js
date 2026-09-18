const BUY_NOW_SESSION_KEY = 'medsense_storefront_buy_now_v1';

function normalizeBuyNowItem(product) {
  if (!product?.id) {
    throw new Error('A valid product is required for Buy Now checkout.');
  }

  const price = Number(product.price);

  return {
    id: product.id,
    name: product.name || product.title || 'Medicine',
    price: Number.isFinite(price) ? price : 0,
    quantity: 1,
    requiresPrescription: Boolean(product.requiresPrescription),
    stockQty: Number(product.stockQty ?? 0),
  };
}

export function startBuyNowCheckout(product) {
  const item = normalizeBuyNowItem(product);

  sessionStorage.setItem(
    BUY_NOW_SESSION_KEY,
    JSON.stringify({
      version: 1,
      item,
    }),
  );

  return item;
}

export function getBuyNowCheckoutItems() {
  try {
    const raw = sessionStorage.getItem(BUY_NOW_SESSION_KEY);

    if (!raw) {
      return [];
    }

    const payload = JSON.parse(raw);

    if (payload?.version !== 1 || !payload?.item?.id) {
      sessionStorage.removeItem(BUY_NOW_SESSION_KEY);
      return [];
    }

    return [normalizeBuyNowItem(payload.item)];
  } catch {
    sessionStorage.removeItem(BUY_NOW_SESSION_KEY);
    return [];
  }
}

export function clearBuyNowCheckout() {
  sessionStorage.removeItem(BUY_NOW_SESSION_KEY);
}