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

// Validate an explicit customer selection against authoritative product,
// salt, stock, and the existing centralized DDI workflow. The browser cart is
// not mutated here; the validated response is applied by the existing cart
// lifecycle, and checkout performs its normal final revalidation.
router.post(
  '/products/:productId/select',
  recommendationController.selectAlternative
);

// Interaction-aware recommendations:
// cart product ids are untrusted input, while all
// product details and stock are reloaded from
// authoritative PostgreSQL before the DDI re-check.
router.post(
  '/products/:productId/interaction-aware',
  recommendationController.interactionAware
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
