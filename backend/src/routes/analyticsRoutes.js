const express = require('express');
const analyticsController =
  require('../controllers/analyticsController');
const { authenticateToken } =
  require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get(
  '/summary',
  analyticsController.getSummary
);

router.get(
  '/trend',
  analyticsController.getTrend
);

router.get(
  '/top-medicines',
  analyticsController.getTopMedicines
);

module.exports = router;
