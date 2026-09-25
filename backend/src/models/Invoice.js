const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Invoice = sequelize.define('Invoice', {
  invoice_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'invoice_id'
  },
  invoice_number: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    field: 'invoice_number'
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'customer_id',
    comment: 'Foreign key to customer table (optional for walk-in customer)'
  },
  customer_name: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'customer_name'
  },
  customer_phone: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'customer_phone'
  },
  customer_email: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'customer_email'
  },
  branch_name: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'Main Branch',
    field: 'branch_name'
  },
  total_amount: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    defaultValue: 0,
    field: 'total_amount'
  },
  discount: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    defaultValue: 0,
    field: 'discount'
  },
  delivery_fee: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    defaultValue: 0,
    field: 'delivery_fee'
  },
  paid_amount: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    defaultValue: 0,
    field: 'paid_amount'
  },
  due_amount: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    defaultValue: 0,
    field: 'due_amount'
  },
  payment_status: {
    type: DataTypes.STRING, // Using STRING to avoid Sequelize ENUM conflicts
    allowNull: false,
    defaultValue: 'unpaid',
    field: 'payment_status',
    validate: {
      isIn: [['paid', 'unpaid', 'partial', 'pending']]
    }
  },
  payment_method: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'cash',
    field: 'payment_method',
    comment: 'Only cash on delivery supported currently',
    validate: {
      isIn: [['cash']]
    }
  },
  delivery_status: {
    type: DataTypes.STRING, // Using STRING to avoid Sequelize ENUM conflicts
    allowNull: false,
    defaultValue: 'pending',
    field: 'delivery_status',
    validate: {
      isIn: [['pending', 'confirmed', 'processing', 'ready', 'shipped', 'delivered', 'cancelled']]
    }
  },
  delivery_address: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'delivery_address'
  },
  builty_no: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'builty_no'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'notes'
  },
  card_holder_name: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'card_holder_name',
    comment: 'Name on the card (for card payments)'
  },
  card_last_four: {
    type: DataTypes.STRING(4),
    allowNull: true,
    field: 'card_last_four',
    comment: 'Last 4 digits of card number (for security)'
  },
  card_expiry: {
    type: DataTypes.STRING(7),
    allowNull: true,
    field: 'card_expiry',
    comment: 'Card expiry date in MM/YY format'
  },
  billing_address: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'billing_address',
    comment: 'Billing address for card payments'
  },
  wallet_account_name: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'wallet_account_name',
    comment: 'Account holder name for digital wallet payments'
  },
  wallet_account_number: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'wallet_account_number',
    comment: 'Account number for digital wallet payments (EasyPaisa/JazzCash/NayaPay)'
  },
  wallet_cnic: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'wallet_cnic',
    comment: 'CNIC for digital wallet verification'
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
    field: 'status',
    comment: '1 = active, 0 = deleted'
  },
  invoice_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'invoice_date'
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
  tableName: 'invoice',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Invoice;
