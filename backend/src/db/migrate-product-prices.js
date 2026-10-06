const fs = require('node:fs');
const path = require('node:path');
const { sequelize } = require('../config/database');

(async () => {
  try {
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../..', 'migrations/20261002_fixed_product_prices.sql'), 'utf8'));
    console.log('Fixed product pricing migration complete. Existing batch prices preserved.');
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../..', 'migrations/20261002_supplier_accounts.sql'), 'utf8'));
    console.log('Supplier account and ledger migration complete. Existing balances preserved.');
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../..', 'migrations/20261002_invoice_batch_reference.sql'), 'utf8'));
    console.log('Invoice batch references and nonnegative stock constraint ready.');
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../..', 'migrations/20261003_customer_order_returns.sql'), 'utf8'));
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../..', 'migrations/20261003_evaluation_lead_activity.sql'), 'utf8'));
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../..', 'migrations/20261002_fifo_inventory_status.sql'), 'utf8'));
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../..', 'migrations/20261002_fifo_product_controls.sql'), 'utf8'));
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../..', 'migrations/20261002_legacy_cloud_orders.sql'), 'utf8'));
    await require('../services/customerRefillService').ensureSchema();
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../..', 'migrations/20261002_paypal_subscriptions.sql'), 'utf8'));
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../..', 'migrations/20261002_paypal_subscription_flow.sql'), 'utf8'));
    console.log('PayPal subscription, payment and webhook storage ready.');
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../..', 'migrations/20261002_requested_catalog_rules.sql'), 'utf8'));
    await sequelize.transaction(async transaction => {
      await sequelize.query('SELECT pg_advisory_xact_lock(44201,17001)', { transaction });
      await sequelize.query(fs.readFileSync(path.join(__dirname, '../..', 'migrations/stock_document_numbers.sql'), 'utf8'), { transaction });
    });
    console.log('FIFO availability and sequential stock document numbers ready.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
