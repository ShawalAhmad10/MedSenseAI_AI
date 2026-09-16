// Sales Routes
const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');

// GET /api/sales/overview?days=30
router.get('/overview', salesController.getSalesOverview);

// GET /api/sales/products?days=30&limit=8
router.get('/products', salesController.getTopProducts);

// GET /api/sales/slow-movers?days=30&limit=6
router.get('/slow-movers', salesController.getSlowMovers);

// GET /api/sales/recommendations?days=30
router.get('/recommendations', salesController.getRecommendations);

module.exports = router;
