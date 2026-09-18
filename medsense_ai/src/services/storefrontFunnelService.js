const FUNNEL_API =
  '/api/funnel/events';

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

function newEventEnvelope() {
  return {
    event_id: randomId('event'),
    occurred_at: new Date().toISOString()
  };
}

function getCustomerToken() {
  try {
    const raw =
      sessionStorage.getItem(CUSTOMER_AUTH_KEY) ||
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

    const pendingAtKey =
      `${onceKey}:pending_at`;

    const eventKey =
      `${onceKey}:event`;

    const state =
      sessionStorage.getItem(onceKey);

    if (state === 'done') {
      return null;
    }

    if (state === 'pending') {
      const pendingAt =
        Number(
          sessionStorage.getItem(
            pendingAtKey
          )
        );

      if (
        Number.isFinite(pendingAt) &&
        Date.now() - pendingAt < 30000
      ) {
        return null;
      }

      // Recover from abandoned/stale pending telemetry.
      sessionStorage.removeItem(onceKey);
      sessionStorage.removeItem(pendingAtKey);
    }

    let envelope = null;

    try {
      const rawEnvelope =
        sessionStorage.getItem(eventKey);

      if (rawEnvelope) {
        const parsed =
          JSON.parse(rawEnvelope);

        if (
          typeof parsed?.event_id === 'string' &&
          typeof parsed?.occurred_at === 'string'
        ) {
          envelope = parsed;
        }
      }
    } catch {
      envelope = null;
    }

    if (!envelope) {
      envelope = newEventEnvelope();

      sessionStorage.setItem(
        eventKey,
        JSON.stringify(envelope)
      );
    }

    sessionStorage.setItem(
      onceKey,
      'pending'
    );

    sessionStorage.setItem(
      pendingAtKey,
      String(Date.now())
    );

    const result =
      await trackFunnelEvent(
        eventName,
        ids,
        quantity,
        envelope
      );

    if (result?.success === true) {
      sessionStorage.setItem(onceKey, 'done');
      sessionStorage.removeItem(pendingAtKey);
      sessionStorage.removeItem(eventKey);
      return result;
    }

    // Keep eventKey so a retry reuses the same event identity.
    sessionStorage.removeItem(onceKey);
    sessionStorage.removeItem(pendingAtKey);
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
  quantity = null,
  eventEnvelope = null
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

    const envelope =
      (
        eventEnvelope &&
        typeof eventEnvelope.event_id === 'string' &&
        typeof eventEnvelope.occurred_at === 'string'
      )
        ? eventEnvelope
        : newEventEnvelope();

    const payload = {
      event_id: envelope.event_id,
      occurred_at: envelope.occurred_at,
      event_name: eventName,
      session_id: getFunnelSessionId(),
      cart_id: getFunnelCartId(),
      product_ids: ids
    };

    if (
      (
        eventName === 'cart_item_added' ||
        eventName === 'cart_item_removed'
      ) &&
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