const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StockReport = sequelize.define('StockReport', {
  ledger_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'ledger_id'
  },
  batch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'batch_id',
    comment: 'Foreign key to stock_history.batch_id'
  },
  product_id: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'product_id',
    comment: 'Foreign key to product.product_id'
  },
  transaction_type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'transaction_type',
    comment: 'PURCHASE, SALE, RETURN, ADJUSTMENT, DISPOSED, EXPIRED',
    validate: {
      isIn: [['PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'DISPOSED', 'EXPIRED']]
    }
  },
  quantity_change: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'quantity_change',
    comment: 'Positive for IN, Negative for OUT'
  },
  balance_after: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'balance_after',
    comment: 'StockHistory quantity after this transaction'
  },
  reference_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'reference_type',
    comment: 'INVOICE, STOCK, MANUAL, SYSTEM'
  },
  reference_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'reference_id',
    comment: 'ID of the reference record (invoice_id, stock_id, etc)'
  },
  reference_number: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'reference_number',
    comment: 'Human-readable reference (invoice number, bill number)'
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'unit_price',
    comment: 'Price per unit at transaction time'
  },
  total_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'total_value',
    comment: 'Total transaction value (quantity × unit_price)'
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'reason',
    comment: 'Reason for adjustment/disposal'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'notes',
    comment: 'Additional notes'
  },
  performed_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'performed_by',
    comment: 'User who performed the transaction'
  },
  approved_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'approved_by',
    comment: 'User who approved (for adjustments/disposals)'
  },
  witness: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'witness',
    comment: 'Witness for disposal'
  },
  transaction_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'transaction_date',
    comment: 'When the transaction occurred'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at',
    comment: 'When this record was created'
  },
  // PDF stock_report fields
  sales_tax: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
    field: 'sales_tax'
  },
  advance_tax: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
    field: 'advance_tax'
  },
  product_expiry: {
    type: DataTypes.STRING(30),
    allowNull: true,
    field: 'product_expiry'
  }
}, {
  tableName: 'stock_report',
  timestamps: false
});

StockReport.associate = (models) => {
  StockReport.belongsTo(models.StockHistory, {
    foreignKey: 'batch_id',
    as: 'batch'
  });
  
  StockReport.belongsTo(models.Product, {
    foreignKey: 'product_id',
    as: 'product'
  });
  
  StockReport.belongsTo(models.Invoice, {
    foreignKey: 'reference_id',
    as: 'invoice',
    constraints: false
  });
};

// Static method to create ledger entry
StockReport.createEntry = async function(data, transaction = null) {
  return await this.create({
    batch_id: data.batch_id,
    product_id: data.product_id,
    transaction_type: data.transaction_type,
    quantity_change: data.quantity_change,
    balance_after: data.balance_after,
    reference_type: data.reference_type || null,
    reference_id: data.reference_id || null,
    reference_number: data.reference_number || null,
    unit_price: data.unit_price || null,
    total_value: data.total_value || null,
    reason: data.reason || null,
    notes: data.notes || null,
    performed_by: data.performed_by || 'SYSTEM',
    approved_by: data.approved_by || null,
    witness: data.witness || null,
    transaction_date: data.transaction_date || new Date(),
    sales_tax:     data.sales_tax     || 0,
    advance_tax:   data.advance_tax   || 0,
    product_expiry: data.product_expiry || null
  }, { transaction });
};

module.exports = StockReport;
