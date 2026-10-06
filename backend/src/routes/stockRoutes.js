const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const { authenticateToken } = require('../middleware/auth');
router.patch('/batch-items/:batchId/sale-price', authenticateToken, stockController.updateBatchSalePrice);
router.patch('/batch-items/:batchId/stock', authenticateToken, stockController.updateBatchStock);

// Stock StockHistory Routes
router.post('/batch', authenticateToken, stockController.createStockBatch);
router.get('/batch', authenticateToken, stockController.listStockBatches);
router.get('/batch/:id', authenticateToken, stockController.getStockBatch);
router.put('/batch/:id', authenticateToken, stockController.updateStockBatch);
router.delete('/batch/:id', authenticateToken, stockController.deleteStockBatch);

// All remaining inventory operations require authenticated staff.
router.use(authenticateToken);

// Stock Opening Routes
router.post('/opening', stockController.createStockOpening);
router.get('/opening', stockController.listStockOpenings);

// Stock Return Routes
router.post('/return', stockController.createStockReturn);
router.get('/return', stockController.listStockReturns);

// Alerts & Reports Routes
router.get('/alerts/low-stock', stockController.getLowStockAlerts);
router.get('/alerts/expiry', stockController.getExpiryAlerts);
router.get('/alerts/dashboard', stockController.getDashboardAlerts);
router.get('/reports/batch-wise',   stockController.getBatchWiseReport);
router.get('/reports/profit-loss',  stockController.getProfitLossReport);
router.get('/reports/stock-report', stockController.getStockReport);
router.get('/reports/return-report', stockController.getStockReturnReport);

module.exports = router;
