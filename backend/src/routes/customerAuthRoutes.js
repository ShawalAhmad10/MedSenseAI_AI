const express = require('express');
const router = express.Router();
const customerAuthController = require('../controllers/customerAuthController');
const { verifyCustomerToken } = require('../middleware/customerAuth');

// Public routes
router.post('/register', customerAuthController.register);
router.post('/login', customerAuthController.login);

// Protected routes (require customer token)
router.get('/profile', verifyCustomerToken, customerAuthController.getProfile);
router.put('/profile', verifyCustomerToken, customerAuthController.updateProfile);
router.put('/change-password', verifyCustomerToken, customerAuthController.changePassword);

// Dashboard routes (for pharmacist to manage customer)
router.get('/list', customerAuthController.listCustomers);
router.post('/create', customerAuthController.createCustomer);
router.put('/update/:customerId', customerAuthController.updateCustomer);

module.exports = router;
