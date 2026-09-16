// Sales Controller - Real Data from Invoices
const { sequelize } = require('../config/database');

// Sales Overview
exports.getSalesOverview = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Current period stats
    const currentStats = await sequelize.query(`
      SELECT 
        COUNT(DISTINCT i.invoice_id) as total_orders,
        COALESCE(SUM(i.total_amount), 0) as total_revenue,
        COALESCE(AVG(i.total_amount), 0) as avg_order_value
      FROM invoice i
      WHERE i.created_at >= :startDate
    `, {
      replacements: { startDate: startDate.toISOString() },
      type: sequelize.QueryTypes.SELECT
    });

    // Previous period stats for comparison
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - parseInt(days));
    
    const prevStats = await sequelize.query(`
      SELECT 
        COUNT(DISTINCT i.invoice_id) as total_orders,
        COALESCE(SUM(i.total_amount), 0) as total_revenue,
        COALESCE(AVG(i.total_amount), 0) as avg_order_value
      FROM invoice i
      WHERE i.created_at >= :prevStartDate AND i.created_at < :startDate
    `, {
      replacements: { prevStartDate: prevStartDate.toISOString(), startDate: startDate.toISOString() },
      type: sequelize.QueryTypes.SELECT
    });

    const current = currentStats[0];
    const previous = prevStats[0];

    // Calculate deltas
    const revenueDelta = previous.total_revenue > 0 
      ? (((current.total_revenue - previous.total_revenue) / previous.total_revenue) * 100).toFixed(1)
      : 0;
    
    const ordersDelta = previous.total_orders > 0 
      ? (((current.total_orders - previous.total_orders) / previous.total_orders) * 100).toFixed(1)
      : 0;
    
    const avgOrderValueDelta = previous.avg_order_value > 0 
      ? (((current.avg_order_value - previous.avg_order_value) / previous.avg_order_value) * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        revenue: {
          value: parseFloat(current.total_revenue),
          delta: parseFloat(revenueDelta)
        },
        orders: {
          value: parseInt(current.total_orders),
          delta: parseFloat(ordersDelta)
        },
        avgOrderValue: {
          value: parseFloat(current.avg_order_value.toFixed(2)),
          delta: parseFloat(avgOrderValueDelta)
        }
      }
    });
  } catch (error) {
    console.error('Sales overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales overview',
      error: error.message
    });
  }
};

// Top Selling Products
exports.getTopProducts = async (req, res) => {
  try {
    const { days = 30, limit = 8 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const products = await sequelize.query(`
      SELECT 
        ii.product_id as "medicineId",
        ii.product_title as "medicineName",
        'General' as category,
        SUM(ii.quantity) as "totalQty",
        SUM(ii.total_price) as "totalRevenue",
        COUNT(DISTINCT i.invoice_id) as "orderCount",
        ROW_NUMBER() OVER (ORDER BY SUM(ii.total_price) DESC) as rank
      FROM invoice_report ii
      INNER JOIN invoice i ON ii.invoice_id = i.invoice_id
      WHERE i.created_at >= :startDate
      GROUP BY ii.product_id, ii.product_title
      ORDER BY "totalRevenue" DESC
      LIMIT :limit
    `, {
      replacements: { startDate: startDate.toISOString(), limit: parseInt(limit) },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: products.map(p => ({
        ...p,
        totalRevenue: parseFloat(p.totalRevenue),
        totalQty: parseInt(p.totalQty),
        orderCount: parseInt(p.orderCount),
        rank: parseInt(p.rank)
      }))
    });
  } catch (error) {
    console.error('Top products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top products',
      error: error.message
    });
  }
};

// Slow Movers
exports.getSlowMovers = async (req, res) => {
  try {
    const rawDays = Number.parseInt(req.query.days, 10);
    const rawLimit = Number.parseInt(req.query.limit, 10);

    const days =
      Number.isFinite(rawDays) && rawDays > 0
        ? Math.min(rawDays, 3650)
        : 30;

    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, 100)
        : 6;

    /*
     * Latest DB contract:
     * product = product master
     * stock_history = batch-level authoritative current stock
     * invoice/invoice_report = real completed sales records
     *
     * product.product_stock_qty does NOT exist.
     */
    const slowMovers = await sequelize.query(`
      WITH live_stock AS (
        SELECT
          product_id,
          COALESCE(SUM(remaining_quantity), 0)::int AS stock_qty
        FROM stock_history
        WHERE status = 1
        GROUP BY product_id
      ),
      last_sales AS (
        SELECT
          ir.product_id,
          MAX(i.created_at) AS last_sale_date
        FROM invoice_report ir
        INNER JOIN invoice i
          ON i.invoice_id = ir.invoice_id
        WHERE ir.status = 1
          AND i.status = 1
        GROUP BY ir.product_id
      )
      SELECT
        p.product_id AS "medicineId",
        p.product_title AS "medicineName",
        COALESCE(NULLIF(p.product_category, ''), 'General') AS category,
        COALESCE(ls.stock_qty, 0)::int AS quantity,
        sx.last_sale_date
      FROM product p
      LEFT JOIN live_stock ls
        ON ls.product_id = p.product_id
      LEFT JOIN last_sales sx
        ON sx.product_id = p.product_id
      WHERE COALESCE(p.product_status, 1) = 1
        AND COALESCE(ls.stock_qty, 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM invoice_report ir2
          INNER JOIN invoice i2
            ON i2.invoice_id = ir2.invoice_id
          WHERE ir2.product_id = p.product_id
            AND ir2.status = 1
            AND i2.status = 1
            AND i2.created_at >=
                NOW() - (:days * INTERVAL '1 day')
        )
      ORDER BY
        COALESCE(ls.stock_qty, 0) DESC,
        p.product_title ASC
      LIMIT :limit
    `, {
      replacements: {
        days,
        limit
      },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: slowMovers.map(row => ({
        ...row,
        quantity: Number(row.quantity || 0),
        daysNoSales: row.last_sale_date
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(row.last_sale_date).getTime()) /
                (1000 * 60 * 60 * 24)
              )
            )
          : days
      }))
    });

  } catch (error) {
    console.error("Slow movers error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch slow movers",
      error: error.message
    });
  }
};

