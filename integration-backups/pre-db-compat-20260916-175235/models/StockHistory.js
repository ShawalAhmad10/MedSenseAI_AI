const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StockHistory = sequelize.define('StockHistory', {
  batch_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'batch_id'
  },
  stock_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'stock_id',
    comment: 'Foreign key to stock.stock_id (purchase bill)'
  },
  product_id: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'product_id',
    comment: 'Foreign key to product.product_id'
  },
  product_title: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'product_title',
    comment: 'Denormalized for performance'
  },
  batch_number: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'batch_number',
    comment: 'Manufacturer batch number or auto-generated'
  },
  initial_quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'initial_quantity',
    comment: 'Original quantity received (quantity + bonus)'
  },
  remaining_quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'remaining_quantity',
    comment: 'Current available quantity'
  },
  product_quantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_quantity',
    comment: 'Original purchase quantity (without bonus)'
  },
  product_bonus: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    field: 'product_bonus',
    comment: 'Bonus quantity received'
  },
  product_price: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    field: 'product_price',
    comment: 'Purchase cost per unit'
  },
  sale_price: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'sale_price',
    comment: 'Selling price per unit'
  },
  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'expiry_date',
    comment: 'StockHistory expiry date'
  },
  batch_status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'ACTIVE',
    field: 'batch_status',
    comment: 'ACTIVE, EXPIRED, FINISHED, QUARANTINE, DISPOSED',
    validate: {
      isIn: [['ACTIVE', 'EXPIRED', 'FINISHED', 'QUARANTINE', 'DISPOSED']]
    }
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
  sales_tax: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    defaultValue: 0,
    field: 'sales_tax'
  },
  advance_tax: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    defaultValue: 0,
    field: 'advance_tax'
  },
  product_discount: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'product_discount'
  },
  total_price: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'total_price'
  },
  creation_day: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'creation_day'
  },
  status: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'status',
    comment: '1 = active record, 0 = deleted (legacy field)'
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
  tableName: 'stock_history',
  timestamps: false
});

StockHistory.associate = (models) => {
  StockHistory.belongsTo(models.Stock, {
    foreignKey: 'stock_id',
    as: 'purchaseBill'
  });
  
  StockHistory.belongsTo(models.Product, {
    foreignKey: 'product_id',
    as: 'product'
  });
  
  StockHistory.hasMany(models.StockReport, {
    foreignKey: 'batch_id',
    as: 'ledgerEntries'
  });
};

// Instance methods
StockHistory.prototype.isAvailableForSale = function() {
  return this.batch_status === 'ACTIVE' && 
         this.remaining_quantity > 0 && 
         new Date(this.expiry_date) >= new Date();
};

StockHistory.prototype.canDeduct = function(quantity) {
  return this.isAvailableForSale() && this.remaining_quantity >= quantity;
};

module.exports = StockHistory;
