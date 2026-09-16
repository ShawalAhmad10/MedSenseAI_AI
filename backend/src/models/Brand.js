const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Brand = sequelize.define('Brand', {
  brand_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'brand_id'
  },
  brand_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    field: 'brand_name'
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
  tableName: 'brand',
  timestamps: false
});

module.exports = Brand;
