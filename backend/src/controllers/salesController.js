const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SCHEMA_VERSION = 'sales-optimization-v1';

function parameterError(name, min, max) {
  const error = new Error(
    `${name} must be an integer between ${min} and ${max}`
  );
  error.code = 'INVALID_SALES_PARAMETER';
  return error;
}

function boundedInteger(rawValue, { name, defaultValue, min, max }) {
  if (
    rawValue === undefined ||
    rawValue === null ||
    String(rawValue).trim() === ''
  ) {
    return defaultValue;
  }

  const text = String(rawValue).trim();

  if (!/^\d+$/.test(text)) {
    throw parameterError(name, min, max);
  }

  const value = Number(text);

  if (
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw parameterError(name, min, max);
  }

  return value;
}

function parseDays(rawValue) {
  return boundedInteger(rawValue, {
    name: 'days',
    defaultValue: 30,
    min: 1,
    max: 365,
  });
}

function parseLimit(rawValue, defaultValue) {
  return boundedInteger(rawValue, {
    name: 'limit',
    defaultValue,
    min: 1,
    max: 100,
  });
}

function activeInvoiceCondition(alias = 'i') {
  const prefix = alias ? `${alias}.` : '';

  return (
    `${prefix}status = 1 ` +
    `AND COALESCE(LOWER(${prefix}delivery_status), '') ` +
    `NOT IN ('cancelled', 'refunded')`
  );
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return Number(number(value).toFixed(2));
}

function pctChange(current, previous) {
  const currentValue = number(current);
  const previousValue = number(previous);

  if (previousValue === 0) {
    return 0;
  }

  return Number(
    (((currentValue - previousValue) / previousValue) * 100).toFixed(1)
  );
}

