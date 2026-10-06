const crypto =
  require('node:crypto');

const { sequelize } =
  require('../config/database');


let schemaReady = false;
let schemaPromise = null;


function checkoutError(
  code,
  message,
  httpStatus = 409
) {
  const error =
    new Error(message);

  error.code =
    code;

  error.httpStatus =
    httpStatus;

  return error;
}


function normalizeCartInstanceId(
  value
) {
  const normalized =
    typeof value === 'string'
      ? value.trim()
      : '';

  if (
    !/^(?:cart-safe-|buy-now-)[A-Za-z0-9-]{12,118}$/
      .test(normalized)
  ) {
    throw checkoutError(
      'CHECKOUT_INSTANCE_REQUIRED',
      'A valid checkout lifecycle is required',
      400
    );
  }

  return normalized;
}


function normalizeCustomerId(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const numeric =
    Number(value);

  return (
    Number.isSafeInteger(numeric) &&
    numeric > 0
  )
    ? numeric
    : null;
}


function scalar(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value === 'string'
  ) {
    return value.trim();
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  return String(value);
}


function canonicalItems(
  items
) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      product_id:
        scalar(
          item?.product_id
        ),
      batch_id: scalar(item?.batch_id),
      quantity:
        scalar(
          item?.quantity
        ),
      discount:
        scalar(
          item?.discount ?? 0
        ),
      tax:
        scalar(
          item?.tax ?? 0
        ),
    }))
    .sort((left, right) =>
      JSON.stringify(left)
        .localeCompare(
          JSON.stringify(right)
        )
    );
}


function buildRequestFingerprint({
  customerIdValue,
  requestBody,
}) {
  const payload = {
    customer_id:
      normalizeCustomerId(
        customerIdValue
      ),

    customer_name:
      scalar(
        requestBody
          ?.customer_name
      ),

    customer_phone:
      scalar(
        requestBody
          ?.customer_phone
      ),

    customer_email:
      scalar(
        requestBody
          ?.customer_email
      ),

    customer_address:
      scalar(
        requestBody
          ?.customer_address
      ),

    payment_method:
      scalar(
        requestBody
          ?.payment_method ??
          'cash'
      ),

    notes:
      scalar(
        requestBody?.notes
      ),

    discount:
      scalar(
        requestBody
          ?.discount ?? 0
      ),

    delivery_fee:
      scalar(
        requestBody
          ?.delivery_fee ?? 0
      ),

    ddi_consultation_id:
      scalar(
        requestBody
          ?.ddi_consultation_id
      ),

    items:
      canonicalItems(
        requestBody?.items
      ),
  };

  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify(payload),
      'utf8'
    )
    .digest('hex');
}


async function ensureSchema() {
  if (schemaReady) {
    return;
  }

  if (!schemaPromise) {
    schemaPromise =
      (async () => {
        await sequelize.query(
          `
            CREATE TABLE IF NOT EXISTS
              storefront_checkout_idempotency (
                cart_instance_id
                  VARCHAR(128)
                  PRIMARY KEY,

                request_fingerprint
                  VARCHAR(64)
                  NOT NULL,

                customer_id
                  INTEGER NULL,

                status
                  VARCHAR(16)
                  NOT NULL
                  DEFAULT 'processing',

                order_id
                  INTEGER NULL,

                created_at
                  TIMESTAMPTZ
                  NOT NULL
                  DEFAULT NOW(),

                updated_at
                  TIMESTAMPTZ
                  NOT NULL
                  DEFAULT NOW(),

                completed_at
                  TIMESTAMPTZ NULL,

                CONSTRAINT
                  storefront_checkout_idempotency_status_chk
                  CHECK (
                    status IN (
                      'processing',
                      'completed'
                    )
                  )
              )
          `
        );

        await sequelize.query(
          `
            CREATE UNIQUE INDEX IF NOT EXISTS
              uq_storefront_checkout_idempotency_order
            ON storefront_checkout_idempotency (
              order_id
            )
            WHERE order_id IS NOT NULL
          `
        );

        schemaReady = true;
      })();

    schemaPromise.catch(() => {
      schemaPromise = null;
      schemaReady = false;
    });
  }

  return schemaPromise;
}


async function loadReplayOrder({
  orderId,
  transaction,
}) {
  const [rows] =
    await sequelize.query(
      `
        SELECT
          invoice_id,
          invoice_number,
          total_amount,
          payment_status,
          payment_method,
          delivery_status
        FROM invoice
        WHERE invoice_id =
              :order_id
        LIMIT 1
      `,
      {
        replacements: {
          order_id:
            orderId,
        },
        transaction,
      }
    );

  if (
    !Array.isArray(rows) ||
    rows.length !== 1
  ) {
    throw checkoutError(
      'CHECKOUT_IDEMPOTENCY_INTEGRITY',
      'The completed checkout record no longer resolves to its order',
      500
    );
  }

  const row =
    rows[0];

  return {
    orderId:
      Number(
        row.invoice_id
      ),

    orderNumber:
      row.invoice_number,

    total:
      Number(
        row.total_amount || 0
      ),

    paymentStatus:
      row.payment_status,

    paymentMethod:
      row.payment_method,

    deliveryStatus:
      row.delivery_status,

    idempotentReplay:
      true,
  };
}


