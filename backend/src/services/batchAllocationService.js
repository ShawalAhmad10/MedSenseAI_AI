/**
 * FIFO/FEFO StockHistory Allocation Service
 * 
 * Handles automatic batch selection and deduction using:
 * - FEFO (First Expired First Out) - Nearest expiry first
 * - FIFO (First In First Out) - Oldest batch first
 */

const { Op } = require('sequelize');
const StockHistory = require('../models/StockHistory');
const StockReport = require('../models/StockReport');
const { sequelize } = require('../config/database');

class BatchAllocationService {
  /**
   * Allocate stock_history for a sale using FIFO/FEFO logic
   * @param {number} productId - Product ID
   * @param {number} requestedQty - Quantity requested
   * @returns {Promise<Array>} Array of batch allocations
   * @throws {Error} If insufficient stock or all stock_history expired
   */
  static async allocateBatchesForSale(
    productId,
    requestedQty,
    transaction
  ) {
    if (!transaction) {
      const error =
        new Error(
          'Sale stock allocation requires an active transaction'
        );

      error.code =
        'STOCK_ALLOCATION_TRANSACTION_REQUIRED';

      throw error;
    }

    // Lock available batches inside the sale transaction.
    // The locks remain held until commit/rollback.
    // Get available stock_history sorted by FEFO then FIFO
    const stock_history = await StockHistory.findAll({
      where: {
        product_id: productId,
        batch_status: 'ACTIVE',
        remaining_quantity: { [Op.gt]: 0 },
        expiry_date: { [Op.gte]: new Date() } // Exclude expired
      },
      order: [
        ['expiry_date', 'ASC'],   // Nearest expiry first (FEFO)
        ['created_at', 'ASC'],     // Older batch first (FIFO)
        ['batch_number', 'ASC']    // Tiebreaker
      ],
      transaction,
      lock: true
    });

    if (stock_history.length === 0) {
      throw new Error('Product out of stock or all stock_history expired');
    }

    const allocations = [];
    let remainingQty = requestedQty;
    let totalAvailable = stock_history.reduce((sum, b) => sum + b.remaining_quantity, 0);

    if (totalAvailable < requestedQty) {
      throw new Error(
        `Insufficient stock. Available: ${totalAvailable}, Requested: ${requestedQty}`
      );
    }

    for (const batch of stock_history) {
      if (remainingQty <= 0) break;

      const qtyToDeduct = Math.min(batch.remaining_quantity, remainingQty);

      allocations.push({
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        quantity: qtyToDeduct,
        purchase_cost: batch.product_price,
        sale_price: batch.sale_price,
        expiry_date: batch.expiry_date,
        remaining_in_batch: batch.remaining_quantity - qtyToDeduct
      });

      remainingQty -= qtyToDeduct;
    }

    return allocations;
  }

  /**
   * Deduct quantities from allocated stock_history and create ledger entries
   * @param {Array} allocations - Array of batch allocations
   * @param {Object} referenceData - Invoice/transaction reference data
   * @param {Object} transaction - Sequelize transaction
   * @returns {Promise<void>}
   */
  static async deductBatches(allocations, referenceData, transaction) {
    for (const alloc of allocations) {
      // Update batch quantity
      const batch =
        await StockHistory.findByPk(
          alloc.batch_id,
          {
            transaction,
            lock: true
          }
        );
      
      if (!batch) {
        throw new Error(`StockHistory ${alloc.batch_id} not found`);
      }

      const newQuantity = batch.remaining_quantity - alloc.quantity;
      
      if (newQuantity < 0) {
        throw new Error(`Insufficient quantity in batch ${batch.batch_number}`);
      }

      await batch.update(
        { 
          remaining_quantity: newQuantity,
          batch_status: newQuantity === 0 ? 'FINISHED' : batch.batch_status
        },
        { transaction }
      );

      // Create ledger entry
      await StockReport.createEntry({
        batch_id: batch.batch_id,
        product_id: batch.product_id,
        transaction_type: 'SALE',
        quantity_change: -alloc.quantity,
        balance_after: newQuantity,
        reference_type: referenceData.type || 'INVOICE',
        reference_id: referenceData.id,
        reference_number: referenceData.number,
        unit_price: alloc.sale_price,
        total_value: alloc.quantity * alloc.sale_price,
        performed_by: referenceData.performed_by || 'SYSTEM',
        transaction_date: new Date()
      }, transaction);
    }
  }

  /**
   * Check available stock for a product
   * @param {number} productId - Product ID
   * @returns {Promise<Object>} Stock information
   */
  static async checkAvailableStock(productId) {
    const stock_history = await StockHistory.findAll({
      where: {
        product_id: productId,
        batch_status: 'ACTIVE',
        remaining_quantity: { [Op.gt]: 0 },
        expiry_date: { [Op.gte]: new Date() }
      },
      order: [['expiry_date', 'ASC'], ['created_at', 'ASC']]
    });

    const totalQty = stock_history.reduce((sum, b) => sum + b.remaining_quantity, 0);
    const nearestExpiry = stock_history.length > 0 ? stock_history[0].expiry_date : null;

    return {
      available: totalQty,
      batch_count: stock_history.length,
      nearest_expiry: nearestExpiry,
      stock_history: stock_history.map(b => ({
        batch_id: b.batch_id,
        batch_number: b.batch_number,
        quantity: b.remaining_quantity,
        expiry_date: b.expiry_date,
        purchase_cost: b.product_price,
        sale_price: b.sale_price
      }))
    };
  }

