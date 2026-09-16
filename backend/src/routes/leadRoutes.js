const express = require('express');

const router = express.Router();

const leadController =
  require('../controllers/leadController');

const { authenticate } =
  require('../middleware/auth');

router.use(authenticate);

router.get(
  '/',
  leadController.listLeads
);

router.post(
  '/recalculate',
  leadController.recalculateLeads
);

router.get(
  '/:customerId',
  leadController.getLead
);

module.exports = router;
