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
    const { days = 30, limit = 6 } = req.query;

    // Get products with no sales in the period
    const slowMovers = await sequelize.query(`
      SELECT 
        p.product_id as "medicineId",
        p.product_title as "medicineName",
        'General' as category,
        p.product_stock_qty as quantity,
        COALESCE(
          (SELECT MAX(i.created_at) 
           FROM invoice i
           INNER JOIN invoice_report ii ON i.invoice_id = ii.invoice_id
           WHERE ii.product_id = p.product_id),
          p.created_at
        ) as last_sale_date
      FROM product p
      WHERE p.product_stock_qty > 0
        AND NOT EXISTS (
          SELECT 1 FROM invoice_report ii
          INNER JOIN invoice i ON ii.invoice_id = i.invoice_id
          WHERE ii.product_id = p.product_id
            AND i.created_at >= NOW() - INTERVAL ':days days'
        )
      ORDER BY p.product_stock_qty DESC
      LIMIT :limit
    `.replace(':days', days), {
      replacements: { limit: parseInt(limit) },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: slowMovers.map(s => ({
        ...s,
        quantity: parseInt(s.quantity),
        daysNoSales: Math.floor((new Date() - new Date(s.last_sale_date)) / (1000 * 60 * 60 * 24))
      }))
    });
  } catch (error) {
    console.error('Slow movers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch slow movers',
      error: error.message
    });
  }
};

// AI Recommendations
exports.getRecommendations = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const recommendations = [];

    // Check for low stock best sellers
    const lowStockBestSellers = await sequelize.query(`
      SELECT p.product_title, p.product_stock_qty, SUM(ii.quantity) as sold_qty
      FROM product p
      INNER JOIN invoice_report ii ON p.product_id = ii.product_id
      INNER JOIN invoice i ON ii.invoice_id = i.invoice_id
      WHERE i.created_at >= :startDate AND p.product_stock_qty < 10
      GROUP BY p.product_id, p.product_title, p.product_stock_qty
      HAVING SUM(ii.quantity) > 5
      LIMIT 1
    `, {
      replacements: { startDate: startDate.toISOString() },
      type: sequelize.QueryTypes.SELECT
    });

    if (lowStockBestSellers.length > 0) {
      const item = lowStockBestSellers[0];
      recommendations.push({
        priority: 'high',
        title: `Restock ${item.product_title}`,
        description: `Only ${item.product_stock_qty} units left. Sold ${item.sold_qty} in last ${days} days.`
      });
    }

    // Check for slow movers with high stock
    const slowMoversHighStock = await sequelize.query(`
      SELECT p.product_title, p.product_stock_qty
      FROM product p
      WHERE p.product_stock_qty > 50
        AND NOT EXISTS (
          SELECT 1 FROM invoice_report ii
          INNER JOIN invoice i ON ii.invoice_id = i.invoice_id
          WHERE ii.product_id = p.product_id
            AND i.created_at >= NOW() - INTERVAL '${days} days'
        )
      LIMIT 1
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    if (slowMoversHighStock.length > 0) {
      const item = slowMoversHighStock[0];
      recommendations.push({
        priority: 'medium',
        title: `Consider promotion for ${item.product_title}`,
        description: `${item.product_stock_qty} units in stock with no recent sales.`
      });
    }

    // General recommendation
    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'low',
        title: 'Inventory is balanced',
        description: 'All products are selling at expected rates.'
      });
    }

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate recommendations',
      error: error.message
    });
  }
};

module.exports = exports;