  /**
   * Get product stock summary from view
   * @param {number} productId - Product ID (optional)
   * @returns {Promise<Array>} Stock summary
   */
  static async getProductStockSummary(productId = null) {
    let query = 'SELECT * FROM product_current_stock';
    
    if (productId) {
      query += ` WHERE product_id = ${productId}`;
    }
    
    query += ' ORDER BY product_title';

    const [results] = await sequelize.query(query);
    return results;
  }

  /**
   * Get expiring stock_history for alerts
   * @param {number} daysThreshold - Days until expiry (default 30)
   * @returns {Promise<Array>} Expiring stock_history
   */
  static async getExpiringBatches(daysThreshold = 30) {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + daysThreshold);

    const stock_history = await StockHistory.findAll({
      where: {
        batch_status: 'ACTIVE',
        remaining_quantity: { [Op.gt]: 0 },
        expiry_date: {
          [Op.gte]: today,
          [Op.lte]: futureDate
        }
      },
      order: [['expiry_date', 'ASC']],
      include: [{
        model: require('../models/Product'),
        as: 'product',
        attributes: ['product_id', 'product_title', 'product_generic_name']
      }]
    });

    return stock_history.map(batch => {
      const daysLeft = Math.ceil(
        (new Date(batch.expiry_date) - today) / (1000 * 60 * 60 * 24)
      );

      return {
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        product_id: batch.product_id,
        product_name: batch.product_title,
        quantity: batch.remaining_quantity,
        expiry_date: batch.expiry_date,
        days_left: daysLeft,
        value: batch.remaining_quantity * batch.product_price,
        alert_level: daysLeft <= 7 ? 'CRITICAL' : 'WARNING'
      };
    });
  }

  /**
   * Process batch return (for customer returns)
   * @param {number} batchId - Original batch ID
   * @param {number} quantity - Quantity being returned
   * @param {Object} referenceData - Return reference data
   * @param {Object} transaction - Sequelize transaction
   * @returns {Promise<Object>} Quarantine batch created
   */
  static async processBatchReturn(batchId, quantity, referenceData, transaction) {
    const originalBatch = await StockHistory.findByPk(batchId, { transaction });
    
    if (!originalBatch) {
      throw new Error('Original batch not found');
    }

    // Create quarantine batch
    const quarantineBatch = await StockHistory.create({
      stock_id: originalBatch.stock_id,
      product_id: originalBatch.product_id,
      product_title: originalBatch.product_title,
      batch_number: `${originalBatch.batch_number}-RET`,
      initial_quantity: quantity,
      remaining_quantity: quantity,
      product_quantity: quantity,
      product_bonus: 0,
      product_price: originalBatch.product_price,
      sale_price: originalBatch.sale_price,
      expiry_date: originalBatch.expiry_date,
      batch_status: 'QUARANTINE',
      status: 1,
      created_at: new Date()
    }, { transaction });

    // Create ledger entry
    await StockReport.createEntry({
      batch_id: quarantineBatch.batch_id,
      product_id: originalBatch.product_id,
      transaction_type: 'RETURN',
      quantity_change: quantity,
      balance_after: quantity,
      reference_type: referenceData.type || 'INVOICE',
      reference_id: referenceData.id,
      reference_number: referenceData.number,
      notes: `Return from batch ${originalBatch.batch_number}`,
      performed_by: referenceData.performed_by || 'SYSTEM',
      transaction_date: new Date()
    }, transaction);

    return quarantineBatch;
  }

  /**
   * Mark expired stock_history (for daily cron)
   * @returns {Promise<Object>} Results
   */
  static async markExpiredBatches() {
    const transaction = await sequelize.transaction();
    
    try {
      const today = new Date();
      
      // Find stock_history that expired
      const expiredBatches = await StockHistory.findAll({
        where: {
          batch_status: 'ACTIVE',
          expiry_date: { [Op.lt]: today }
        },
        transaction
      });

      let count = 0;
      
      for (const batch of expiredBatches) {
        // Update status
        await batch.update({ batch_status: 'EXPIRED' }, { transaction });
        
        // Create ledger entry
        await StockReport.createEntry({
          batch_id: batch.batch_id,
          product_id: batch.product_id,
          transaction_type: 'EXPIRED',
          quantity_change: 0,
          balance_after: batch.remaining_quantity,
          reference_type: 'SYSTEM',
          notes: `StockHistory expired on ${batch.expiry_date}`,
          performed_by: 'SYSTEM_CRON',
          transaction_date: new Date()
        }, transaction);
        
        count++;
      }

      await transaction.commit();
      
      return {
        success: true,
        expired_count: count,
        expired_batches: expiredBatches.map(b => ({
          batch_id: b.batch_id,
          batch_number: b.batch_number,
          product_name: b.product_title,
          quantity: b.remaining_quantity
        }))
      };
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = BatchAllocationService;
