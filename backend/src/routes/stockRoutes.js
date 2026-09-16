const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');

// Stock StockHistory Routes
router.post('/batch', stockController.createStockBatch);
router.get('/batch', stockController.listStockBatches);
router.get('/batch/:id', stockController.getStockBatch);
router.put('/batch/:id', stockController.updateStockBatch);
router.delete('/batch/:id', stockController.deleteStockBatch);

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
