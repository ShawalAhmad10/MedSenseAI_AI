const express =
  require('express');

const {
  authenticateToken,
} = require(
  '../middleware/auth'
);

const assistantController =
  require(
    '../controllers/assistantController'
  );

const router =
  express.Router();

router.post(
  '/ask',
  authenticateToken,
  assistantController.ask
);

module.exports =
  router;
