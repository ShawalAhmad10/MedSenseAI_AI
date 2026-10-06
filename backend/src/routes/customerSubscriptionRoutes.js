const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyCustomerToken } = require('../middleware/customerAuth');
const { subscriptionService } = require('../services/customerSubscriptionService');
const router = express.Router();
const handle = work => async (req, res) => {
  try { res.json({ success: true, data: await work(req) }); }
  catch (error) { res.status(error.status || 500).json({ success: false, code: error.code || 'SUBSCRIPTION_FAILED',
    message: error.code ? error.message : 'Subscription request failed. Please try again.' }); }
};
router.post('/webhook', rateLimit({ windowMs: 60000, max: 300 }), handle(req => subscriptionService.webhook(req.headers, req.body)));
router.use(verifyCustomerToken);
router.get('/config', handle(() => subscriptionService.configuration()));
router.get('/', handle(req => subscriptionService.list(req.user.id)));
router.post('/', rateLimit({ windowMs: 60000, max: 10 }), handle(req => subscriptionService.create(req.user.id, req.body.interval, req.get('origin'))));
router.post('/:subscriptionId/refresh', rateLimit({ windowMs: 60000, max: 20 }), handle(req => subscriptionService.refresh(req.user.id, req.params.subscriptionId)));
router.post('/:subscriptionId/cancel', handle(req => subscriptionService.cancel(req.user.id, req.params.subscriptionId)));
router.post('/:subscriptionId/refills/:reminderId', handle(req => subscriptionService.attachReminder(
  req.user.id, req.params.subscriptionId, req.params.reminderId, req.body.recurrence_days)));
router.delete('/refills/:reminderId', handle(req => subscriptionService.detachReminder(req.user.id, req.params.reminderId)));
module.exports = router;
