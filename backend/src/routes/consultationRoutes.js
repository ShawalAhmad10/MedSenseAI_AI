const express = require('express');

const router = express.Router();

const consultationController =
  require('../controllers/consultationController');

const {
  verifyCustomerToken,
} = require('../middleware/customerAuth');

const {
  authenticate,
} = require('../middleware/auth');

// EUC-08 customer-owned consultation lifecycle.
router.post(
  '/customer',
  verifyCustomerToken,
  consultationController
    .createCustomerConsultation
);

router.get(
  '/customer',
  verifyCustomerToken,
  consultationController
    .listCustomerConsultations
);

router.get(
  '/customer/:consultationId',
  verifyCustomerToken,
  consultationController
    .getCustomerConsultation
);

// EUC-08 pharmacist queue and guidance.
router.get(
  '/queue',
  authenticate,
  consultationController.listQueue
);

router.get(
  '/:consultationId',
  authenticate,
  consultationController
    .getStaffConsultation
);

router.patch(
  '/:consultationId/guidance',
  authenticate,
  consultationController.addGuidance
);

module.exports = router;
