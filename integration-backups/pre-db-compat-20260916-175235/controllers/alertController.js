// Alert Controller - Low Stock & Expiry Alerts

const { sequelize } = require('../config/database');

// Get all alerts (low stock + expiry)
exports.getAlerts = async (req, res) => {
  try {
    const alerts = [];
    
    // 1. LOW STOCK ALERTS — use stock_history dynamic qty
    const lowStockProducts = await sequelize.query(
      `SELECT p.product_id, p.product_title,
              COALESCE(SUM(sh.remaining_quantity),0) AS stock_qty,
              p.product_min_threshold,
              s.supplier_name
       FROM product p
       LEFT JOIN supplier_info s ON p.product_supplier = s.supplier_id
       LEFT JOIN stock_history sh ON sh.product_id = p.product_id AND sh.status = 1
       WHERE p.product_status = 1
       GROUP BY p.product_id, p.product_title, p.product_min_threshold, s.supplier_name
       HAVING COALESCE(SUM(sh.remaining_quantity),0) <= p.product_min_threshold
          AND COALESCE(SUM(sh.remaining_quantity),0) > 0
       ORDER BY stock_qty ASC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    lowStockProducts.forEach(product => {
      alerts.push({
        type: 'low_stock',
        severity: 'warning',
        productId: product.product_id,
        productName: product.product_title,
        currentStock: product.stock_qty,
        minThreshold: product.product_min_threshold,
        supplier: product.supplier_name,
        message: `${product.product_title} is running low (${product.stock_qty} units remaining)`
      });
    });

    // OUT OF STOCK ALERTS
    const outOfStockProducts = await sequelize.query(
      `SELECT p.product_id, p.product_title, p.product_min_threshold, s.supplier_name
       FROM product p
       LEFT JOIN supplier_info s ON p.product_supplier = s.supplier_id
       LEFT JOIN stock_history sh ON sh.product_id = p.product_id AND sh.status = 1
       WHERE p.product_status = 1
       GROUP BY p.product_id, p.product_title, p.product_min_threshold, s.supplier_name
       HAVING COALESCE(SUM(sh.remaining_quantity),0) = 0
       ORDER BY p.product_title ASC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    outOfStockProducts.forEach(product => {
      alerts.push({
        type: 'out_of_stock',
        severity: 'critical',
        productId: product.product_id,
        productName: product.product_title,
        currentStock: 0,
        minThreshold: product.product_min_threshold,
        supplier: product.supplier_name,
        message: `${product.product_title} is OUT OF STOCK`
      });
    });

    // 2. EXPIRY ALERTS
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringBatches = await sequelize.query(
      `SELECT b.batch_id, b.product_title, b.batch_number, b.expiry_date,
              b.remaining_quantity, s.stock_id, s.bill_no
       FROM stock_history b
       INNER JOIN stock s ON b.stock_id = s.stock_id
       WHERE b.expiry_date IS NOT NULL 
       AND b.expiry_date <= :thirtyDays
       AND b.expiry_date >= CURRENT_DATE
       AND b.batch_status = 'ACTIVE'
       ORDER BY b.expiry_date ASC`,
      { 
        replacements: { thirtyDays: thirtyDaysFromNow.toISOString().split('T')[0] },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    expiringBatches.forEach(batch => {
      const daysUntilExpiry = Math.ceil((new Date(batch.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
      alerts.push({
        type: 'expiring_soon',
        severity: daysUntilExpiry <= 7 ? 'critical' : 'warning',
        productName: batch.product_title,
        batchNumber: batch.batch_number,
        billNumber: batch.bill_no,
        stockId: `STK-${batch.stock_id}`,
        expiryDate: batch.expiry_date,
        quantity: batch.remaining_quantity,
        daysRemaining: daysUntilExpiry,
        message: `StockHistory ${batch.batch_number} expires in ${daysUntilExpiry} days`
      });
    });

    // EXPIRED BATCHES
    const expiredBatches = await sequelize.query(
      `SELECT b.batch_id, b.product_title, b.batch_number, b.expiry_date,
              b.remaining_quantity, s.stock_id, s.bill_no
       FROM stock_history b
       INNER JOIN stock s ON b.stock_id = s.stock_id
       WHERE b.expiry_date IS NOT NULL 
       AND b.expiry_date < CURRENT_DATE
       AND b.batch_status = 'ACTIVE'
       ORDER BY b.expiry_date DESC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    expiredBatches.forEach(batch => {
      alerts.push({
        type: 'expired',
        severity: 'critical',
        productName: batch.product_title,
        batchNumber: batch.batch_number,
        billNumber: batch.bill_no,
        stockId: `STK-${batch.stock_id}`,
        expiryDate: batch.expiry_date,
        quantity: batch.remaining_quantity,
        message: `StockHistory ${batch.batch_number} has EXPIRED`
      });
    });

    res.json({
      success: true,
      data: {
        alerts,
        summary: {
          total: alerts.length,
          critical: alerts.filter(a => a.severity === 'critical').length,
          warning: alerts.filter(a => a.severity === 'warning').length,
          lowStock: lowStockProducts.length,
          outOfStock: outOfStockProducts.length,
          expiringSoon: expiringBatches.length,
          expired: expiredBatches.length
        }
      }
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alerts',
      error: error.message
    });
  }
};

// Get dashboard summary (for quick widget)
exports.getDashboardSummary = async (req, res) => {
  try {
    // Low stock count
    const lowStockCount = await sequelize.query(
      `SELECT COUNT(*) as count FROM (
        SELECT p.product_id, COALESCE(SUM(sh.remaining_quantity),0) AS qty, p.product_min_threshold
        FROM product p
        LEFT JOIN stock_history sh ON sh.product_id = p.product_id AND sh.status=1
        WHERE p.product_status=1
        GROUP BY p.product_id, p.product_min_threshold
        HAVING COALESCE(SUM(sh.remaining_quantity),0) <= p.product_min_threshold
           AND COALESCE(SUM(sh.remaining_quantity),0) > 0
      ) t`,
      { type: sequelize.QueryTypes.SELECT }
    );

    // Out of stock count
    const outOfStockCount = await sequelize.query(
      `SELECT COUNT(*) as count FROM (
        SELECT p.product_id, COALESCE(SUM(sh.remaining_quantity),0) AS qty
        FROM product p
        LEFT JOIN stock_history sh ON sh.product_id = p.product_id AND sh.status=1
        WHERE p.product_status=1
        GROUP BY p.product_id
        HAVING COALESCE(SUM(sh.remaining_quantity),0) = 0
      ) t`,
      { type: sequelize.QueryTypes.SELECT }
    );

    // Expiring soon count (30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringSoonCount = await sequelize.query(
      `SELECT COUNT(*) as count FROM stock_history 
       WHERE expiry_date IS NOT NULL 
       AND expiry_date <= :thirtyDays
       AND expiry_date >= CURRENT_DATE
       AND batch_status = 'ACTIVE'`,
      { 
        replacements: { thirtyDays: thirtyDaysFromNow.toISOString().split('T')[0] },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    // Expired count
    const expiredCount = await sequelize.query(
      `SELECT COUNT(*) as count FROM stock_history 
       WHERE expiry_date IS NOT NULL 
       AND expiry_date < CURRENT_DATE
       AND batch_status = 'ACTIVE'`,
      { type: sequelize.QueryTypes.SELECT }
    );

    res.json({
      success: true,
      data: {
        lowStock: parseInt(lowStockCount[0].count),
        outOfStock: parseInt(outOfStockCount[0].count),
        expiringSoon: parseInt(expiringSoonCount[0].count),
        expired: parseInt(expiredCount[0].count),
        totalAlerts: parseInt(lowStockCount[0].count) + parseInt(outOfStockCount[0].count) + 
                     parseInt(expiringSoonCount[0].count) + parseInt(expiredCount[0].count)
      }
    });
  } catch (error) {
    console.error('Get dashboard summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard summary',
      error: error.message
    });
  }
};

module.exports = exports;
