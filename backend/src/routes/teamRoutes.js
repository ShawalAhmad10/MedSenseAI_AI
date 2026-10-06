const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      code: 'ADMIN_ACCESS_REQUIRED',
      message: 'Team management requires administrator authorization'
    });
  }

  return next();
};

router.use(requireAdmin);

// Team management routes
router.get('/', teamController.listTeamMembers);
router.post('/', teamController.addTeamMember);
router.put('/:id', teamController.updateTeamMember);
router.patch('/:id/toggle-status', teamController.toggleTeamMemberStatus);
router.delete('/:id', teamController.removeTeamMember);
router.patch('/:id/reset-password', teamController.resetTeamMemberPassword);

module.exports = router;
