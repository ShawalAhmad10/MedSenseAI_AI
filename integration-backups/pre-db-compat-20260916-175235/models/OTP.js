// src/models/OTP.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const OTP = sequelize.define('OTP', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      isEmail: true,
    },
  },
  otp: {
    type: DataTypes.STRING(6),
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('registration', 'password_reset', 'verification'),
    allowNull: false,
    defaultValue: 'registration',
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'expires_at',
  },
  isUsed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_used',
  },
}, {
  tableName: 'otps',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['email'] },
    { fields: ['otp'] },
    { fields: ['expires_at'] },
  ],
});

// Instance method to check if OTP is valid
OTP.prototype.isValid = function () {
  return !this.isUsed && new Date() < this.expiresAt;
};

// Class method to generate 6-digit OTP
OTP.generateOTP = function () {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = OTP;
