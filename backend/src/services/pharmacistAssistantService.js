const {
  QueryTypes,
} = require('sequelize');

const {
  sequelize,
} = require('../config/database');

const {
  classifyIntent,
} = require('./assistantIntentProvider');

const {
  medicineInfoEvidence,
} = require('./assistantMedicineInfoService');

const SCHEMA_VERSION =
  'pharmacist-assistant-v1';

function assistantError(
  code,
  message
) {
  const error =
    new Error(message);

  error.code =
    code;

  return error;
}

function boundedMessage(
  raw
) {
  const message =
    String(
      raw || ''
    ).trim();

  if (!message) {
    throw assistantError(
      'ASSISTANT_INVALID_MESSAGE',
      'Assistant question is required'
    );
  }

  if (message.length > 500) {
    throw assistantError(
      'ASSISTANT_INVALID_MESSAGE',
      'Assistant question must be 500 characters or fewer'
    );
  }

  return message;
}

function rejectSensitiveProviderInput(
  message
) {
  const patterns = [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,

    /\b(?:\+?92|0)?3\d{9}\b/,

    /\b\d{5}-\d{7}-\d\b/,

    /\b(?:customer|patient)\s*(?:id|#)\s*[:#-]?\s*\d+\b/i,
  ];

  if (
    patterns.some(
      (pattern) =>
        pattern.test(message)
    )
  ) {
    throw assistantError(
      'ASSISTANT_SENSITIVE_QUERY_UNSUPPORTED',
      'Patient or customer identifiers are not supported in AI Assistant questions. Ask an aggregate pharmacy-operations question instead.'
    );
  }
}

async function requireEligiblePharmacist(
  pharmacistIdValue
) {
  const pharmacistId =
    String(
      pharmacistIdValue || ''
    ).trim();

  if (!pharmacistId) {
    throw assistantError(
      'ASSISTANT_STAFF_FORBIDDEN',
      'Pharmacist authentication is required'
    );
  }

  const rows =
    await sequelize.query(
      `
      SELECT id
      FROM users
      WHERE id::text =
            :pharmacist_id

        AND LOWER(
              COALESCE(
                role,
                ''
              )
            ) =
            'pharmacist'

        AND COALESCE(
              is_active,
              FALSE
            ) = TRUE

        AND COALESCE(
              is_approved,
              FALSE
            ) = TRUE

      LIMIT 1
      `,
      {
        replacements: {
          pharmacist_id:
            pharmacistId,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  if (rows.length !== 1) {
    throw assistantError(
      'ASSISTANT_STAFF_FORBIDDEN',
      'An active approved pharmacist account is required'
    );
  }

  return pharmacistId;
}

function activeInvoiceCondition(
  alias = 'i'
) {
  const prefix =
    alias
      ? `${alias}.`
      : '';

  return (
    `${prefix}status = 1 ` +
    `AND COALESCE(LOWER(${prefix}delivery_status), '') ` +
    `NOT IN ('cancelled', 'refunded')`
  );
}

function number(value) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function money(value) {
  return Number(
    number(value)
      .toFixed(2)
  );
}

async function loadInventoryRows() {
  return sequelize.query(
    `
    SELECT
      p.product_id,
      p.product_title,
      COALESCE(
        p.product_min_threshold,
        0
      )::int
        AS minimum_threshold,

      COALESCE(
        SUM(
          sh.remaining_quantity
        ),
        0
      )::int
        AS stock_quantity

    FROM product p

    LEFT JOIN stock_history sh
      ON sh.product_id =
         p.product_id
     AND sh.status = 1
     AND sh.batch_status = 'ACTIVE'
     AND sh.remaining_quantity > 0
     AND sh.expiry_date >= CURRENT_DATE

    WHERE p.product_status = 1

    GROUP BY
      p.product_id,
      p.product_title,
      p.product_min_threshold

    ORDER BY
      p.product_id ASC
    `,
    {
      type:
        QueryTypes.SELECT,
    }
  );
}

async function inventoryEvidence(
  intent
) {
  const rows =
    await loadInventoryRows();

  const mapped =
    rows.map(
      (row) => ({
        product_id:
          number(
            row.product_id
          ),

        product_title:
          row.product_title ||
          'Unknown product',

        stock_quantity:
          number(
            row.stock_quantity
          ),

        minimum_threshold:
          number(
            row.minimum_threshold
          ),
      })
    );

  const low =
    mapped.filter(
      (row) =>
        row.stock_quantity > 0 &&
        row.stock_quantity <=
          row.minimum_threshold
    );

  const out =
    mapped.filter(
      (row) =>
        row.stock_quantity === 0
    );

  if (intent === 'LOW_STOCK') {
    return {
      rows:
        low,

      summary: {
        low_stock:
          low.length,
      },

      presentation:
        'table',
    };
  }

  if (
    intent ===
    'OUT_OF_STOCK'
  ) {
    return {
      rows:
        out,

      summary: {
        out_of_stock:
          out.length,
      },

      presentation:
        'table',
    };
  }

  return {
    rows:
      mapped,

    summary: {
      active_products:
        mapped.length,

      low_stock:
        low.length,

      out_of_stock:
        out.length,

      units_in_stock:
        mapped.reduce(
          (sum, row) =>
            sum +
            row.stock_quantity,
          0
        ),
    },

    presentation:
      'table',
  };
}

async function salesSummaryEvidence(
  days
) {
  const rows =
    await sequelize.query(
      `
      SELECT
        COUNT(*)::int
          AS orders,

        COUNT(
          DISTINCT customer_id
        ) FILTER (
          WHERE customer_id
                IS NOT NULL
        )::int
          AS customers,

        COALESCE(
          SUM(total_amount),
          0
        )::numeric
          AS recorded_sales,

        COALESCE(
          SUM(paid_amount),
          0
        )::numeric
          AS cash_received,

        COALESCE(
          SUM(due_amount),
          0
        )::numeric
          AS outstanding

      FROM invoice i

      WHERE
        ${activeInvoiceCondition('i')}

        AND i.invoice_date::date >=
          CURRENT_DATE -
          (
            CAST(
              :days
              AS INTEGER
            ) - 1
          )
      `,
      {
        replacements: {
          days,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  const row =
    rows[0] || {};

  return {
    rows:
      [],

    summary: {
      days,

      orders:
        number(
          row.orders
        ),

      customers:
        number(
          row.customers
        ),

      recorded_sales:
        money(
          row.recorded_sales
        ),

      cash_received:
        money(
          row.cash_received
        ),

      outstanding:
        money(
          row.outstanding
        ),
    },

    presentation:
      'text',
  };
}

async function salesTrendEvidence(
  days
) {
  const rows =
    await sequelize.query(
      `
      WITH dates AS (
        SELECT
          generate_series(
            CURRENT_DATE -
              (
                CAST(
                  :days
                  AS INTEGER
                ) - 1
              ),
            CURRENT_DATE,
            INTERVAL '1 day'
          )::date
            AS day
      )

      SELECT
        d.day,

        COUNT(
          i.invoice_id
        )::int
          AS orders,

        COALESCE(
          SUM(
            i.total_amount
          ),
          0
        )::numeric
          AS recorded_sales,

        COALESCE(
          SUM(
            i.paid_amount
          ),
          0
        )::numeric
          AS cash_received

      FROM dates d

      LEFT JOIN invoice i
        ON i.invoice_date::date =
           d.day

       AND
         ${activeInvoiceCondition('i')}

      GROUP BY
        d.day

      ORDER BY
        d.day ASC
      `,
      {
        replacements: {
          days,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  return {
    rows:
      rows.map(
        (row) => ({
          day:
            String(
              row.day
            ).slice(
              0,
              10
            ),

          orders:
            number(
              row.orders
            ),

          recorded_sales:
            money(
              row.recorded_sales
            ),

          cash_received:
            money(
              row.cash_received
            ),
        })
      ),

    summary: {
      days,

      recorded_sales:
        money(
          rows.reduce(
            (sum, row) =>
              sum +
              number(
                row.recorded_sales
              ),
            0
          )
        ),
    },

    presentation:
      'chart',
  };
}

async function topMedicinesEvidence(
  days,
  limit
) {
  const rows =
    await sequelize.query(
      `
      SELECT
        ir.product_id,

        COALESCE(
          NULLIF(
            ir.product_title,
            ''
          ),
          p.product_title,
          'Unknown product'
        )
          AS product_title,

        COALESCE(
          SUM(
            ir.quantity
          ),
          0
        )::int
          AS units,

        COALESCE(
          SUM(
            ir.total_price
          ),
          0
        )::numeric
          AS recorded_sales

      FROM invoice_report ir

      JOIN invoice i
        ON i.invoice_id =
           ir.invoice_id

      LEFT JOIN product p
        ON p.product_id =
           ir.product_id

      WHERE ir.status = 1

        AND
          ${activeInvoiceCondition('i')}

        AND i.invoice_date::date >=
          CURRENT_DATE -
          (
            CAST(
              :days
              AS INTEGER
            ) - 1
          )

      GROUP BY
        ir.product_id,
        ir.product_title,
        p.product_title

      ORDER BY
        units DESC,
        recorded_sales DESC,
        ir.product_id ASC

      LIMIT :limit
      `,
      {
        replacements: {
          days,
          limit,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  return {
    rows:
      rows.map(
        (row) => ({
          product_id:
            number(
              row.product_id
            ),

          product_title:
            row.product_title,

          units:
            number(
              row.units
            ),

          recorded_sales:
            money(
              row.recorded_sales
            ),
        })
      ),

    summary: {
      days,
      limit,
      products:
        rows.length,
    },

    presentation:
      'table',
  };
}

async function alertsEvidence() {
  const inventory =
    await inventoryEvidence(
      'INVENTORY_STATUS'
    );

  const expiryRows =
    await sequelize.query(
      `
      SELECT
        batch_id,
        product_id,
        product_title,
        batch_number,
        expiry_date,
        remaining_quantity,

        CASE
          WHEN expiry_date <
               CURRENT_DATE
          THEN 'expired'

          ELSE 'expiring_soon'
        END AS state

      FROM stock_history

      WHERE expiry_date
            IS NOT NULL

        AND batch_status =
            'ACTIVE'
        AND status = 1
        AND remaining_quantity > 0

        AND expiry_date <=
            CURRENT_DATE + 30

      ORDER BY
        expiry_date ASC,
        batch_id ASC
      `,
      {
        type:
          QueryTypes.SELECT,
      }
    );

  const low =
    inventory.rows.filter(
      (row) =>
        row.stock_quantity > 0 &&
        row.stock_quantity <=
          row.minimum_threshold
    );

  const out =
    inventory.rows.filter(
      (row) =>
        row.stock_quantity === 0
    );

  const expired =
    expiryRows.filter(
      (row) =>
        row.state ===
        'expired'
    );

  const expiringSoon =
    expiryRows.filter(
      (row) =>
        row.state ===
        'expiring_soon'
    );

  return {
    rows: [
      ...low.map(
        (row) => ({
          type:
            'low_stock',

          severity:
            'warning',

          product_id:
            row.product_id,

          product_title:
            row.product_title,

          quantity:
            row.stock_quantity,

          threshold:
            row.minimum_threshold,
        })
      ),

      ...out.map(
        (row) => ({
          type:
            'out_of_stock',

          severity:
            'critical',

          product_id:
            row.product_id,

          product_title:
            row.product_title,

          quantity:
            0,
        })
      ),

      ...expiryRows.map(
        (row) => ({
          type:
            row.state,

          severity:
            row.state ===
            'expired'
              ? 'critical'
              : 'warning',

          product_id:
            number(
              row.product_id
            ),

          product_title:
            row.product_title,

          batch_number:
            row.batch_number,

          expiry_date:
            String(
              row.expiry_date
            ).slice(
              0,
              10
            ),

          quantity:
            number(
              row.remaining_quantity
            ),
        })
      ),
    ],

    summary: {
      low_stock:
        low.length,

      out_of_stock:
        out.length,

      expiring_soon:
        expiringSoon.length,

      expired:
        expired.length,

      total:
        low.length +
        out.length +
        expiryRows.length,
    },

    presentation:
      'alerts',
  };
}

async function refillEvidence(
  limit
) {
  const rows =
    await sequelize.query(
      `
      SELECT
        r.reminder_id,
        r.customer_id,
        c.customer_name,
        r.source_invoice_id,
        i.invoice_number,
        r.product_id,

        COALESCE(
          p.product_title,
          ir.product_title,
          'Unknown product'
        )
          AS product_title,

        r.reminder_date,

        CASE
          WHEN r.reminder_date <
               CURRENT_DATE
          THEN 'OVERDUE'

          ELSE 'DUE_TODAY'
        END
          AS reminder_state

      FROM customer_refill_reminders r

      JOIN customer c
        ON c.customer_id =
           r.customer_id

      JOIN invoice i
        ON i.invoice_id =
           r.source_invoice_id

      LEFT JOIN product p
        ON p.product_id =
           r.product_id

      LEFT JOIN invoice_report ir
        ON ir.invoice_id =
           r.source_invoice_id
       AND ir.product_id =
           r.product_id
       AND COALESCE(
             ir.status,
             1
           ) = 1

      WHERE r.lifecycle_status =
            'active'

        AND r.reminder_date <=
            CURRENT_DATE

      GROUP BY
        r.reminder_id,
        r.customer_id,
        c.customer_name,
        r.source_invoice_id,
        i.invoice_number,
        r.product_id,
        p.product_title,
        ir.product_title,
        r.reminder_date

      ORDER BY
        r.reminder_date ASC,
        r.reminder_id ASC

      LIMIT :limit
      `,
      {
        replacements: {
          limit,
        },

        type:
          QueryTypes.SELECT,
      }
    );

  const mapped =
    rows.map(
      (row) => ({
        reminder_id:
          number(
            row.reminder_id
          ),

        customer_id:
          number(
            row.customer_id
          ),

        customer_name:
          row.customer_name,

        source_invoice_id:
          number(
            row.source_invoice_id
          ),

        invoice_number:
          row.invoice_number,

        product_id:
          number(
            row.product_id
          ),

        product_title:
          row.product_title,

        reminder_date:
          String(
            row.reminder_date
          ).slice(
            0,
            10
          ),

        reminder_state:
          row.reminder_state,
      })
    );

  return {
    rows:
      mapped,

    summary: {
      due_today:
        mapped.filter(
          (row) =>
            row.reminder_state ===
            'DUE_TODAY'
        ).length,

      overdue:
        mapped.filter(
          (row) =>
            row.reminder_state ===
            'OVERDUE'
        ).length,

      total:
        mapped.length,
    },

    presentation:
      'refills',
  };
}

async function collectEvidence(
  classification,
  rawMessage = ''
) {
  const {
    intent,
    days,
    limit,
  } = classification;

  switch (intent) {
    case 'LOW_STOCK':
    case 'OUT_OF_STOCK':
    case 'INVENTORY_STATUS':
      return inventoryEvidence(
        intent
      );

    case 'SALES_SUMMARY':
      return salesSummaryEvidence(
        days
      );

    case 'SALES_TREND':
      return salesTrendEvidence(
        days
      );

    case 'TOP_MEDICINES':
      return topMedicinesEvidence(
        days,
        limit
      );

    case 'ALERTS':
      return alertsEvidence();

    case 'REFILLS_DUE':
      return refillEvidence(
        limit
      );

    case 'MEDICINE_INFO':
      return medicineInfoEvidence(
        rawMessage
      );

    case 'DDI_REDIRECT':
    case 'UNSUPPORTED':
      return {
        rows:
          [],

        summary:
          {},

        presentation:
          'text',
      };

    default:
      throw assistantError(
        'ASSISTANT_UNSUPPORTED_INTENT',
        'Assistant intent is unsupported'
      );
  }
}

function inventoryReply(
  intent,
  evidence
) {
  if (
    intent ===
    'LOW_STOCK'
  ) {
    if (
      evidence.summary
        .low_stock === 0
    ) {
      return (
        'No active medicines are currently below their configured minimum stock threshold while still above zero.'
      );
    }

    const sample =
      evidence.rows
        .slice(0, 5)
        .map(
          (row) =>
            `${row.product_title}: ${row.stock_quantity} unit(s), threshold ${row.minimum_threshold}`
        )
        .join('; ');

    return (
      `${evidence.summary.low_stock} active medicine(s) are currently low stock. ` +
      sample
    );
  }

  if (
    intent ===
    'OUT_OF_STOCK'
  ) {
    if (
      evidence.summary
        .out_of_stock === 0
    ) {
      return (
        'No active medicines are currently recorded with zero stock.'
      );
    }

    const sample =
      evidence.rows
        .slice(0, 5)
        .map(
          (row) =>
            row.product_title
        )
        .join(', ');

    return (
      `${evidence.summary.out_of_stock} active medicine(s) are currently out of stock: ${sample}.`
    );
  }

  return (
    `Inventory currently contains ${evidence.summary.active_products} active product(s), ` +
    `${evidence.summary.low_stock} low-stock product(s), ` +
    `${evidence.summary.out_of_stock} out-of-stock product(s), ` +
    `and ${evidence.summary.units_in_stock} recorded stock unit(s).`
  );
}

function buildReply(
  classification,
  evidence
) {
  const {
    intent,
    days,
  } =
    classification;

  if (
    intent ===
      'MEDICINE_INFO'
  ) {
    const status =
      evidence?.summary
        ?.status;

    if (
      status ===
      'NOT_FOUND'
    ) {
      return (
        'I could not find an active catalogue medicine matching that question. ' +
        'Try the exact product, generic, or salt name.'
      );
    }

    if (
      status ===
      'AMBIGUOUS'
    ) {
      const options =
        evidence.rows
          .map(
            (row) =>
              row.product_title
          )
          .filter(Boolean)
          .join(', ');

      return (
        'More than one active catalogue medicine matches that question' +
        (
          options
            ? ': ' + options
            : ''
        ) +
        '. Please ask using one exact product name.'
      );
    }

    const row =
      evidence.rows?.[0];

    if (!row) {
      return (
        'No grounded catalogue medicine record is available for that question.'
      );
    }

    const generic =
      row.product_generic_name ||
      'not recorded';

    const salt =
      row.product_salt ||
      'not recorded';


    const rx =
      row.product_requires_rx === true
        ? 'required'
        : row.product_requires_rx === false
          ? 'not marked as required'
          : 'not recorded';

    return (
      'Catalogue record for ' +
      (row.product_title || 'this medicine') +
      '. Generic name: ' +
      generic +
      '. Salt/active ingredient: ' +
      salt +

      '. Prescription requirement: ' +
      rx +
      '. Current recorded stock: ' +
      Number(
        row.stock_quantity || 0
      ) +
      ' unit(s). ' +
      'This is catalogue and stock information only; it is not dosing, diagnosis, clinical substitution, or DDI clearance.'
    );
  }

  if (
    [
      'LOW_STOCK',
      'OUT_OF_STOCK',
      'INVENTORY_STATUS',
    ].includes(intent)
  ) {
    return inventoryReply(
      intent,
      evidence
    );
  }

  if (
    intent ===
    'SALES_SUMMARY'
  ) {
    const summary =
      evidence.summary;

    return (
      `For the last ${days} day(s), Recorded Sales are PKR ${summary.recorded_sales.toFixed(2)} ` +
      `across ${summary.orders} active invoice(s). ` +
      `Cash received is PKR ${summary.cash_received.toFixed(2)} and recorded outstanding amount is PKR ${summary.outstanding.toFixed(2)}. ` +
      'Recorded Sales are invoice totals, not cash collected.'
    );
  }

  if (
    intent ===
    'SALES_TREND'
  ) {
    return (
      `Daily Recorded Sales for the last ${days} day(s) have been loaded from active, non-cancelled, non-refunded invoices.`
    );
  }

  if (
    intent ===
    'TOP_MEDICINES'
  ) {
    if (
      evidence.rows.length === 0
    ) {
      return (
        `No active invoice-line medicine demand was recorded in the last ${days} day(s).`
      );
    }

    const sample =
      evidence.rows
        .slice(0, 5)
        .map(
          (row) =>
            `${row.product_title}: ${row.units} unit(s)`
        )
        .join('; ');

    return (
      `Top medicine demand for the last ${days} day(s), ranked by units sold: ${sample}.`
    );
  }

  if (
    intent ===
    'ALERTS'
  ) {
    const summary =
      evidence.summary;

    return (
      `Current governed alerts: ${summary.low_stock} low stock, ` +
      `${summary.out_of_stock} out of stock, ` +
      `${summary.expiring_soon} expiring within 30 days, ` +
      `and ${summary.expired} expired batch alert(s).`
    );
  }

  if (
    intent ===
    'REFILLS_DUE'
  ) {
    const summary =
      evidence.summary;

    if (summary.total === 0) {
      return (
        'No active customer-selected refill reminders are due today or overdue.'
      );
    }

    return (
      `${summary.total} active customer-selected refill reminder(s) require attention: ` +
      `${summary.due_today} due today and ${summary.overdue} overdue. ` +
      'These dates were selected by customers and are not inferred clinical refill timing.'
    );
  }

  if (
    intent ===
    'DDI_REDIRECT'
  ) {
    return (
      'This assistant does not independently assess medicine-combination safety. ' +
      'Use the governed cart drug-interaction check for authoritative interaction evidence, and review escalated cases through the pharmacist consultation workflow.'
    );
  }

  return (
    'I can answer grounded pharmacy-operations questions about medicine catalogue information, inventory, low or out-of-stock medicines, sales, sales trends, top medicines, operational alerts, and due refill reminders. ' +
    'I do not diagnose, recommend doses, establish medicine substitution safety, or replace the governed drug-interaction workflow.'
  );
}

function evidenceSource(
  intent
) {
  if (
    intent ===
      'MEDICINE_INFO'
  ) {
    return (
      'PostgreSQL product + stock_history'
    );
  }

  if (
    [
      'LOW_STOCK',
      'OUT_OF_STOCK',
      'INVENTORY_STATUS',
    ].includes(intent)
  ) {
    return (
      'PostgreSQL product + stock_history'
    );
  }

  if (
    [
      'SALES_SUMMARY',
      'SALES_TREND',
    ].includes(intent)
  ) {
    return (
      'PostgreSQL invoice active lifecycle'
    );
  }

  if (
    intent ===
    'TOP_MEDICINES'
  ) {
    return (
      'PostgreSQL invoice_report + invoice active lifecycle'
    );
  }

  if (
    intent ===
    'ALERTS'
  ) {
    return (
      'PostgreSQL product + stock_history alert semantics'
    );
  }

  if (
    intent ===
    'REFILLS_DUE'
  ) {
    return (
      'PostgreSQL customer_refill_reminders'
    );
  }

  if (
    intent ===
    'DDI_REDIRECT'
  ) {
    return (
      'Governed DDI workflow boundary'
    );
  }

  return (
    'Assistant scope contract'
  );
}

async function askAssistant(
  pharmacistIdValue,
  rawMessage,
  options = {}
) {
  await requireEligiblePharmacist(
    pharmacistIdValue
  );

  const message =
    boundedMessage(
      rawMessage
    );

  rejectSensitiveProviderInput(
    message
  );

  const classifier =
    options.classifyIntent ||
    classifyIntent;

  const classification =
    await classifier(
      message
    );

  const evidence =
    await collectEvidence(
      classification,
      message
    );

  const reply =
    buildReply(
      classification,
      evidence
    );

  return {
    schema_version:
      SCHEMA_VERSION,

    intent:
      classification.intent,

    parameters: {
      days:
        classification.days,

      limit:
        classification.limit,
    },

    reply,

    evidence: {
      source:
        evidenceSource(
          classification.intent
        ),

      summary:
        evidence.summary,

      rows:
        evidence.rows,

      presentation:
        evidence.presentation,
    },

    data_as_of:
      new Date()
        .toISOString(),

    limitations: [
      'A local bounded intent classifier is used only to route the pharmacist question into supported operational intents.',
      'Pharmacy facts are loaded locally from authoritative PostgreSQL data after classification and are not supplied to the model.',
      'The assistant is read-only and cannot modify inventory, customers, orders, invoices, payments, prescriptions, refill reminders, or DDI state.',
      'The assistant does not provide diagnosis, dosing, clinical substitution, or independent drug-interaction clearance.',
    ],
  };
}

module.exports = {
  SCHEMA_VERSION,
  activeInvoiceCondition,
  askAssistant,
  buildReply,
  collectEvidence,
  rejectSensitiveProviderInput,
  requireEligiblePharmacist,
};
