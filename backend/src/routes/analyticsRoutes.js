const express = require('express');
const analyticsController =
  require('../controllers/analyticsController');

const router = express.Router();

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
