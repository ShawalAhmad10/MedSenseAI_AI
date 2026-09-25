const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Stock = sequelize.define('Stock', {
  stock_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'stock_id'
  },
  supplier_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'supplier_id',
    comment: 'Foreign key to supplier_info.supplier_id'
  },
  total_amount: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'total_amount'
  },
  paid_amount: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'paid_amount'
  },
  due_amount: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'due_amount'
  },
  discount: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'discount'
  },
  bill_no: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'bill_no'
  },
  builty_no: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'builty_no'
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
  tableName: 'stock',
  timestamps: false
});

// Define relationships after both models are defined
Stock.associate = (models) => {
  Stock.hasMany(models.StockHistory, {
    foreignKey: 'stock_id',
    as: 'stock_history'
  });
};

module.exports = Stock;
