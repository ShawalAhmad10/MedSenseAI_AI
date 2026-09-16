// src/controllers/notificationController.js
const { Notification, NotificationPreference, User } = require('../models');
const { Op } = require('sequelize');

// Get all notifications for authenticated user
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const notifications = await Notification.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit: 100
    });

    const unreadCount = notifications.filter(n => !n.is_read).length;

    res.json({
      success: true,
      notifications: notifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        metadata: n.metadata,
        isRead: n.is_read,
        readAt: n.read_at,
        createdAt: n.created_at
      })),
      unreadCount
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
};

// Mark single notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: {
        id: notificationId,
        user_id: userId
      }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    if (!notification.is_read) {
      notification.is_read = true;
      notification.read_at = new Date();
      await notification.save();
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      notification: {
        id: notification.id,
        isRead: notification.is_read,
        readAt: notification.read_at
      }
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    });
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await Notification.update(
      {
        is_read: true,
        read_at: new Date()
      },
      {
        where: {
          user_id: userId,
          is_read: false
        }
      }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: error.message
    });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const deleted = await Notification.destroy({
      where: {
        id: notificationId,
        user_id: userId
      }
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message
    });
  }
};

// Get notification preferences
exports.getPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sequelize } = require('../config/database');

    let [pref] = await sequelize.query(
      'SELECT * FROM notification_preferences WHERE user_id = :uid LIMIT 1',
      { replacements: { uid: userId }, type: sequelize.QueryTypes.SELECT }
    );

    if (!pref) {
      await sequelize.query(
        `INSERT INTO notification_preferences (id, user_id, new_orders, low_stock, order_updates, daily_report, promotions, created_at, updated_at)
         VALUES (gen_random_uuid(), :uid, true, true, true, false, false, NOW(), NOW())`,
        { replacements: { uid: userId }, type: sequelize.QueryTypes.INSERT }
      );
      [pref] = await sequelize.query(
        'SELECT * FROM notification_preferences WHERE user_id = :uid LIMIT 1',
        { replacements: { uid: userId }, type: sequelize.QueryTypes.SELECT }
      );
    }

    res.json({
      success: true,
      preferences: {
        newOrders:    pref.new_orders,
        lowStock:     pref.low_stock,
        orderUpdates: pref.order_updates,
        dailyReport:  pref.daily_report,
        promotions:   pref.promotions
      }
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notification preferences', error: error.message });
  }
};

// Update notification preferences
exports.updatePreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sequelize } = require('../config/database');
    const {
      newOrders, lowStock, orderUpdates, dailyReport, promotions
    } = req.body;

    // Upsert preferences
    const existing = await sequelize.query(
      'SELECT id FROM notification_preferences WHERE user_id = :uid LIMIT 1',
      { replacements: { uid: userId }, type: sequelize.QueryTypes.SELECT }
    );

    if (existing.length === 0) {
      await sequelize.query(
        `INSERT INTO notification_preferences (id, user_id, new_orders, low_stock, order_updates, daily_report, promotions, created_at, updated_at)
         VALUES (gen_random_uuid(), :uid, :no, :ls, :ou, :dr, :pr, NOW(), NOW())`,
        { replacements: { uid: userId, no: newOrders ?? true, ls: lowStock ?? true, ou: orderUpdates ?? true, dr: dailyReport ?? false, pr: promotions ?? false }, type: sequelize.QueryTypes.INSERT }
      );
    } else {
      const updates = [];
      const rep = { uid: userId };
      if (newOrders    !== undefined) { updates.push('new_orders = :no');    rep.no = newOrders; }
      if (lowStock     !== undefined) { updates.push('low_stock = :ls');     rep.ls = lowStock; }
      if (orderUpdates !== undefined) { updates.push('order_updates = :ou'); rep.ou = orderUpdates; }
      if (dailyReport  !== undefined) { updates.push('daily_report = :dr');  rep.dr = dailyReport; }
      if (promotions   !== undefined) { updates.push('promotions = :pr');    rep.pr = promotions; }
      if (updates.length > 0) {
        await sequelize.query(
          `UPDATE notification_preferences SET ${updates.join(', ')}, updated_at = NOW() WHERE user_id = :uid`,
          { replacements: rep, type: sequelize.QueryTypes.UPDATE }
        );
      }
    }

    const [pref] = await sequelize.query(
      'SELECT * FROM notification_preferences WHERE user_id = :uid LIMIT 1',
      { replacements: { uid: userId }, type: sequelize.QueryTypes.SELECT }
    );

    res.json({
      success: true,
      message: 'Notification preferences updated',
      preferences: {
        newOrders:    pref.new_orders,
        lowStock:     pref.low_stock,
        orderUpdates: pref.order_updates,
        dailyReport:  pref.daily_report,
        promotions:   pref.promotions
      }
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification preferences', error: error.message });
  }
};

// Helper function to create notification (can be called from other controllers)
exports.createNotification = async (userId, type, title, message, metadata = {}) => {
  try {
    const notification = await Notification.create({
      user_id: userId,
      type,
      title,
      message,
      metadata,
      is_read: false
    });

    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    throw error;
  }
};

// Helper function to create notifications for all pharmacists
exports.createNotificationForAllPharmacists = async (type, title, message, metadata = {}) => {
  try {
    // Get all pharmacist users
    const pharmacists = await User.findAll({
      where: { role: 'pharmacist' },
      attributes: ['id']
    });

    // Create notification for each pharmacist
    const notifications = await Promise.all(
      pharmacists.map(pharmacist =>
        Notification.create({
          user_id: pharmacist.id,
          type,
          title,
          message,
          metadata,
          is_read: false
        })
      )
    );

    return notifications;
  } catch (error) {
    console.error('Create notification for all pharmacists error:', error);
    throw error;
  }
};
