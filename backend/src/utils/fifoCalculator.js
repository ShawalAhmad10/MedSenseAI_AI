/**
 * FIFO (First-In-First-Out) Profit Calculator for Pharmacy
 * Uses oldest stock batch costs first for accurate profit calculation
 */

const { sequelize } = require('../config/database');

/**
 * Calculate FIFO-based profit for order items
 * @param {Array} orderItems - Array of {product_id, quantity, sale_price}
 * @returns {Object} - {totalProfit, totalCost, itemDetails: [{product_id, profit, cost, batchesUsed}]}
 */
async function calculateFIFOProfit(orderItems) {
  try {
    const results = {
      totalProfit: 0,
      totalCost: 0,
      totalRevenue: 0,
      itemDetails: []
    };

    for (const item of orderItems) {
      const { product_id, quantity, sale_price } = item;
      
      // Get available stock stock_history for this product (FIFO order - oldest first)
      const stock_history = await sequelize.query(
        `SELECT 
            b.batch_id,
            b.batch_number,
            b.product_price as purchase_price,
            b.product_quantity,
            b.remaining_quantity,
            b.created_at
          FROM stock_history b
          WHERE b.product_id = :product_id
          AND b.status = 1
          AND b.batch_status = 'ACTIVE'
          AND b.remaining_quantity > 0
        ORDER BY b.created_at ASC, b.batch_id ASC`,
        {
          replacements: { product_id },
          type: sequelize.QueryTypes.SELECT
        }
      );

      if (stock_history.length === 0) {
        // No stock stock_history found - use average cost
        const avgCost = await getAverageProductCost(product_id);
        const itemCost = avgCost * quantity;
        const itemRevenue = sale_price * quantity;
        const itemProfit = itemRevenue - itemCost;

        results.itemDetails.push({
          product_id,
          quantity,
          sale_price,
          average_cost: avgCost,
          total_cost: itemCost,
          total_revenue: itemRevenue,
          profit: itemProfit,
          profit_margin: itemRevenue > 0 ? ((itemProfit / itemRevenue) * 100).toFixed(2) : 0,
          batchesUsed: [],
          warning: 'No FIFO stock_history available, used average cost'
        });

        results.totalCost += itemCost;
        results.totalRevenue += itemRevenue;
        results.totalProfit += itemProfit;
        continue;
      }

      // FIFO calculation - use oldest stock_history first
      let remainingQty = quantity;
      let totalItemCost = 0;
      const batchesUsed = [];

      for (const batch of stock_history) {
        if (remainingQty <= 0) break;

        const batchQty = Math.min(remainingQty, batch.remaining_quantity);
        const batchCost = batchQty * batch.purchase_price;
        
        totalItemCost += batchCost;
        remainingQty -= batchQty;

        batchesUsed.push({
          batch_number: batch.batch_number,
          quantity_used: batchQty,
          unit_cost: batch.purchase_price,
          total_cost: batchCost
        });
      }

      const itemRevenue = sale_price * quantity;
      const itemProfit = itemRevenue - totalItemCost;
      const avgUnitCost = totalItemCost / quantity;

      results.itemDetails.push({
        product_id,
        quantity,
        sale_price,
        average_unit_cost: avgUnitCost,
        total_cost: totalItemCost,
        total_revenue: itemRevenue,
        profit: itemProfit,
        profit_margin: itemRevenue > 0 ? ((itemProfit / itemRevenue) * 100).toFixed(2) : 0,
        batchesUsed
      });

      results.totalCost += totalItemCost;
      results.totalRevenue += itemRevenue;
      results.totalProfit += itemProfit;
    }

    // Calculate overall profit margin
    results.profitMargin = results.totalRevenue > 0 
      ? ((results.totalProfit / results.totalRevenue) * 100).toFixed(2) 
      : 0;

    return results;

  } catch (error) {
    console.error('FIFO calculation error:', error);
    throw error;
  }
}

/**
 * Get average purchase cost for a product (fallback when no FIFO stock_history)
 */
async function getAverageProductCost(product_id) {
  try {
    const [result] = await sequelize.query(
      `SELECT AVG(product_price) as avg_cost
       FROM stock_history
       WHERE product_id = :product_id
       AND status = 1
       AND product_price > 0`,
      {
        replacements: { product_id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    return result && result.avg_cost ? parseFloat(result.avg_cost) : 0;
  } catch (error) {
    console.error('Error getting average cost:', error);
    return 0;
  }
}

/**
 * Calculate discount amount based on type
 * @param {number} amount - Base amount
 * @param {number} discount - Discount value
 * @param {string} discountType - 'percentage' or 'fixed'
 * @returns {number} - Discount amount
 */
function calculateDiscountAmount(amount, discount, discountType = 'fixed') {
  if (!discount || discount <= 0) return 0;
  
  if (discountType === 'percentage') {
    return (amount * discount) / 100;
  }
  
  return discount; // fixed amount
}

/**
 * Apply discount to amount
 * @param {number} amount - Base amount
 * @param {number} discount - Discount value
 * @param {string} discountType - 'percentage' or 'fixed'
 * @returns {number} - Amount after discount
 */
function applyDiscount(amount, discount, discountType = 'fixed') {
  const discountAmount = calculateDiscountAmount(amount, discount, discountType);
  return Math.max(0, amount - discountAmount);
}

module.exports = {
  calculateFIFOProfit,
  getAverageProductCost,
  calculateDiscountAmount,
  applyDiscount
};
