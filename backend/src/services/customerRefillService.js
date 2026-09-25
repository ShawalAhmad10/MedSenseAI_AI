const {
  QueryTypes,
} = require('sequelize');

const {
  sequelize,
} = require('../config/database');

const SCHEMA_VERSION =
  'customer-refill-v1';

const ACTIVE =
  'active';

const VALID_LIFECYCLE =
  new Set([
    'active',
    'completed',
    'cancelled',
  ]);

function refillError(
  code,
  message,
  details = {}
) {
  const error =
    new Error(message);

  error.code =
    code;

  Object.assign(
    error,
    details
  );

  return error;
}

function positiveInteger(
  value,
  code,
  label
) {
  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw refillError(
      code,
      `${label} must be a positive integer`
    );
  }

  return parsed;
}

function isoToday() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function validIsoDate(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const parsed =
    new Date(
      `${value}T00:00:00.000Z`
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return false;
  }

  return (
    parsed
      .toISOString()
      .slice(0, 10) ===
    value
  );
}

function validateReminderDate(
  value,
  today = isoToday()
) {
  if (!validIsoDate(value)) {
    throw refillError(
      'REFILL_INVALID_REMINDER_DATE',
      'Reminder date must use YYYY-MM-DD'
    );
  }

  if (value < today) {
    throw refillError(
      'REFILL_INVALID_REMINDER_DATE',
      'Reminder date cannot be in the past'
    );
  }

  return value;
}

function deriveReminderState(
  reminderDate,
  lifecycleStatus = ACTIVE,
  today = isoToday()
) {
  const lifecycle =
    String(
      lifecycleStatus || ''
    ).toLowerCase();

  if (
    lifecycle !== ACTIVE
  ) {
    return lifecycle.toUpperCase();
  }

  if (
    reminderDate < today
  ) {
    return 'OVERDUE';
  }

  if (
    reminderDate === today
  ) {
    return 'DUE_TODAY';
  }

  return 'SCHEDULED';
}

function daysUntilDue(
  reminderDate,
  today = isoToday()
) {
  const due =
    Date.parse(
      `${reminderDate}T00:00:00.000Z`
    );

  const now =
    Date.parse(
      `${today}T00:00:00.000Z`
    );

  return Math.round(
    (due - now) /
    86400000
  );
}

async function ensureSchema() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS
      customer_refill_reminders (
        reminder_id SERIAL PRIMARY KEY,

        customer_id INTEGER NOT NULL
          REFERENCES customer(customer_id)
          ON DELETE CASCADE,

        source_invoice_id INTEGER NOT NULL
          REFERENCES invoice(invoice_id)
          ON DELETE RESTRICT,

        product_id INTEGER NOT NULL
          REFERENCES product(product_id)
          ON DELETE RESTRICT,

        reminder_date DATE NOT NULL,

        lifecycle_status VARCHAR(20)
          NOT NULL
          DEFAULT 'active',

        created_at TIMESTAMPTZ
          NOT NULL
          DEFAULT NOW(),

        updated_at TIMESTAMPTZ
          NOT NULL
          DEFAULT NOW(),

        CONSTRAINT
          customer_refill_lifecycle_check
        CHECK (
          lifecycle_status IN (
            'active',
            'completed',
            'cancelled'
          )
        )
      )
  `);

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
      customer_refill_one_active_source_idx
    ON customer_refill_reminders (
      customer_id,
      source_invoice_id,
      product_id
    )
    WHERE lifecycle_status = 'active'
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS
      customer_refill_customer_date_idx
    ON customer_refill_reminders (
      customer_id,
      reminder_date,
      reminder_id
    )
  `);
}