async function beginCheckout({
  cartInstanceIdValue,
  customerIdValue,
  requestBody,
  transaction,
}) {
  const cartInstanceId =
    normalizeCartInstanceId(
      cartInstanceIdValue
    );

  const customerId =
    normalizeCustomerId(
      customerIdValue
    );

  const requestFingerprint =
    buildRequestFingerprint({
      customerIdValue:
        customerId,
      requestBody,
    });

  // Serialize only requests using the same checkout lifecycle.
  // The lock is automatically released with this DB transaction.
  await sequelize.query(
    `
      SELECT
        pg_advisory_xact_lock(
          hashtextextended(
            :lock_key,
            0
          )
        )
    `,
    {
      replacements: {
        lock_key:
          'medsense-checkout:' +
          cartInstanceId,
      },
      transaction,
    }
  );

  const [rows] =
    await sequelize.query(
      `
        SELECT
          cart_instance_id,
          request_fingerprint,
          customer_id,
          status,
          order_id
        FROM
          storefront_checkout_idempotency
        WHERE cart_instance_id =
              :cart_instance_id
        LIMIT 1
        FOR UPDATE
      `,
      {
        replacements: {
          cart_instance_id:
            cartInstanceId,
        },
        transaction,
      }
    );

  if (
    Array.isArray(rows) &&
    rows.length === 1
  ) {
    const existing =
      rows[0];

    const storedCustomerId =
      existing.customer_id == null
        ? null
        : Number(
            existing.customer_id
          );

    if (
      existing
        .request_fingerprint !==
        requestFingerprint ||
      storedCustomerId !==
        customerId
    ) {
      throw checkoutError(
        'CHECKOUT_IDEMPOTENCY_CONFLICT',
        'This checkout lifecycle was already used with different order details',
        409
      );
    }

    if (
      existing.status ===
        'completed' &&
      Number.isSafeInteger(
        Number(
          existing.order_id
        )
      ) &&
      Number(
        existing.order_id
      ) > 0
    ) {
      const replayOrder =
        await loadReplayOrder({
          orderId:
            Number(
              existing.order_id
            ),
          transaction,
        });

      return {
        replay:
          true,

        cartInstanceId,
        requestFingerprint,
        order:
          replayOrder,
      };
    }

    throw checkoutError(
      'CHECKOUT_ALREADY_PROCESSING',
      'This checkout lifecycle is already being processed',
      409
    );
  }

  await sequelize.query(
    `
      INSERT INTO
        storefront_checkout_idempotency (
          cart_instance_id,
          request_fingerprint,
          customer_id,
          status,
          created_at,
          updated_at
        )
      VALUES (
        :cart_instance_id,
        :request_fingerprint,
        :customer_id,
        'processing',
        NOW(),
        NOW()
      )
    `,
    {
      replacements: {
        cart_instance_id:
          cartInstanceId,

        request_fingerprint:
          requestFingerprint,

        customer_id:
          customerId,
      },
      transaction,
    }
  );

  return {
    replay:
      false,

    cartInstanceId,
    requestFingerprint,
  };
}


async function completeCheckout({
  cartInstanceIdValue,
  requestFingerprint,
  orderIdValue,
  transaction,
}) {
  const cartInstanceId =
    normalizeCartInstanceId(
      cartInstanceIdValue
    );

  const orderId =
    Number(orderIdValue);

  if (
    !Number.isSafeInteger(orderId) ||
    orderId <= 0
  ) {
    throw checkoutError(
      'CHECKOUT_IDEMPOTENCY_ORDER_REQUIRED',
      'A valid completed order is required',
      500
    );
  }

  const [updated] =
    await sequelize.query(
      `
        UPDATE
          storefront_checkout_idempotency
        SET
          status =
            'completed',

          order_id =
            :order_id,

          completed_at =
            NOW(),

          updated_at =
            NOW()

        WHERE
          cart_instance_id =
            :cart_instance_id

          AND request_fingerprint =
            :request_fingerprint

          AND status =
            'processing'

        RETURNING
          cart_instance_id
      `,
      {
        replacements: {
          cart_instance_id:
            cartInstanceId,

          request_fingerprint:
            requestFingerprint,

          order_id:
            orderId,
        },
        transaction,
      }
    );

  if (
    !Array.isArray(updated) ||
    updated.length !== 1
  ) {
    throw checkoutError(
      'CHECKOUT_IDEMPOTENCY_FINALIZE_FAILED',
      'Checkout could not be finalized safely',
      409
    );
  }
}


module.exports = {
  ensureSchema,
  beginCheckout,
  completeCheckout,
  buildRequestFingerprint,
  normalizeCartInstanceId,
};
