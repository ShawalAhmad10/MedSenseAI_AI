// Report Controller - Profit/Loss & StockHistory Reports

const { sequelize } = require('../config/database');

// Profit & Loss Report with FIFO
exports.getProfitLossReport = async (req, res) => {
  try {
    const { startDate, endDate, productId, supplierId, period } = req.query;

    // Build date range
    let start, end;
    const now = new Date();
    
    if (period === 'today') {
      start = end = now.toISOString().split('T')[0];
    } else if (period === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      start = weekAgo.toISOString().split('T')[0];
      end = new Date().toISOString().split('T')[0];
    } else if (period === 'month') {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      start = monthAgo.toISOString().split('T')[0];
      end = new Date().toISOString().split('T')[0];
    } else {
      const defaultStart = new Date(now);
      defaultStart.setDate(defaultStart.getDate() - 30);
      start = startDate || defaultStart.toISOString().split('T')[0];
      end = endDate || new Date().toISOString().split('T')[0];
    }

    // Get all sales from stock_report (SALE transactions)
    const salesQuery = `
      SELECT 
        sl.ledger_id,
        sl.batch_id,
        sl.product_id,
        sl.quantity_change,
        sl.unit_price as sale_price,
        sl.total_value as sale_amount,
        sl.transaction_date,
        sl.reference_number,
        b.product_price as cost_price,
        b.batch_number,
        p.product_title,
        p.product_supplier as supplier_id,
        s.supplier_name
      FROM stock_report sl
      INNER JOIN stock_history b ON sl.batch_id = b.batch_id
      INNER JOIN product p ON sl.product_id = p.product_id
      LEFT JOIN supplier_info s ON p.product_supplier = s.supplier_id
      WHERE sl.transaction_type = 'SALE'
        AND DATE(sl.transaction_date) >= :startDate 
        AND DATE(sl.transaction_date) <= :endDate
        ${productId ? 'AND sl.product_id = :productId' : ''}
        ${supplierId ? 'AND p.product_supplier = :supplierId' : ''}
      ORDER BY sl.transaction_date ASC, sl.ledger_id ASC
    `;

    const sales = await sequelize.query(salesQuery, {
      replacements: { startDate: start, endDate: end, productId, supplierId },
      type: sequelize.QueryTypes.SELECT
    });

    let totalRevenue = 0;
    let totalCost = 0;
    const productBreakdown = {};

    // Calculate profit from ledger entries (already FIFO allocated)
    for (const sale of sales) {
      const quantity = Math.abs(Number(sale.quantity_change)); // quantity_change is negative for sales
      const salePrice = Number(sale.sale_price) || 0;
      const costPrice = Number(sale.cost_price) || 0;
      
      const saleRevenue = quantity * salePrice;
      const saleCost = quantity * costPrice;
      
      totalRevenue += saleRevenue;
      totalCost += saleCost;

      // Product breakdown
      const productKey = `${sale.product_id}`;
      if (!productBreakdown[productKey]) {
        productBreakdown[productKey] = {
          productId: sale.product_id,
          productName: sale.product_title,
          supplier: sale.supplier_name || '-',
          totalRevenue: 0,
          totalCost: 0,
          totalProfit: 0,
          totalQuantity: 0,
          profitMargin: 0
        };
      }

      productBreakdown[productKey].totalRevenue += saleRevenue;
      productBreakdown[productKey].totalCost += saleCost;
      productBreakdown[productKey].totalQuantity += quantity;
    }

    // Calculate profit and margins
    const totalProfit = totalRevenue - totalCost;
    const overallMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0;

    // Calculate per-product metrics
    Object.values(productBreakdown).forEach(product => {
      product.totalProfit = product.totalRevenue - product.totalCost;
      product.profitMargin = product.totalRevenue > 0 
        ? ((product.totalProfit / product.totalRevenue) * 100).toFixed(2) 
        : 0;
    });

    res.json({
      success: true,
      data: {
        period: { start, end },
        summary: {
          totalRevenue: Number(totalRevenue.toFixed(2)),
          totalCost: Number(totalCost.toFixed(2)),
          grossProfit: Number(totalProfit.toFixed(2)),
          profitMargin: Number(overallMargin),
          totalTransactions: sales.length
        },
        productBreakdown: Object.values(productBreakdown).sort((a, b) => b.totalProfit - a.totalProfit)
      }
    });

  } catch (error) {
    console.error('Profit/Loss report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate profit/loss report',
      error: error.message
    });
  }
};

