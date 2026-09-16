const FUNNEL_API =
  'http://localhost:5005/api/funnel/events';

const SESSION_ID_KEY = 'medsense_session_id';
const CART_ID_KEY = 'medsense_funnel_cart_id';
const CUSTOMER_AUTH_KEY = 'medsense_customer_auth';

function randomId(prefix) {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return (
    `${prefix}-${Date.now()}-` +
    Math.random().toString(36).slice(2)
  );
}

function getCustomerToken() {
  try {
    const raw =
      localStorage.getItem(CUSTOMER_AUTH_KEY);

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    return parsed?.token || null;
  } catch {
    return null;
  }
}

export function getFunnelSessionId() {
  let value =
    sessionStorage.getItem(SESSION_ID_KEY);

  if (!value) {
    value = randomId('session');
    sessionStorage.setItem(SESSION_ID_KEY, value);
  }

  return value;
}

export function getFunnelCartId() {
  let value =
    sessionStorage.getItem(CART_ID_KEY);

  if (!value) {
    value = randomId('cart');
    sessionStorage.setItem(CART_ID_KEY, value);
  }

  return value;
}

export function resetFunnelCartId() {
  sessionStorage.removeItem(CART_ID_KEY);
}

export function getFunnelContext() {
  return {
    session_id: getFunnelSessionId(),
    cart_id: getFunnelCartId()
  };
}

export async function trackFunnelEventOnce(
  eventName,
  productIds,
  quantity = null
) {
  try {
    const ids = [
      ...new Set(
        (productIds || [])
          .map((value) => {
            const raw =
              typeof value === 'string'
                ? value.replace(/^prod-/, '')
                : value;

            return Number(raw);
          })
          .filter(
            (value) =>
              Number.isSafeInteger(value) &&
              value > 0
          )
      )
    ].sort((a, b) => a - b);

    if (ids.length === 0) {
      return null;
    }

    const cartId = getFunnelCartId();

    const onceKey =
      `medsense_funnel_once:${eventName}:${cartId}:${ids.join(',')}`;

    if (
      sessionStorage.getItem(onceKey) === 'done' ||
      sessionStorage.getItem(onceKey) === 'pending'
    ) {
      return null;
    }

    sessionStorage.setItem(onceKey, 'pending');

    const result =
      await trackFunnelEvent(
        eventName,
        ids,
        quantity
      );

    if (result?.success === true) {
      sessionStorage.setItem(onceKey, 'done');
      return result;
    }

    sessionStorage.removeItem(onceKey);
    return result;

  } catch (error) {
    console.warn(
      'Funnel once-event unavailable:',
      error.message
    );

    return null;
  }
}

export async function trackFunnelEvent(
  eventName,
  productIds,
  quantity = null
) {
  try {
    const ids = [
      ...new Set(
        (productIds || [])
          .map((value) => {
            const raw =
              typeof value === 'string'
                ? value.replace(/^prod-/, '')
                : value;

            return Number(raw);
          })
          .filter(
            (value) =>
              Number.isSafeInteger(value) &&
              value > 0
          )
      )
    ];

    if (ids.length === 0) {
      return null;
    }

    const payload = {
      event_name: eventName,
      session_id: getFunnelSessionId(),
      cart_id: getFunnelCartId(),
      product_ids: ids
    };

    if (
      eventName === 'cart_item_added' &&
      Number.isSafeInteger(Number(quantity)) &&
      Number(quantity) > 0
    ) {
      payload.quantity = Number(quantity);
    }

    const customerToken =
      getCustomerToken();

    const headers = {
      'Content-Type': 'application/json',
      ...(customerToken
        ? {
            Authorization:
              `Bearer ${customerToken}`
          }
        : {})
    };

    const response = await fetch(
      FUNNEL_API,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: true
      }
    );

    if (!response.ok) {
      console.warn(
        'Funnel telemetry rejected:',
        response.status
      );

      return null;
    }

    return await response.json();

  } catch (error) {
    console.warn(
      'Funnel telemetry unavailable:',
      error.message
    );

    return null;
  }
}