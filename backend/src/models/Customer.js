const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Customer = sequelize.define('Customer', {
  customer_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'customer_id'
  },
  customer_name: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'customer_name'
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true,
    field: 'email',
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'password'
  },
  phone: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'phone',
    validate: {
      notEmpty: true
    }
  },
  customer_city: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'customer_city',
    validate: {
      notEmpty: true
    }
  },
  customer_contact: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'customer_contact',
    validate: {
      notEmpty: true
    }
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'address',
    validate: {
      notEmpty: true
    }
  },
  email_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'email_verified'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  status: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'status'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'updated_at'
  }
}, {
  tableName: 'customer',
  timestamps: false
});

module.exports = Customer;