// StockHistory-wise Stock Report
exports.getBatchWiseReport = async (req, res) => {
  try {
    const { productId, supplierId, expiryFrom, expiryTo, status } = req.query;

    let whereConditions = ['b.status = 1']; // Only active records
    let replacements = {};

    if (productId) {
      whereConditions.push('b.product_id = :productId');
      replacements.productId = productId;
    }
    if (supplierId) {
      whereConditions.push('p.product_supplier = :supplierId');
      replacements.supplierId = supplierId;
    }
    if (expiryFrom) {
      whereConditions.push('b.expiry_date >= :expiryFrom');
      replacements.expiryFrom = expiryFrom;
    }
    if (expiryTo) {
      whereConditions.push('b.expiry_date <= :expiryTo');
      replacements.expiryTo = expiryTo;
    }
    if (status) {
      whereConditions.push('b.batch_status = :batchStatus');
      replacements.batchStatus = status.toUpperCase();
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get batch data from new stock_history table
    const batchesQuery = `
      SELECT 
        b.batch_id,
        b.batch_number,
        b.stock_id,
        s.bill_no,
        si.supplier_name,
        b.product_id,
        b.product_title,
        b.initial_quantity as qty_in,
        b.remaining_quantity as qty_remaining,
        (b.initial_quantity - b.remaining_quantity) as qty_sold,
        b.expiry_date,
        b.product_price as cost_price,
        b.sale_price,
        b.batch_status,
        b.created_at as creation_day,
        b.product_bale,
        b.product_bale_size
      FROM stock_history b
      INNER JOIN product p ON b.product_id = p.product_id
      LEFT JOIN stock s ON b.stock_id = s.stock_id
      LEFT JOIN supplier_info si ON s.supplier_id = si.supplier_id
      ${whereClause}
      ORDER BY b.created_at DESC, b.batch_id DESC
    `;

    const stock_history = await sequelize.query(batchesQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // Add status flags for frontend
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    stock_history.forEach(batch => {
      // Determine display status based on batch_status and expiry
      if (batch.batch_status === 'FINISHED' || batch.qty_remaining === 0) {
        batch.status = 'sold_out';
      } else if (batch.batch_status === 'EXPIRED') {
        batch.status = 'expired';
      } else if (batch.batch_status === 'QUARANTINE') {
        batch.status = 'quarantine';
      } else if (batch.batch_status === 'DISPOSED') {
        batch.status = 'disposed';
      } else if (batch.expiry_date) {
        const expiryDate = new Date(batch.expiry_date);
        if (expiryDate < now) {
          batch.status = 'expired';
        } else if (expiryDate <= thirtyDaysFromNow) {
          batch.status = 'expiring_soon';
        } else {
          batch.status = 'active';
        }
      } else {
        batch.status = 'active';
      }

      batch.stockNumber = batch.stock_id ? `STK-${batch.stock_id}` : 'OPENING';
      
      // Convert numeric values
      batch.qty_in = Number(batch.qty_in) || 0;
      batch.qty_remaining = Number(batch.qty_remaining) || 0;
      batch.qty_sold = Number(batch.qty_sold) || 0;
      batch.cost_price = Number(batch.cost_price) || 0;
      batch.sale_price = Number(batch.sale_price) || 0;
    });

    // Calculate summary
    const summary = {
      totalBatches: stock_history.length,
      activeBatches: stock_history.filter(b => b.status === 'active').length,
      expiringSoon: stock_history.filter(b => b.status === 'expiring_soon').length,
      expired: stock_history.filter(b => b.status === 'expired').length,
      soldOut: stock_history.filter(b => b.status === 'sold_out').length,
      quarantine: stock_history.filter(b => b.status === 'quarantine').length,
      disposed: stock_history.filter(b => b.status === 'disposed').length,
      totalQtyIn: stock_history.reduce((sum, b) => sum + b.qty_in, 0),
      totalQtyRemaining: stock_history.reduce((sum, b) => sum + b.qty_remaining, 0),
      totalQtySold: stock_history.reduce((sum, b) => sum + b.qty_sold, 0)
    };

    res.json({
      success: true,
      data: {
        stock_history,
        summary
      }
    });

  } catch (error) {
    console.error('StockHistory-wise report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate batch-wise report',
      error: error.message
    });
  }
};

module.exports = exports;
