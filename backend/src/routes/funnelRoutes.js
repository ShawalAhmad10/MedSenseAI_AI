const express = require('express');
const router = express.Router();
const funnelController = require('../controllers/funnelController');

router.post('/events', funnelController.captureEvent);
router.get('/metrics', funnelController.getMetrics);

module.exports = router;