// AI Recommendations
exports.getRecommendations = async (req, res) => {
  try {
    const rawDays = Number.parseInt(req.query.days, 10);

    const days =
      Number.isFinite(rawDays) && rawDays > 0
        ? Math.min(rawDays, 3650)
        : 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const recommendations = [];

    /*
     * Real current stock is derived from stock_history.
     * No synthetic product_stock_qty field is used.
     */
    const lowStockBestSellers = await sequelize.query(`
      WITH live_stock AS (
        SELECT
          product_id,
          COALESCE(SUM(remaining_quantity), 0)::int AS stock_qty
        FROM stock_history
        WHERE status = 1
        GROUP BY product_id
      )
      SELECT
        p.product_id,
        p.product_title,
        COALESCE(ls.stock_qty, 0)::int AS stock_qty,
        COALESCE(SUM(ir.quantity), 0)::int AS sold_qty
      FROM product p
      INNER JOIN invoice_report ir
        ON ir.product_id = p.product_id
       AND ir.status = 1
      INNER JOIN invoice i
        ON i.invoice_id = ir.invoice_id
       AND i.status = 1
      LEFT JOIN live_stock ls
        ON ls.product_id = p.product_id
      WHERE i.created_at >= :startDate
        AND COALESCE(p.product_status, 1) = 1
        AND COALESCE(ls.stock_qty, 0) < 10
      GROUP BY
        p.product_id,
        p.product_title,
        ls.stock_qty
      HAVING COALESCE(SUM(ir.quantity), 0) > 5
      ORDER BY
        SUM(ir.quantity) DESC
      LIMIT 1
    `, {
      replacements: {
        startDate: startDate.toISOString()
      },
      type: sequelize.QueryTypes.SELECT
    });

    if (lowStockBestSellers.length > 0) {
      const item = lowStockBestSellers[0];

      recommendations.push({
        priority: "high",
        title: `Restock ${item.product_title}`,
        description:
          `${Number(item.stock_qty || 0)} units currently available; ` +
          `${Number(item.sold_qty || 0)} units sold in the last ${days} days.`
      });
    }

    const slowMoversHighStock = await sequelize.query(`
      WITH live_stock AS (
        SELECT
          product_id,
          COALESCE(SUM(remaining_quantity), 0)::int AS stock_qty
        FROM stock_history
        WHERE status = 1
        GROUP BY product_id
      )
      SELECT
        p.product_id,
        p.product_title,
        COALESCE(ls.stock_qty, 0)::int AS stock_qty
      FROM product p
      INNER JOIN live_stock ls
        ON ls.product_id = p.product_id
      WHERE COALESCE(p.product_status, 1) = 1
        AND COALESCE(ls.stock_qty, 0) > 50
        AND NOT EXISTS (
          SELECT 1
          FROM invoice_report ir
          INNER JOIN invoice i
            ON i.invoice_id = ir.invoice_id
          WHERE ir.product_id = p.product_id
            AND ir.status = 1
            AND i.status = 1
            AND i.created_at >=
                NOW() - (:days * INTERVAL '1 day')
        )
      ORDER BY
        ls.stock_qty DESC,
        p.product_title ASC
      LIMIT 1
    `, {
      replacements: { days },
      type: sequelize.QueryTypes.SELECT
    });

    if (slowMoversHighStock.length > 0) {
      const item = slowMoversHighStock[0];

      recommendations.push({
        priority: "medium",
        title: `Consider promotion for ${item.product_title}`,
        description:
          `${Number(item.stock_qty || 0)} units in stock with no sales during the last ${days} days.`
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        priority: "low",
        title: "Inventory is balanced",
        description:
          "No high-stock slow mover or low-stock high-selling product was detected for the selected period."
      });
    }

    res.json({
      success: true,
      data: recommendations
    });

  } catch (error) {
    console.error("Recommendations error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to generate recommendations",
      error: error.message
    });
  }
};


module.exports = exports;
