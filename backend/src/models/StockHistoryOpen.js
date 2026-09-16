const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StockHistoryOpen = sequelize.define('StockHistoryOpen', {
  open_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'open_id'
  },
  product_id: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'product_id'
  },
  product_title: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'product_title'
  },
  product_bale: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_bale'
  },
  product_bale_size: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_bale_size'
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
  creation_day: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'creation_day'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'notes'
  },
  adjustment_type: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'opening',
    field: 'adjustment_type'
  },
  user: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'user'
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
  tableName: 'stock_history_open',
  timestamps: false
});

module.exports = StockHistoryOpen;
