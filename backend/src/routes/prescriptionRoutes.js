const express =
  require('express');

const router =
  express.Router();

const {
  verifyCustomerToken,
} = require('../middleware/customerAuth');

const prescriptionController =
  require('../controllers/prescriptionController');

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
