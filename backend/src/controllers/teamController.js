const User = require('../models/User');
const TeamMember = require('../models/TeamMember');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

// Get all team members - fetches from team_members table with user data
exports.listTeamMembers = async (req, res) => {
  try {
    const members = await TeamMember.findAll({
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'fullName', 'email', 'phone', 'role'],
        required: true
      }],
      order: [['joinedDate', 'DESC']]
    });

    res.json({
      success: true,
      data: members.map(m => ({
        id: m.id,
        userId: m.userId,
        name: m.user.fullName,
        email: m.user.email,
        phone: m.user.phone,
        type: m.user.role,
        position: m.position,
        status: m.isActive ? 'active' : 'inactive',
        joined: m.joinedDate
      }))
    });
  } catch (error) {
    console.error('List team members error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team members',
      error: error.message
    });
  }
};

// Add new team member - creates user first, then team_member entry
exports.addTeamMember = async (req, res) => {
  try {
    const { name, email, phone, password, position } = req.body;

    // Validation
    if (!name || !name.trim() || !email) {
      console.log('Validation failed - name:', name, 'email:', email);
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      // Check if already a team member
      const existingTeamMember = await TeamMember.findOne({ where: { userId: existingUser.id } });
      if (existingTeamMember) {
        return res.status(400).json({
          success: false,
          message: 'User is already a team member'
        });
      }
      
      // User exists but not a team member, add to team
      const teamMember = await TeamMember.create({
        userId: existingUser.id,
        position: position || 'Pharmacist',
        joinedDate: new Date(),
        isActive: true
      });

      // Fetch with user data
      const created = await TeamMember.findByPk(teamMember.id, {
        include: [{ model: User, as: 'user', attributes: ['id', 'fullName', 'email', 'phone', 'role'] }]
      });

      return res.status(201).json({
        success: true,
        message: 'Existing user added to team successfully',
        data: {
          id: created.id,
          userId: created.userId,
          name: created.user.fullName,
          email: created.user.email,
          phone: created.user.phone,
          type: created.user.role,
          position: created.position,
          status: 'active',
          joined: created.joinedDate
        }
      });
    }

    // Password is mandatory. User model hashes it exactly once.
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'A password of at least 8 characters is required'
      });
    }

    // Create new user with role = pharmacist
    const user = await User.create({
      fullName: name,
      email,
      phone: phone || null,
      password,
      role: 'pharmacist',
      isActive: true,
      isApproved: true,
      isEmailVerified: false
    });

    // Create team member entry
    const teamMember = await TeamMember.create({
      userId: user.id,
      position: position || 'Pharmacist',
      joinedDate: new Date(),
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Team member added successfully',
      data: {
        id: teamMember.id,
        userId: user.id,
        name: user.fullName,
        email: user.email,
        phone: user.phone,
        type: user.role,
        position: teamMember.position,
        status: 'active',
        joined: teamMember.joinedDate
      }
    });
  } catch (error) {
    console.error('Add team member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add team member',
      error: error.message
    });
  }
};

// Update team member - updates user data and team_member data
exports.updateTeamMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, position } = req.body;

    const teamMember = await TeamMember.findByPk(id, {
      include: [{ model: User, as: 'user' }]
    });
    
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    // Don't allow modifying admin users
    if (teamMember.user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify admin account'
      });
    }

    // Check email uniqueness if changing
    if (email && email !== teamMember.user.email) {
      const existing = await User.findOne({ 
        where: { 
          email, 
          id: { [Op.ne]: teamMember.userId } 
        } 
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }

    // Update user data
    await teamMember.user.update({
      fullName: name || teamMember.user.fullName,
      email: email || teamMember.user.email,
      phone: phone !== undefined ? phone : teamMember.user.phone
    });

    // Update team member data
    if (position) {
      await teamMember.update({ position });
    }

    // Fetch updated data
    const updated = await TeamMember.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'fullName', 'email', 'phone', 'role'] }]
    });

    res.json({
      success: true,
      message: 'Team member updated successfully',
      data: {
        id: updated.id,
        userId: updated.userId,
        name: updated.user.fullName,
        email: updated.user.email,
        phone: updated.user.phone,
        type: updated.user.role,
        position: updated.position,
        status: updated.isActive ? 'active' : 'inactive',
        joined: updated.joinedDate
      }
    });
  } catch (error) {
    console.error('Update team member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update team member',
      error: error.message
    });
  }
};

// Toggle team member status - updates team_members.is_active
exports.toggleTeamMemberStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const teamMember = await TeamMember.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'fullName', 'role'] }]
    });
    
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    // Don't allow deactivating admin
    if (teamMember.user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot deactivate admin account'
      });
    }
    const nextActive = !teamMember.isActive;

    // Authentication middleware reads users.is_active, so keep both states aligned.
    await teamMember.user.update({
      isActive: nextActive
    });

    await teamMember.update({
      isActive: nextActive
    });

    res.json({
      success: true,
      message: `Team member ${teamMember.isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        id: teamMember.id,
        name: teamMember.user.fullName,
        status: teamMember.isActive ? 'active' : 'inactive'
      }
    });
  } catch (error) {
    console.error('Toggle team member status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle status',
      error: error.message
    });
  }
};

// Remove team member - removes from team_members table (user stays in users table)
exports.removeTeamMember = async (req, res) => {
  try {
    const { id } = req.params;

    const teamMember = await TeamMember.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'fullName', 'role'] }]
    });
    
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    // Don't allow removing admin
    if (teamMember.user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot remove admin account'
      });
    }

    // Remove from team_members table (user record stays in users table)
    // Revoke authentication before removing team membership.
    await teamMember.user.update({
      isActive: false
    });

    await teamMember.destroy();

    res.json({
      success: true,
      message: 'Team member removed successfully'
    });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove team member',
      error: error.message
    });
  }
};

// Reset team member password - updates user password
exports.resetTeamMemberPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'A password of at least 8 characters is required'
      });
    }

    const teamMember = await TeamMember.findByPk(id, {
      include: [{ model: User, as: 'user' }]
    });
    
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    if (teamMember.user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot reset administrator password through team management'
      });
    }

    // User model hashes plaintext exactly once.
    await teamMember.user.update({
      password
    });

    res.json({
      success: true,
      message: 'Password reset successfully',
      data: {
        id: teamMember.id,
        userId: teamMember.userId
      }
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: error.message
    });
  }
};

module.exports = exports;
