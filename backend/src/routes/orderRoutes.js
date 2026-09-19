// Order Routes

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate } = require('../middleware/auth');
const { verifyCustomerToken, optionalCustomerToken, enforceAuthenticatedCustomerOrderIdentity } = require('../middleware/customerAuth');

// Public routes
router.post('/ddi-check', orderController.checkCartDDI);
router.post('/', optionalCustomerToken, enforceAuthenticatedCustomerOrderIdentity, orderController.createOrder); // Public for storefront orders

// ORDER_READ_PRIVACY_V1
// Customer-owned reads use verified JWT identity only.
const bindAuthenticatedCustomerOrderRead = (req, res, next) => {
  const customerId = Number(req.user?.id);

  if (!Number.isSafeInteger(customerId) || customerId <= 0) {
    return res.status(403).json({
      success: false,
      code: 'INVALID_CUSTOMER_IDENTITY',
      message: 'Authenticated customer identity is invalid'
    });
  }

  req.customerOrderCustomerId = customerId;
  return next();
};

router.get(
  '/my-orders',
  verifyCustomerToken,
  bindAuthenticatedCustomerOrderRead,
  orderController.getAllOrders
);

router.get(
  '/my-orders/:id',
  verifyCustomerToken,
  bindAuthenticatedCustomerOrderRead,
  orderController.getOrderById
);

const requireOrderStaffRole = (req, res, next) => {
  if (!['pharmacist', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({
      success: false,
      code: 'ORDER_STAFF_ACCESS_REQUIRED',
      message: 'Staff order access requires pharmacist authorization'
    });
  }

  return next();
};

// Existing staff order URLs remain unchanged.
router.use(authenticate);
router.use(requireOrderStaffRole);

router.get('/', orderController.getAllOrders);
router.get('/stats', orderController.getOrderStats);
router.get('/stats/today', orderController.getTodayStats);
router.get('/stats/daily', orderController.getDailyStats);
router.get('/stats/top-medicines', orderController.getTopMedicines);
router.get('/:id', orderController.getOrderById);
router.patch('/:id/status', orderController.updateOrderStatus);

module.exports = router;
