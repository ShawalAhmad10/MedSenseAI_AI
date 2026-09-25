const express = require('express');
const router = express.Router();

const customerAuthController =
  require('../controllers/customerAuthController');

const {
  verifyCustomerToken
} = require('../middleware/customerAuth');

const {
  authenticateToken
} = require('../middleware/auth');

const {
  customerLoginLimiter,
  customerRegistrationLimiter
} = require('../middleware/authRateLimiters');


// ============================================================
// Public customer authentication
// ============================================================

router.post(
  '/register',
  customerRegistrationLimiter,
  customerAuthController.register
);

router.post(
  '/login',
  customerLoginLimiter,
  customerAuthController.login
);


// ============================================================
// Customer-owned account routes
// ============================================================

router.get(
  '/profile',
  verifyCustomerToken,
  customerAuthController.getProfile
);

router.put(
  '/profile',
  verifyCustomerToken,
  customerAuthController.updateProfile
);

router.put(
  '/change-password',
  verifyCustomerToken,
  customerAuthController.changePassword
);


// ============================================================
// Pharmacist customer-management routes
// ============================================================

router.get(
  '/list',
  authenticateToken,
  customerAuthController.listCustomers
);

router.post(
  '/create',
  authenticateToken,
  customerAuthController.createCustomer
);

router.put(
  '/update/:customerId',
  authenticateToken,
  customerAuthController.updateCustomer
);


module.exports = router;
