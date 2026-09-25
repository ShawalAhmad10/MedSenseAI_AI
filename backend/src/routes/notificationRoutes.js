// src/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/auth');

// All notification routes require authentication
router.get('/', authenticateToken, notificationController.getNotifications);
router.post('/:notificationId/read', authenticateToken, notificationController.markAsRead);
router.post('/read-all', authenticateToken, notificationController.markAllAsRead);
router.delete('/:notificationId', authenticateToken, notificationController.deleteNotification);

router.get('/preferences', authenticateToken, notificationController.getPreferences);
router.put('/preferences', authenticateToken, notificationController.updatePreferences);

module.exports = router;
