const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CustomerAccount = sequelize.define('CustomerAccount', {
  account_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'account_id'
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'customer_id',
    references: {
      model: 'customer',
      key: 'customer_id'
    }
  },
  opening_balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    field: 'opening_balance'
  },
  current_balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    field: 'current_balance'
  },
  total_debit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    field: 'total_debit',
    comment: 'Total purchases/receivables'
  },
  total_credit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    field: 'total_credit',
    comment: 'Total payments received'
  },
  credit_limit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    field: 'credit_limit'
  },
  payment_terms: {
    type: DataTypes.INTEGER,
    defaultValue: 30,
    field: 'payment_terms',
    comment: 'Payment terms in days'
  },
  account_status: {
    type: DataTypes.ENUM('active', 'suspended', 'closed'),
    defaultValue: 'active',
    field: 'account_status'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'notes'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  },
  status: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'status'
  }
}, {
  tableName: 'customer_accounts',
  timestamps: false
});

module.exports = CustomerAccount;
