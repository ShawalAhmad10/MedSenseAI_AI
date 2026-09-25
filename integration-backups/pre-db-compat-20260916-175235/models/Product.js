const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Product = sequelize.define('Product', {
  product_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    field: 'product_id'
  },
  product_brand: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_brand',
    comment: 'Foreign key to brand.brand_id'
  },
  product_supplier: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_supplier',
    comment: 'Foreign key to supplier_info.supplier_id'
  },
  product_price: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    field: 'product_price',
    comment: 'Price per unit'
  },
  product_title: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'product_title'
  },
  product_generic_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'product_generic_name'
  },
  product_category: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'product_category'
  },
  product_pack_price: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_pack_price',
    comment: 'Total pack price'
  },
  product_discount: {
    type: DataTypes.REAL,
    allowNull: true,
    field: 'product_discount'
  },
  product_salt: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'product_salt',
    comment: 'Active ingredient/salt'
  },
  product_pack_size: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_pack_size',
    comment: 'Number of units in pack'
  },
  product_pack_description: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'product_pack_description'
  },
  product_min_threshold: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    field: 'product_min_threshold',
    comment: 'Reorder level - alerts when stock falls below this'
  },
  product_requires_rx: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
    field: 'product_requires_rx'
  },
  product_description: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'product_description'
  },
  product_status: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'product_status',
    comment: '1 = active, 0 = inactive'
  },
  created_by: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'created_by'
  }
}, {
  tableName: 'product',
  timestamps: false
});

module.exports = Product;
