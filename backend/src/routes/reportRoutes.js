// Report Routes

const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');

// Profit & Loss Report
router.get('/profit-loss', authenticate, reportController.getProfitLossReport);

// StockHistory-wise Stock Report
router.get('/batch-wise', authenticate, reportController.getBatchWiseReport);

module.exports = router;
