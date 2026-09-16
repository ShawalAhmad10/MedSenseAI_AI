// Alert Routes

const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const { authenticateToken } = require('../middleware/auth');

// Get all alerts
router.get('/all', authenticateToken, alertController.getAlerts);

// Get dashboard summary
router.get('/summary', authenticateToken, alertController.getDashboardSummary);

module.exports = router;
