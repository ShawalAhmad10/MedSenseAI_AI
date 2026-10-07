const express =
  require('express');

const router =
  express.Router();

const {
  verifyCustomerToken,
} = require('../middleware/customerAuth');

const {
  authenticateToken,
} = require('../middleware/auth');
const prescriptionController =
  require('../controllers/prescriptionController');

router.get(
  '/pharmacist/review',
  authenticateToken,
  prescriptionController
    .listForPharmacist
);

router.get(
  '/pharmacist/review/:prescriptionId',
  authenticateToken,
  prescriptionController
    .getForPharmacist
);

router.patch(
  '/pharmacist/review/:prescriptionId',
  authenticateToken,
  prescriptionController
    .reviewForPharmacist
);

router.use(
  verifyCustomerToken
);

router.post(
  '/analyze',
  prescriptionController.analyze
);

router.get(
  '/',
  prescriptionController.listMine
);

router.patch(
  '/:prescriptionId/confirm',
  prescriptionController.confirmMine
);
router.get(
  '/:prescriptionId',
  prescriptionController.getMine
);

module.exports =
  router;
