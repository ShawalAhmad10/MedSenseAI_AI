const express = require('express');
const router  = express.Router();
const customerController = require('../controllers/customerController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Customer master
router.get('/',              customerController.listCustomers);
router.post('/',             customerController.createCustomer);
router.get('/:customerId',   customerController.getCustomerDetails);
router.put('/:customerId',   customerController.updateCustomer);
router.patch('/:customerId/deactivate', customerController.deactivateCustomer);

// Ledger  (COD: invoice = debit, payment = credit)
router.get('/:customerId/ledger',    customerController.getCustomerLedger);
router.post('/:customerId/payment',  customerController.markPaymentReceived);  // singular
router.post('/:customerId/payments', customerController.markPaymentReceived);  // plural (frontend uses this)

module.exports = router;
