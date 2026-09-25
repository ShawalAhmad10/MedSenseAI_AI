const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CustomerLedger = sequelize.define('CustomerLedger', {
  ledger_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'ledger_id'
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'customer_id'
  },
  account_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'account_id'
  },
  transaction_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'transaction_date'
  },
  // transaction_type values:
  // 'opening_balance' - when customer is first created
  // 'invoice'         - when an order/invoice is placed
  // 'payment'         - when customer pays cash
  // 'return'          - when an invoice is returned
  // 'adjustment'      - manual balance adjustment
  transaction_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'transaction_type'
  },
  reference_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'reference_type'   // 'INVOICE', 'PAYMENT', 'RETURN', 'OPENING'
  },
  reference_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'reference_id'     // invoice_id etc
  },
  reference_number: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'reference_number' // 'INV-000047', 'PMT-000001' etc
  },
  debit_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    field: 'debit_amount'     // Customer owes us (invoice created)
  },
  credit_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    field: 'credit_amount'    // Customer paid us (payment received)
  },
  balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    field: 'balance'          // Running balance (positive = customer owes us)
  },
  payment_method: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'cash',
    field: 'payment_method'   // 'cash' only for now
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'description'
  },
  performed_by: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'performed_by'
  },
  product_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'product_id'
  },
  product_quantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_quantity'
  },
  status: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'status'
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
  }
}, {
  tableName: 'customer_ledger',
  timestamps: false
});

module.exports = CustomerLedger;
