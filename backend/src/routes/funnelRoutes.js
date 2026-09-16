const express = require('express');
const router = express.Router();
const funnelController = require('../controllers/funnelController');
const { optionalCustomerToken } = require('../middleware/customerAuth');

router.post('/events', optionalCustomerToken, funnelController.captureEvent);
router.get('/metrics', funnelController.getMetrics);

module.exports = router;