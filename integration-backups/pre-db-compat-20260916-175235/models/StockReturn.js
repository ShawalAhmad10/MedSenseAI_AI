const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StockReturn = sequelize.define('StockReturn', {
  return_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'return_id'
  },
  stock_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'stock_id',
    comment: 'Foreign key to stock.stock_id'
  },
  supplier_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'supplier_id'
  },
  total_amount: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'total_amount'
  },
  return_type: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'normal',
    field: 'return_type'
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'description'
  },
  creation_day: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'creation_day'
  },
  created_by: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'created_by'
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
  tableName: 'stock_return',
  timestamps: false
});

module.exports = StockReturn;
