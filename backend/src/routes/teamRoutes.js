const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// Team management routes
router.get('/', teamController.listTeamMembers);
router.post('/', teamController.addTeamMember);
router.put('/:id', teamController.updateTeamMember);
router.patch('/:id/toggle-status', teamController.toggleTeamMemberStatus);
router.delete('/:id', teamController.removeTeamMember);
router.patch('/:id/reset-password', teamController.resetTeamMemberPassword);

module.exports = router;
