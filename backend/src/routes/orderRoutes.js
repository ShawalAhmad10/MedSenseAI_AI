// Order Routes

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.get('/', orderController.getAllOrders);
router.get('/stats', orderController.getOrderStats);
router.get('/stats/today', orderController.getTodayStats);
router.get('/stats/daily', orderController.getDailyStats);
router.get('/stats/top-medicines', orderController.getTopMedicines);
router.post('/ddi-check', orderController.checkCartDDI);
router.get('/:id', orderController.getOrderById);
router.post('/', orderController.createOrder); // Public for storefront orders

// Protected routes (admin only)
router.use(authenticate);
router.patch('/:id/status', orderController.updateOrderStatus);

module.exports = router;
