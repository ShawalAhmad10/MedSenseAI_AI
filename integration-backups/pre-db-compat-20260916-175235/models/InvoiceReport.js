const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvoiceReport = sequelize.define('InvoiceReport', {
  item_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'item_id'
  },
  invoice_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'invoice_id',
    comment: 'Foreign key to invoice.invoice_id'
  },
  product_id: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'product_id',
    comment: 'Foreign key to product_info table'
  },
  product_title: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'product_title'
  },
  batch_number: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'batch_number'
  },
  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'expiry_date'
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'quantity'
  },
  unit_price: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    defaultValue: 0,
    field: 'unit_price'
  },
  discount: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    defaultValue: 0,
    field: 'discount'
  },
  tax: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    defaultValue: 0,
    field: 'tax'
  },
  total_price: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    defaultValue: 0,
    field: 'total_price'
  },
  purchase_price: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    defaultValue: 0,
    field: 'purchase_price'
  },
  status: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'status'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'invoice_report',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = InvoiceReport;
