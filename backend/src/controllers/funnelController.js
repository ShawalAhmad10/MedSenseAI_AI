const crypto = require('crypto');
const { sequelize } = require('../config/database');
const funnelService = require('../services/funnelService');

const PUBLIC_EVENTS = new Set([
  'product_viewed',
  'cart_item_added',
  'checkout_started'
]);

function cleanOpaqueId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim();

  if (!cleaned || cleaned.length > 128) {
    return null;
  }

  return cleaned;
}

function cleanProductIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const result = [];

  for (const raw of value) {
    const productId = Number(
      typeof raw === 'string'
        ? raw.replace(/^prod-/, '')
        : raw
    );

    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0
    ) {
      return [];
    }

    if (!result.includes(productId)) {
      result.push(productId);
    }
  }

  return result;
}

async function productsExist(productIds) {
  const rows = await sequelize.query(
    `SELECT product_id
     FROM product
     WHERE product_id IN (:product_ids)
       AND COALESCE(product_status, 1) = 1`,
    {
      replacements: {
        product_ids: productIds
      },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const found = new Set(
    rows.map((row) => Number(row.product_id))
  );

  return productIds.every(
    (id) => found.has(id)
  );
}

exports.captureEvent = async (req, res) => {
  try {
    const eventName = req.body?.event_name;

    if (!PUBLIC_EVENTS.has(eventName)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_FUNNEL_EVENT',
        message: 'Unsupported storefront funnel event'
      });
    }

    const sessionId =
      cleanOpaqueId(req.body?.session_id);

    const cartId =
      cleanOpaqueId(req.body?.cart_id);

    const productIds =
      cleanProductIds(req.body?.product_ids);

    if (
      !sessionId ||
      !cartId ||
      productIds.length === 0 ||
      productIds.length > 100
    ) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_FUNNEL_PAYLOAD',
        message:
          'Valid session_id, cart_id and product_ids are required'
      });
    }

    if (
      (
        eventName === 'product_viewed' ||
        eventName === 'cart_item_added'
      ) &&
      productIds.length !== 1
    ) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_FUNNEL_PRODUCT_COUNT',
        message:
          'This event requires exactly one product'
      });
    }

    let quantity = null;

    if (eventName === 'cart_item_added') {
      quantity = Number(req.body?.quantity);

      if (
        !Number.isSafeInteger(quantity) ||
        quantity <= 0
      ) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_FUNNEL_QUANTITY',
          message:
            'Cart addition requires positive integer quantity'
        });
      }
    }

    const authoritative =
      await productsExist(productIds);

    if (!authoritative) {
      return res.status(404).json({
        success: false,
        code: 'FUNNEL_PRODUCT_NOT_FOUND',
        message:
          'One or more products are not active PostgreSQL products'
      });
    }

    const payload = {
      schema_version: 'storefront-funnel-v1',
      event_id: `amna-${crypto.randomUUID()}`,
      event_name: eventName,
      session_id: sessionId,
      cart_id: cartId,
      occurred_at: new Date().toISOString(),
      data_origin: 'partner_real',
      product_ids: productIds
    };

    if (quantity !== null) {
      payload.quantity = quantity;
    }

    const upstream =
      await funnelService.publishEvent(payload);

    if (
      upstream.httpStatus >= 200 &&
      upstream.httpStatus < 300
    ) {
      return res.json({
        success: true,
        data: upstream.result
      });
    }

    return res.status(
      upstream.httpStatus === 409
        ? 409
        : upstream.httpStatus === 422
          ? 422
          : 502
    ).json({
      success: false,
      code: 'FUNNEL_UPSTREAM_ERROR',
      message:
        'Funnel event was not accepted',
      data: upstream.result
    });

  } catch (error) {
    console.error(
      'Funnel event error:',
      error.message
    );

    return res.status(503).json({
      success: false,
      code: 'FUNNEL_SERVICE_UNAVAILABLE',
      message:
        'Analytics event could not be recorded'
    });
  }
};

exports.getMetrics = async (req, res) => {
  try {
    const upstream =
      await funnelService.getMetrics('partner_real');

    if (
      upstream.httpStatus >= 200 &&
      upstream.httpStatus < 300
    ) {
      return res.json({
        success: true,
        data: upstream.result
      });
    }

    return res.status(502).json({
      success: false,
      code: 'FUNNEL_METRICS_UPSTREAM_ERROR',
      message:
        'Funnel metrics could not be retrieved',
      data: upstream.result
    });

  } catch (error) {
    return res.status(503).json({
      success: false,
      code: 'FUNNEL_SERVICE_UNAVAILABLE',
      message:
        'Funnel metrics service is unavailable'
    });
  }
};