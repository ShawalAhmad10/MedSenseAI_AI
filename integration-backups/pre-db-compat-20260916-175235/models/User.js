// src/models/User.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  fullName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'full_name',
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'password',
  },
  passwordHash: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'password_hash',
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  profilePicture: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'profile_picture',
  },
  role: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'pharmacist',
  },
  isEmailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_email_verified',
  },
  isApproved: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_approved',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active',
  },
  licenseNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'license_number',
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  province: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  referralSource: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'referral_source',
  },
  plan: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'free',
  },
  googleId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'google_id',
  },
  otpCode: {
    type: DataTypes.STRING(6),
    allowNull: true,
    field: 'otp_code',
  },
  otpExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'otp_expires_at',
  },
  resetOtpCode: {
    type: DataTypes.STRING(6),
    allowNull: true,
    field: 'reset_otp_code',
  },
  resetOtpExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reset_otp_expires_at',
  },
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// Hash password before creating/updating
User.beforeSave(async (user) => {
  if (user.changed('password') && user.password) {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(user.password, salt);
    user.passwordHash = hashed;
    user.password = hashed; // Keep both for compatibility
  }
});

// Instance method to compare password
User.prototype.comparePassword = async function (candidatePassword) {
  // Try password_hash first, then password field
  const hashToCompare = this.passwordHash || this.password;
  if (!hashToCompare) {
    console.log('No password hash found for user:', this.email);
    return false;
  }
  try {
    const result = await bcrypt.compare(candidatePassword, hashToCompare);
    return result;
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

// Instance method to get status (using existing fields)
User.prototype.getStatus = function () {
  if (!this.isActive) return 'suspended';
  if (!this.isEmailVerified) return 'pending';
  if (!this.isApproved) return 'pending';
  return 'active';
};

// Instance method to get public data (without password)
User.prototype.toPublicJSON = function () {
  const values = { ...this.get() };
  delete values.password;
  delete values.passwordHash;
  delete values.otpCode;
  delete values.otpExpiresAt;
  delete values.resetOtpCode;
  delete values.resetOtpExpiresAt;
  // Add computed status
  values.status = this.getStatus();
  return values;
};

module.exports = User;
