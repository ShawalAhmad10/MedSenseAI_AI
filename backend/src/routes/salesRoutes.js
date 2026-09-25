const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const salesController = require('../controllers/salesController');

const router = express.Router();

router.use(authenticateToken);

router.get('/overview', salesController.getSalesOverview);
router.get('/products', salesController.getTopProducts);
router.get('/slow-movers', salesController.getSlowMovers);
router.get('/recommendations', salesController.getRecommendations);

module.exports = router;
