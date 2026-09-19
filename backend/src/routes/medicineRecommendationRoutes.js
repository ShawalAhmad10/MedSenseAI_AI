const express =
  require('express');

const recommendationController =
  require('../controllers/medicineRecommendationController');

const {
  verifyCustomerToken,
} = require('../middleware/customerAuth');

const router =
  express.Router();

// Public storefront:
// source Product identity is always reloaded
// from authoritative PostgreSQL data.
router.get(
  '/products/:productId',
  recommendationController.byProduct
);

// Prescription-derived recommendations are
// customer-owned and require a confirmed
// prescription lifecycle record.
router.get(
  '/prescriptions/:prescriptionId',
  verifyCustomerToken,
  recommendationController.byPrescription
);

module.exports = router;
