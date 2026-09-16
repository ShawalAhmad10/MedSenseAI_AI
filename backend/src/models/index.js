// src/models/index.js
const { sequelize } = require('../config/database');
const User = require('./User');
const Customer = require('./Customer');
const CustomerAccount = require('./CustomerAccount');
const CustomerLedger = require('./CustomerLedger');
const Brand = require('./Brand');
const Supplier = require('./Supplier');
const Product = require('./Product');
const Stock = require('./Stock');
const StockHistory = require('./StockHistory');
const StockReport = require('./StockReport');
const NotificationPreference = require('./NotificationPreference');
const Notification = require('./Notification');
const Invoice = require('./Invoice');
const InvoiceReport = require('./InvoiceReport');
const TeamMember = require('./TeamMember');

// Define associations
TeamMember.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

User.hasOne(TeamMember, {
  foreignKey: 'userId',
  as: 'teamMember'
});

// Models are defined here
const db = {
  sequelize,
  User,
  Customer,
  CustomerAccount,
  CustomerLedger,
  Brand,
  Supplier,
  Product,
  Stock,
  StockHistory, // FIFO batch-level model
  StockReport, // Audit trail model
  NotificationPreference,
  Notification,
  Invoice,
  InvoiceReport,
  TeamMember, // Team management model
  // Backwards compatibility alias
  Pharmacist: User,
};

module.exports = db;
