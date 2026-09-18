const express = require('express');
const router = express.Router();
const funnelController = require('../controllers/funnelController');
const { optionalCustomerToken } = require('../middleware/customerAuth');
const { authenticateToken } = require('../middleware/auth');

router.post('/events', optionalCustomerToken, funnelController.captureEvent);
router.get('/metrics', authenticateToken, funnelController.getMetrics);

module.exports = router;