async function loadEligibleSources(
  customerId
) {
  const id =
    positiveInteger(
      customerId,
      'REFILL_INVALID_CUSTOMER_ID',
      'Customer ID'
    );

  const rows =
    await sequelize.query(
      `
      SELECT
        i.invoice_id,
        i.invoice_number,
        i.created_at AS purchase_date,
        i.delivery_status,

        ir.product_id,
        ir.product_title,

        SUM(
          COALESCE(
            ir.quantity,
            0
          )
        )::int
          AS purchased_quantity,

        p.product_title
          AS current_product_title,

        COALESCE(
          p.product_status,
          0
        )::int
          AS product_status,

        COALESCE(
          stock.available_stock,
          0
        )::int
          AS available_stock

      FROM invoice i

      JOIN invoice_report ir
        ON ir.invoice_id =
           i.invoice_id
       AND COALESCE(
             ir.status,
             1
           ) = 1

      LEFT JOIN product p
        ON p.product_id =
           ir.product_id

      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            SUM(
              sh.remaining_quantity
            ),
            0
          )::int
            AS available_stock

        FROM stock_history sh

        WHERE sh.product_id =
              ir.product_id

          AND sh.status = 1

          AND sh.remaining_quantity > 0

          AND (
            sh.expiry_date IS NULL
            OR sh.expiry_date >=
               CURRENT_DATE
          )
      ) stock
        ON TRUE

      WHERE i.customer_id =
            :customer_id

        AND COALESCE(
              i.status,
              1
            ) = 1

        AND LOWER(
              COALESCE(
                i.delivery_status,
                ''
              )
            ) IN (
              'delivered',
              'returned'
            )

        AND ir.product_id
            IS NOT NULL

      GROUP BY
        i.invoice_id,
        i.invoice_number,
        i.created_at,
        i.delivery_status,
        ir.product_id,
        ir.product_title,
        p.product_title,
        p.product_status,
        stock.available_stock

      HAVING SUM(
        COALESCE(
          ir.quantity,
          0
        )
      ) > 0

      ORDER BY
        i.created_at DESC,
        i.invoice_id DESC,
        ir.product_id ASC
      `,
      {
        replacements: {
          customer_id:
            id,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  return rows.map(
    (row) => ({
      invoice_id:
        Number(
          row.invoice_id
        ),

      invoice_number:
        row.invoice_number,

      purchase_date:
        row.purchase_date,

      delivery_status:
        row.delivery_status,

      product_id:
        Number(
          row.product_id
        ),

      product_title:
        row.current_product_title ||
        row.product_title,

      purchased_quantity:
        Number(
          row.purchased_quantity || 0
        ),

      product_status:
        Number(
          row.product_status || 0
        ),

      available_stock:
        Number(
          row.available_stock || 0
        ),

      reorder_available:
        Number(
          row.product_status || 0
        ) === 1 &&
        Number(
          row.available_stock || 0
        ) > 0,
    })
  );
}

async function loadEligibleSource(
  customerId,
  invoiceId,
  productId
) {
  const sources =
    await loadEligibleSources(
      customerId
    );

  const invoice =
    positiveInteger(
      invoiceId,
      'REFILL_INVALID_INVOICE_ID',
      'Invoice ID'
    );

  const product =
    positiveInteger(
      productId,
      'REFILL_INVALID_PRODUCT_ID',
      'Product ID'
    );

  const source =
    sources.find(
      (item) =>
        item.invoice_id === invoice &&
        item.product_id === product
    );

  if (!source) {
    throw refillError(
      'REFILL_SOURCE_NOT_ELIGIBLE',
      'The selected medicine is not an eligible delivered purchase for this customer'
    );
  }

  return source;
}

function mapReminder(
  row,
  today = isoToday()
) {
  const lifecycle =
    String(
      row.lifecycle_status ||
      ACTIVE
    ).toLowerCase();

  if (
    !VALID_LIFECYCLE.has(
      lifecycle
    )
  ) {
    throw refillError(
      'REFILL_INVALID_LIFECYCLE',
      'Stored refill lifecycle is invalid'
    );
  }

  const reminderDate =
    String(
      row.reminder_date
    ).slice(0, 10);

  return {
    schema_version:
      SCHEMA_VERSION,

    reminder_id:
      Number(
        row.reminder_id
      ),

    customer_id:
      Number(
        row.customer_id
      ),

    source_invoice_id:
      Number(
        row.source_invoice_id
      ),

    invoice_number:
      row.invoice_number ||
      null,

    product_id:
      Number(
        row.product_id
      ),

    product_title:
      row.current_product_title ||
      row.product_title ||
      null,

    reminder_date:
      reminderDate,

    lifecycle_status:
      lifecycle,

    reminder_state:
      deriveReminderState(
        reminderDate,
        lifecycle,
        today
      ),

    days_until_due:
      daysUntilDue(
        reminderDate,
        today
      ),

    purchased_quantity:
      Number(
        row.purchased_quantity || 0
      ),

    product_status:
      Number(
        row.product_status || 0
      ),

    available_stock:
      Number(
        row.available_stock || 0
      ),

    reorder_available:
      Number(
        row.product_status || 0
      ) === 1 &&
      Number(
        row.available_stock || 0
      ) > 0,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,

    limitation:
      'The reminder date is customer-selected. MedSenseAI does not infer medication consumption, dose frequency, days supply, or clinical refill timing from purchase quantity.',
  };
}

async function listReminders(
  customerId
) {
  const id =
    positiveInteger(
      customerId,
      'REFILL_INVALID_CUSTOMER_ID',
      'Customer ID'
    );

  await ensureSchema();

  const rows =
    await sequelize.query(
      `
      SELECT
        r.reminder_id,
        r.customer_id,
        r.source_invoice_id,
        r.product_id,
        r.reminder_date,
        r.lifecycle_status,
        r.created_at,
        r.updated_at,

        i.invoice_number,

        ir.product_title,

        SUM(
          COALESCE(
            ir.quantity,
            0
          )
        )::int
          AS purchased_quantity,

        p.product_title
          AS current_product_title,

        COALESCE(
          p.product_status,
          0
        )::int
          AS product_status,

        COALESCE(
          stock.available_stock,
          0
        )::int
          AS available_stock

      FROM customer_refill_reminders r

      JOIN invoice i
        ON i.invoice_id =
           r.source_invoice_id

      LEFT JOIN invoice_report ir
        ON ir.invoice_id =
           r.source_invoice_id
       AND ir.product_id =
           r.product_id
       AND COALESCE(
             ir.status,
             1
           ) = 1

      LEFT JOIN product p
        ON p.product_id =
           r.product_id

      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            SUM(
              sh.remaining_quantity
            ),
            0
          )::int
            AS available_stock

        FROM stock_history sh

        WHERE sh.product_id =
              r.product_id

          AND sh.status = 1

          AND sh.remaining_quantity > 0

          AND (
            sh.expiry_date IS NULL
            OR sh.expiry_date >=
               CURRENT_DATE
          )
      ) stock
        ON TRUE

      WHERE r.customer_id =
            :customer_id

      GROUP BY
        r.reminder_id,
        r.customer_id,
        r.source_invoice_id,
        r.product_id,
        r.reminder_date,
        r.lifecycle_status,
        r.created_at,
        r.updated_at,
        i.invoice_number,
        ir.product_title,
        p.product_title,
        p.product_status,
        stock.available_stock

      ORDER BY
        CASE
          WHEN r.lifecycle_status =
               'active'
          THEN 0
          ELSE 1
        END,
        r.reminder_date ASC,
        r.reminder_id DESC
      `,
      {
        replacements: {
          customer_id:
            id,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  return rows.map(
    (row) =>
      mapReminder(row)
  );
}

async function createReminder(
  customerId,
  payload = {}
) {
  const id =
    positiveInteger(
      customerId,
      'REFILL_INVALID_CUSTOMER_ID',
      'Customer ID'
    );

  const invoiceId =
    positiveInteger(
      payload.source_invoice_id,
      'REFILL_INVALID_INVOICE_ID',
      'Invoice ID'
    );

  const productId =
    positiveInteger(
      payload.product_id,
      'REFILL_INVALID_PRODUCT_ID',
      'Product ID'
    );

  const reminderDate =
    validateReminderDate(
      payload.reminder_date
    );

  await ensureSchema();

  const source =
    await loadEligibleSource(
      id,
      invoiceId,
      productId
    );

  try {
    const rows =
      await sequelize.query(
        `
        INSERT INTO
          customer_refill_reminders (
            customer_id,
            source_invoice_id,
            product_id,
            reminder_date,
            lifecycle_status,
            created_at,
            updated_at
          )
        VALUES (
          :customer_id,
          :source_invoice_id,
          :product_id,
          :reminder_date,
          'active',
          NOW(),
          NOW()
        )
        RETURNING
          reminder_id
        `,
        {
          replacements: {
            customer_id:
              id,

            source_invoice_id:
              source.invoice_id,

            product_id:
              source.product_id,

            reminder_date:
              reminderDate,
          },

          type:
            QueryTypes.INSERT,
        }
      );

    const inserted =
      Array.isArray(rows)
        ? rows[0]
        : rows;

    const reminderId =
      Number(
        Array.isArray(inserted)
          ? inserted[0]?.reminder_id
          : inserted?.reminder_id
      );

    const reminders =
      await listReminders(id);

    return reminders.find(
      (item) =>
        item.reminder_id ===
        reminderId
    );
  } catch (error) {
    if (
      error?.original?.code ===
        '23505' ||
      error?.parent?.code ===
        '23505'
    ) {
      throw refillError(
        'REFILL_ACTIVE_REMINDER_EXISTS',
        'An active reminder already exists for this purchased medicine'
      );
    }

    throw error;
  }
}

async function requireOwnedActiveReminder(
  customerId,
  reminderId
) {
  const customer =
    positiveInteger(
      customerId,
      'REFILL_INVALID_CUSTOMER_ID',
      'Customer ID'
    );

  const reminder =
    positiveInteger(
      reminderId,
      'REFILL_INVALID_REMINDER_ID',
      'Reminder ID'
    );

  await ensureSchema();

  const rows =
    await sequelize.query(
      `
      SELECT
        reminder_id,
        lifecycle_status
      FROM customer_refill_reminders
      WHERE reminder_id =
            :reminder_id
        AND customer_id =
            :customer_id
      LIMIT 1
      `,
      {
        replacements: {
          reminder_id:
            reminder,

          customer_id:
            customer,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  if (!rows[0]) {
    throw refillError(
      'REFILL_NOT_FOUND',
      'Refill reminder not found'
    );
  }

  if (
    rows[0].lifecycle_status !==
    ACTIVE
  ) {
    throw refillError(
      'REFILL_NOT_ACTIVE',
      'Only an active refill reminder can be changed'
    );
  }

  return {
    customer,
    reminder,
  };
}

async function updateReminderDate(
  customerId,
  reminderId,
  payload = {}
) {
  const owned =
    await requireOwnedActiveReminder(
      customerId,
      reminderId
    );

  const reminderDate =
    validateReminderDate(
      payload.reminder_date
    );

  const updatedRows =
    await sequelize.query(
      `
      UPDATE customer_refill_reminders
      SET
        reminder_date =
          :reminder_date,
        updated_at =
          NOW()
      WHERE reminder_id =
            :reminder_id
        AND customer_id =
            :customer_id
        AND lifecycle_status =
            'active'
      RETURNING reminder_id
      `,
      {
        replacements: {
          reminder_date:
            reminderDate,

          reminder_id:
            owned.reminder,

          customer_id:
            owned.customer,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  if (updatedRows.length !== 1) {
    throw refillError(
      'REFILL_NOT_ACTIVE',
      'Only an active refill reminder can be changed'
    );
  }

  const reminders =
    await listReminders(
      owned.customer
    );

  return reminders.find(
    (item) =>
      item.reminder_id ===
      owned.reminder
  );
}

async function setLifecycle(
  customerId,
  reminderId,
  lifecycleStatus
) {
  if (
    ![
      'completed',
      'cancelled',
    ].includes(
      lifecycleStatus
    )
  ) {
    throw refillError(
      'REFILL_INVALID_LIFECYCLE',
      'Unsupported refill lifecycle transition'
    );
  }

  const owned =
    await requireOwnedActiveReminder(
      customerId,
      reminderId
    );

  const updatedRows =
    await sequelize.query(
      `
      UPDATE customer_refill_reminders
      SET
        lifecycle_status =
          :lifecycle_status,
        updated_at =
          NOW()
      WHERE reminder_id =
            :reminder_id
        AND customer_id =
            :customer_id
        AND lifecycle_status =
            'active'
      RETURNING reminder_id
      `,
      {
        replacements: {
          lifecycle_status:
            lifecycleStatus,

          reminder_id:
            owned.reminder,

          customer_id:
            owned.customer,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  if (updatedRows.length !== 1) {
    throw refillError(
      'REFILL_NOT_ACTIVE',
      'Only an active refill reminder can be changed'
    );
  }

  const reminders =
    await listReminders(
      owned.customer
    );

  return reminders.find(
    (item) =>
      item.reminder_id ===
      owned.reminder
  );
}

async function completeReminder(
  customerId,
  reminderId
) {
  return setLifecycle(
    customerId,
    reminderId,
    'completed'
  );
}

async function cancelReminder(
  customerId,
  reminderId
) {
  return setLifecycle(
    customerId,
    reminderId,
    'cancelled'
  );
}

module.exports = {
  SCHEMA_VERSION,
  cancelReminder,
  completeReminder,
  createReminder,
  deriveReminderState,
  ensureSchema,
  listReminders,
  loadEligibleSources,
  updateReminderDate,
  validateReminderDate,
};