function sendFailure(res, error, label) {
  if (error?.code === 'INVALID_SALES_PARAMETER') {
    return res.status(400).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  console.error(label, error);

  return res.status(500).json({
    success: false,
    code: 'SALES_OPTIMIZATION_UNAVAILABLE',
    message: 'Sales optimization data is temporarily unavailable',
  });
}

exports.getSalesOverview = async (req, res) => {
  try {
    const days = parseDays(req.query?.days);

    const [row = {}] = await sequelize.query(
      `
      SELECT
        COUNT(DISTINCT i.invoice_id) FILTER (
          WHERE i.invoice_date::date >=
            CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
        )::int AS current_orders,

        COALESCE(
          SUM(i.total_amount) FILTER (
            WHERE i.invoice_date::date >=
              CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
          ),
          0
        )::numeric AS current_sales,

        COUNT(DISTINCT i.invoice_id) FILTER (
          WHERE i.invoice_date::date >=
            CURRENT_DATE - ((CAST(:days AS INTEGER) * 2) - 1)
          AND i.invoice_date::date <
            CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
        )::int AS previous_orders,

        COALESCE(
          SUM(i.total_amount) FILTER (
            WHERE i.invoice_date::date >=
              CURRENT_DATE - ((CAST(:days AS INTEGER) * 2) - 1)
            AND i.invoice_date::date <
              CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
          ),
          0
        )::numeric AS previous_sales

      FROM invoice i

      WHERE ${activeInvoiceCondition('i')}
        AND i.invoice_date::date >=
          CURRENT_DATE - ((CAST(:days AS INTEGER) * 2) - 1)
      `,
      {
        replacements: { days },
        type: QueryTypes.SELECT,
      }
    );

    const currentOrders = number(row.current_orders);
    const previousOrders = number(row.previous_orders);
    const recordedSales = money(row.current_sales);
    const previousSales = money(row.previous_sales);

    const averageInvoiceValue =
      currentOrders > 0
        ? money(recordedSales / currentOrders)
        : 0;

    const previousAverageInvoiceValue =
      previousOrders > 0
        ? money(previousSales / previousOrders)
        : 0;

    return res.json({
      success: true,
      data: {
        schema_version: SCHEMA_VERSION,
        period_days: days,

        recordedSales: {
          value: recordedSales,
          delta: pctChange(
            recordedSales,
            previousSales
          ),
        },

        orders: {
          value: currentOrders,
          delta: pctChange(
            currentOrders,
            previousOrders
          ),
        },

        averageInvoiceValue: {
          value: averageInvoiceValue,
          delta: pctChange(
            averageInvoiceValue,
            previousAverageInvoiceValue
          ),
        },

        semantics: {
          recordedSales:
            'Sum of active, non-cancelled, non-refunded invoice totals. It is not cash collected.',
          comparison:
            'Current selected period compared with the immediately preceding equal-length period.',
        },
      },
    });
  } catch (error) {
    return sendFailure(
      res,
      error,
      'Sales overview error:'
    );
  }
};

exports.getTopProducts = async (req, res) => {
  try {
    const days = parseDays(req.query?.days);
    const limit = parseLimit(req.query?.limit, 8);

    const rows = await sequelize.query(
      `
      SELECT
        ir.product_id AS "medicineId",

        COALESCE(
          NULLIF(ir.product_title, ''),
          p.product_title,
          'Unknown product'
        ) AS "medicineName",

        COALESCE(
          NULLIF(p.product_category, ''),
          'Uncategorized'
        ) AS category,

        COALESCE(SUM(ir.quantity), 0)::int
          AS "totalQty",

        COALESCE(SUM(ir.total_price), 0)::numeric
          AS "recordedSales",

        COUNT(DISTINCT i.invoice_id)::int
          AS "orderCount",

        ROW_NUMBER() OVER (
          ORDER BY
            SUM(ir.quantity) DESC,
            SUM(ir.total_price) DESC,
            ir.product_id ASC
        )::int AS rank

      FROM invoice_report ir

      JOIN invoice i
        ON i.invoice_id = ir.invoice_id

      LEFT JOIN product p
        ON p.product_id = ir.product_id

      WHERE ir.status = 1
        AND ${activeInvoiceCondition('i')}
        AND i.invoice_date::date >=
          CURRENT_DATE - (CAST(:days AS INTEGER) - 1)

      GROUP BY
        ir.product_id,
        ir.product_title,
        p.product_title,
        p.product_category

      ORDER BY
        "totalQty" DESC,
        "recordedSales" DESC,
        "medicineId" ASC

      LIMIT :limit
      `,
      {
        replacements: {
          days,
          limit,
        },
        type: QueryTypes.SELECT,
      }
    );

    return res.json({
      success: true,

      data: rows.map((row) => ({
        medicineId: number(row.medicineId),
        medicineName: row.medicineName,
        category: row.category,
        totalQty: number(row.totalQty),
        recordedSales: money(row.recordedSales),
        orderCount: number(row.orderCount),
        rank: number(row.rank),
      })),

      meta: {
        schema_version: SCHEMA_VERSION,
        period_days: days,
        limit,
        ranking:
          'Units sold descending, then Product Recorded Sales descending.',
        sales_semantics:
          'Product Recorded Sales are active invoice-line totals and exclude invoice-level charges.',
      },
    });
  } catch (error) {
    return sendFailure(
      res,
      error,
      'Top products error:'
    );
  }
};

exports.getSlowMovers = async (req, res) => {
  try {
    const days = parseDays(req.query?.days);
    const limit = parseLimit(req.query?.limit, 6);

    const rows = await sequelize.query(
      `
      WITH live_stock AS (
        SELECT
          product_id,
          COALESCE(
            SUM(remaining_quantity),
            0
          )::int AS stock_qty
        FROM stock_history
        WHERE status = 1
          AND batch_status = 'ACTIVE'
          AND remaining_quantity > 0
          AND expiry_date >= CURRENT_DATE
        GROUP BY product_id
      ),

      last_active_sale AS (
        SELECT
          ir.product_id,
          MAX(i.invoice_date) AS last_sale_date
        FROM invoice_report ir
        JOIN invoice i
          ON i.invoice_id = ir.invoice_id
        WHERE ir.status = 1
          AND ${activeInvoiceCondition('i')}
        GROUP BY ir.product_id
      )

      SELECT
        p.product_id AS "medicineId",
        p.product_title AS "medicineName",

        COALESCE(
          NULLIF(p.product_category, ''),
          'Uncategorized'
        ) AS category,

        COALESCE(ls.stock_qty, 0)::int
          AS quantity,

        sx.last_sale_date

      FROM product p

      LEFT JOIN live_stock ls
        ON ls.product_id = p.product_id

      LEFT JOIN last_active_sale sx
        ON sx.product_id = p.product_id

      WHERE COALESCE(p.product_status, 1) = 1
        AND COALESCE(ls.stock_qty, 0) > 0

        AND NOT EXISTS (
          SELECT 1
          FROM invoice_report ir2
          JOIN invoice i2
            ON i2.invoice_id = ir2.invoice_id
          WHERE ir2.product_id = p.product_id
            AND ir2.status = 1
            AND ${activeInvoiceCondition('i2')}
            AND i2.invoice_date::date >=
              CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
        )

      ORDER BY
        COALESCE(ls.stock_qty, 0) DESC,
        p.product_title ASC

      LIMIT :limit
      `,
      {
        replacements: {
          days,
          limit,
        },
        type: QueryTypes.SELECT,
      }
    );

    return res.json({
      success: true,

      data: rows.map((row) => {
        const hasLastSale =
          Boolean(row.last_sale_date);

        return {
          medicineId:
            number(row.medicineId),

          medicineName:
            row.medicineName,

          category:
            row.category,

          quantity:
            number(row.quantity),

          lastSaleDate:
            hasLastSale
              ? new Date(
                  row.last_sale_date
                ).toISOString()
              : null,

          daysNoSales:
            hasLastSale
              ? Math.max(
                  0,
                  Math.floor(
                    (
                      Date.now() -
                      new Date(
                        row.last_sale_date
                      ).getTime()
                    ) /
                    (1000 * 60 * 60 * 24)
                  )
                )
              : null,

          neverSold:
            !hasLastSale,
        };
      }),

      meta: {
        schema_version:
          SCHEMA_VERSION,

        period_days:
          days,

        limit,

        definition:
          'Active products with positive live stock and no active invoice-line sales in the selected period.',
      },
    });
  } catch (error) {
    return sendFailure(
      res,
      error,
      'Slow movers error:'
    );
  }
};

exports.getRecommendations = async (req, res) => {
  try {
    const days = parseDays(req.query?.days);
    const recommendations = [];

    const replenishmentRows =
      await sequelize.query(
        `
        WITH live_stock AS (
          SELECT
            product_id,
            COALESCE(
              SUM(remaining_quantity),
              0
            )::int AS stock_qty
          FROM stock_history
          WHERE status = 1
            AND batch_status = 'ACTIVE'
            AND remaining_quantity > 0
            AND expiry_date >= CURRENT_DATE
          GROUP BY product_id
        ),

        period_sales AS (
          SELECT
            ir.product_id,
            COALESCE(
              SUM(ir.quantity),
              0
            )::int AS sold_qty
          FROM invoice_report ir
          JOIN invoice i
            ON i.invoice_id = ir.invoice_id
          WHERE ir.status = 1
            AND ${activeInvoiceCondition('i')}
            AND i.invoice_date::date >=
              CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
          GROUP BY ir.product_id
        )

        SELECT
          p.product_id,
          p.product_title,
          COALESCE(ls.stock_qty, 0)::int
            AS stock_qty,
          COALESCE(
            p.product_min_threshold,
            0
          )::int AS minimum_threshold,
          COALESCE(ps.sold_qty, 0)::int
            AS sold_qty

        FROM product p

        LEFT JOIN live_stock ls
          ON ls.product_id = p.product_id

        JOIN period_sales ps
          ON ps.product_id = p.product_id

        WHERE COALESCE(p.product_status, 1) = 1
          AND ps.sold_qty > 0
          AND COALESCE(ls.stock_qty, 0) <=
              COALESCE(
                p.product_min_threshold,
                0
              )

        ORDER BY
          ps.sold_qty DESC,
          p.product_id ASC

        LIMIT 3
        `,
        {
          replacements: { days },
          type: QueryTypes.SELECT,
        }
      );

    for (const row of replenishmentRows) {
      recommendations.push({
        kind:
          'REPLENISHMENT_REVIEW',

        priority:
          'high',

        productId:
          number(row.product_id),

        title:
          `Review replenishment for ${row.product_title}`,

        description:
          `${number(row.stock_qty)} unit(s) currently in live stock versus configured minimum threshold ${number(row.minimum_threshold)}; ` +
          `${number(row.sold_qty)} unit(s) recorded sold during the selected ${days}-day period.`,

        evidence: {
          stockQuantity:
            number(row.stock_qty),

          minimumThreshold:
            number(row.minimum_threshold),

          unitsSold:
            number(row.sold_qty),

          periodDays:
            days,
        },
      });
    }

    const slowMoverRows =
      await sequelize.query(
        `
        WITH live_stock AS (
          SELECT
            product_id,
            COALESCE(
              SUM(remaining_quantity),
              0
            )::int AS stock_qty
          FROM stock_history
          WHERE status = 1
            AND batch_status = 'ACTIVE'
            AND remaining_quantity > 0
            AND expiry_date >= CURRENT_DATE
          GROUP BY product_id
        )

        SELECT
          p.product_id,
          p.product_title,
          COALESCE(ls.stock_qty, 0)::int
            AS stock_qty

        FROM product p

        JOIN live_stock ls
          ON ls.product_id = p.product_id

        WHERE COALESCE(p.product_status, 1) = 1
          AND COALESCE(ls.stock_qty, 0) > 0

          AND NOT EXISTS (
            SELECT 1
            FROM invoice_report ir
            JOIN invoice i
              ON i.invoice_id = ir.invoice_id
            WHERE ir.product_id = p.product_id
              AND ir.status = 1
              AND ${activeInvoiceCondition('i')}
              AND i.invoice_date::date >=
                CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
          )

        ORDER BY
          ls.stock_qty DESC,
          p.product_id ASC

        LIMIT 3
        `,
        {
          replacements: { days },
          type: QueryTypes.SELECT,
        }
      );

    for (const row of slowMoverRows) {
      recommendations.push({
        kind:
          'SLOW_MOVING_STOCK_REVIEW',

        priority:
          'medium',

        productId:
          number(row.product_id),

        title:
          `Review slow-moving stock for ${row.product_title}`,

        description:
          `${number(row.stock_qty)} unit(s) are currently in live stock with no active invoice-line sales during the selected ${days}-day period.`,

        evidence: {
          stockQuantity:
            number(row.stock_qty),

          periodDays:
            days,
        },
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        kind:
          'NO_CURRENT_FLAG',

        priority:
          'low',

        productId:
          null,

        title:
          'No current sales optimization flag',

        description:
          `No product met the governed replenishment-review or slow-moving-stock criteria during the selected ${days}-day period.`,

        evidence: {
          periodDays:
            days,
        },
      });
    }

    return res.json({
      success: true,
      data: recommendations,

      meta: {
        schema_version:
          SCHEMA_VERSION,

        period_days:
          days,

        read_only:
          true,

        limitations: [
          'These are deterministic operational review flags, not automatic purchasing, pricing, discount, or promotion actions.',
          'No forecast model or synthetic sales dataset is used.',
          'Replenishment review uses current live stock, configured product minimum threshold, and observed active invoice-line sales.',
        ],
      },
    });
  } catch (error) {
    return sendFailure(
      res,
      error,
      'Sales recommendations error:'
    );
  }
};

module.exports = {
  ...exports,
  activeInvoiceCondition,
  boundedInteger,
  parseDays,
  parseLimit,
  pctChange,
};
