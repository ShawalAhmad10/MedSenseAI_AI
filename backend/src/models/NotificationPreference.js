// src/models/NotificationPreference.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const NotificationPreference = sequelize.define('NotificationPreference', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    field: 'user_id',
  },
  newOrders: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'new_orders',
  },
  lowStock: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'low_stock',
  },
  orderUpdates: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'order_updates',
  },
  dailyReport: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'daily_report',
  },
  promotions: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'promotions',
  },
}, {
  tableName: 'notification_preferences',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = NotificationPreference;
