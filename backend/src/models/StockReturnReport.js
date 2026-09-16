const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StockReturnReport = sequelize.define('StockReturnReport', {
  report_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'report_id'
  },
  return_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'return_id',
    comment: 'Foreign key to stock_return.return_id'
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_id'
  },
  product_title: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'product_title'
  },
  product_quantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_quantity'
  },
  product_price: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'product_price'
  },
  total_price: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'total_price'
  },
  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'expiry_date'
  },
  status: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'status'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'stock_return_report',
  timestamps: false
});

module.exports = StockReturnReport;
