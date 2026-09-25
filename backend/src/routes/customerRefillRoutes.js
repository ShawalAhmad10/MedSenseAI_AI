const express =
  require('express');

const controller =
  require(
    '../controllers/customerRefillController'
  );

const {
  verifyCustomerToken,
} = require(
  '../middleware/customerAuth'
);

const router =
  express.Router();

router.get(
  '/sources',
  verifyCustomerToken,
  controller.listSources
);

router.get(
  '/',
  verifyCustomerToken,
  controller.listReminders
);

router.post(
  '/',
  verifyCustomerToken,
  controller.createReminder
);

router.patch(
  '/:reminderId',
  verifyCustomerToken,
  controller.updateReminder
);

router.post(
  '/:reminderId/complete',
  verifyCustomerToken,
  controller.completeReminder
);

router.delete(
  '/:reminderId',
  verifyCustomerToken,
  controller.cancelReminder
);

module.exports =
  router;
