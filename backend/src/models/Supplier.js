const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Supplier = sequelize.define('Supplier', {
  supplier_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'supplier_id'
  },
  supplier_name: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'supplier_name'
  },
  supplier_city: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'supplier_city'
  },
  supplier_contact: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'supplier_contact'
  },
  status: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: '1 = active, 0 = disabled'
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
  tableName: 'supplier_info',
  timestamps: false
});

module.exports = Supplier;
