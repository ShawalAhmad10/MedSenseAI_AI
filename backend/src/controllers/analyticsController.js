const { sequelize } = require('../config/database');

function readDays(req, fallback = 30) {
  const raw = Number(req.query.days);
  if (!Number.isInteger(raw) || raw <= 0) return fallback;
  return Math.min(raw, 365);
}

function readLimit(req, fallback = 10) {
  const raw = Number(req.query.limit);
  if (!Number.isInteger(raw) || raw <= 0) return fallback;
  return Math.min(raw, 100);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pctChange(current, previous) {
  const c = number(current);
  const p = number(previous);

  if (p === 0) {
    return c === 0 ? 0 : 100;
  }

  return Number((((c - p) / p) * 100).toFixed(2));
}

function aggregateTrend(currentRows, previousRows, bucketSize, labelPrefix) {
  const result = [];

  for (let index = 0; index < currentRows.length; index += bucketSize) {
    const currentBucket =
      currentRows.slice(index, index + bucketSize);

    const previousBucket =
      previousRows.slice(index, index + bucketSize);

    const current =
      currentBucket.reduce(
        (sum, row) => sum + number(row.recorded_sales),
        0
      );

    const previous =
      previousBucket.reduce(
        (sum, row) => sum + number(row.recorded_sales),
        0
      );

    const first = currentBucket[0];
    const last =
      currentBucket[currentBucket.length - 1];

    let label =
      first && last && first.day !== last.day
        ? first.label + ' - ' + last.label
        : first?.label || labelPrefix + ' ' + (result.length + 1);

    result.push({
      label,
      current: Number(current.toFixed(2)),
      previous: Number(previous.toFixed(2))
    });
  }

  return result;
}

exports.getSummary = async (req, res) => {
  try {
    const days = readDays(req);

    const rows = await sequelize.query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE invoice_date::date >=
            CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
        )::int AS current_orders,

        COALESCE(
          SUM(total_amount) FILTER (
            WHERE invoice_date::date >=
              CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
          ),
          0
        ) AS current_sales,

        COALESCE(
          SUM(paid_amount) FILTER (
            WHERE invoice_date::date >=
              CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
          ),
          0
        ) AS current_paid,

        COALESCE(
          SUM(due_amount) FILTER (
            WHERE invoice_date::date >=
              CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
          ),
          0
        ) AS current_due,

        COUNT(DISTINCT customer_id) FILTER (
          WHERE invoice_date::date >=
            CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
            AND customer_id IS NOT NULL
        )::int AS current_customers,

        COUNT(*) FILTER (
          WHERE invoice_date::date >=
              CURRENT_DATE - ((CAST(:days AS INTEGER) * 2) - 1)
            AND invoice_date::date <
              CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
        )::int AS previous_orders,

        COALESCE(
          SUM(total_amount) FILTER (
            WHERE invoice_date::date >=
                CURRENT_DATE - ((CAST(:days AS INTEGER) * 2) - 1)
              AND invoice_date::date <
                CURRENT_DATE - (CAST(:days AS INTEGER) - 1)
          ),
          0
        ) AS previous_sales

      FROM invoice
      WHERE status = 1
        AND invoice_date::date >=
          CURRENT_DATE - ((CAST(:days AS INTEGER) * 2) - 1)
      `,
      {
        replacements: { days },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const row = rows[0] || {};

    const recordedSales =
      number(row.current_sales);

    const totalOrders =
      number(row.current_orders);

    const previousSales =
      number(row.previous_sales);

    const previousOrders =
      number(row.previous_orders);

    const avgOrderValue =
      totalOrders > 0
        ? recordedSales / totalOrders
        : 0;

    const previousAvgOrderValue =
      previousOrders > 0
        ? previousSales / previousOrders
        : 0;

    return res.json({
      success: true,
      data: {
        days,

        // Compatibility fields for existing dashboard consumers.
        totalRevenue:
          Number(recordedSales.toFixed(2)),

        totalOrders,

        totalCustomers:
          number(row.current_customers),

        avgOrderValue:
          Number(avgOrderValue.toFixed(2)),

        totalPaid:
          Number(number(row.current_paid).toFixed(2)),

        totalDue:
          Number(number(row.current_due).toFixed(2)),

        // Explicit terminology for the real Analytics page.
        recordedSales: {
          value:
            Number(recordedSales.toFixed(2)),
          delta:
            pctChange(recordedSales, previousSales)
        },

        orders: {
          value: totalOrders,
          delta:
            pctChange(totalOrders, previousOrders)
        },

        averageInvoiceValue: {
          value:
            Number(avgOrderValue.toFixed(2)),
          delta:
            pctChange(
              avgOrderValue,
              previousAvgOrderValue
            )
        },

        measurement:
          'Recorded Sales is the sum of active invoice totals. It is not cash collected. Paid and due amounts are reported separately.'
      }
    });
  } catch (error) {
    console.error(
      'Analytics summary error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        'Unable to load analytics summary'
    });
  }
};


exports.getTrend = async (req, res) => {
  try {
    const days = readDays(req);

    const rows = await sequelize.query(
      `
      WITH dates AS (
        SELECT
          generate_series(
            CURRENT_DATE -
              ((CAST(:days AS INTEGER) * 2) - 1),
            CURRENT_DATE,
            INTERVAL '1 day'
          )::date AS day
      )

      SELECT
        d.day,
        TO_CHAR(d.day, 'Mon FMDD') AS label,
        COUNT(i.invoice_id)::int AS orders,

        COALESCE(
          SUM(i.total_amount),
          0
        ) AS recorded_sales,

        COALESCE(
          SUM(i.paid_amount),
          0
        ) AS paid_amount

      FROM dates d

      LEFT JOIN invoice i
        ON i.invoice_date::date = d.day
       AND i.status = 1

      GROUP BY d.day
      ORDER BY d.day ASC
      `,
      {
        replacements: { days },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const previousRows =
      rows.slice(0, days);

    const currentRows =
      rows.slice(days);

    const daily =
      currentRows.map((row, index) => ({
        label: row.label,
        date: row.day,
        current:
          Number(
            number(row.recorded_sales).toFixed(2)
          ),
        previous:
          Number(
            number(
              previousRows[index]?.recorded_sales
            ).toFixed(2)
          ),
        orders:
          number(row.orders),
        paid:
          Number(
            number(row.paid_amount).toFixed(2)
          )
      }));

    const weekly =
      aggregateTrend(
        currentRows,
        previousRows,
        7,
        'Week'
      );

    const monthly =
      aggregateTrend(
        currentRows,
        previousRows,
        30,
        'Period'
      );

    return res.json({
      success: true,
      data: {
        days,
        daily,
        weekly,
        monthly,
        measurement:
          'Current selected period compared with the immediately preceding equal-length period. Values are active invoice totals.'
      }
    });
  } catch (error) {
    console.error(
      'Analytics trend error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        'Unable to load analytics trend'
    });
  }
};


exports.getTopMedicines = async (req, res) => {
  try {
    const days = readDays(req);
    const limit = readLimit(req, 10);

    const rows = await sequelize.query(
      `
      WITH product_sales AS (
        SELECT
          ir.product_id,
          ir.product_title,
          COALESCE(SUM(ir.quantity), 0)::int
            AS units,

          COALESCE(
            SUM(ir.total_price),
            0
          ) AS recorded_sales

        FROM invoice_report ir

        JOIN invoice i
          ON i.invoice_id = ir.invoice_id

        WHERE ir.status = 1
          AND i.status = 1
          AND i.invoice_date::date >=
            CURRENT_DATE -
              (CAST(:days AS INTEGER) - 1)

        GROUP BY
          ir.product_id,
          ir.product_title
      ),

      totals AS (
        SELECT
          COALESCE(
            SUM(units),
            0
          ) AS total_units
        FROM product_sales
      )

      SELECT
        ps.product_id,
        ps.product_title,
        ps.units,
        ps.recorded_sales,
        t.total_units

      FROM product_sales ps
      CROSS JOIN totals t

      ORDER BY
        ps.units DESC,
        ps.recorded_sales DESC,
        ps.product_id ASC

      LIMIT :limit
      `,
      {
        replacements: {
          days,
          limit
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const data =
      rows.map((row) => {
        const units =
          number(row.units);

        const totalUnits =
          number(row.total_units);

        return {
          productId:
            number(row.product_id),

          name:
            row.product_title ||
            'Unknown product',

          units,

          revenue:
            Number(
              number(
                row.recorded_sales
              ).toFixed(2)
            ),

          pctOfTotal:
            totalUnits > 0
              ? Number(
                  (
                    (units / totalUnits) *
                    100
                  ).toFixed(1)
                )
              : 0
        };
      });

    return res.json({
      success: true,
      data,
      measurement:
        'Medicine demand is ranked by units sold from active invoice line items. Recorded sales values are invoice line totals.'
    });
  } catch (error) {
    console.error(
      'Analytics top medicines error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        'Unable to load medicine demand analytics'
    });
  }
};
