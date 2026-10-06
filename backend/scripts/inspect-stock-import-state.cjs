require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }, connectionTimeoutMillis: 15000 });
if (process.env.DB_SCHEMA !== 'medsense_app') throw new Error('Unexpected database schema');
(async()=>{
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL search_path=medsense_app');
    const state = (await client.query(`SELECT
      (SELECT count(*)::int FROM product) products,
      (SELECT count(*)::int FROM product WHERE product_status=1) active_products,
      (SELECT count(*)::int FROM product WHERE product_purchase_price IS NULL) missing_purchase_cost,
      (SELECT count(*)::int FROM stock) receipts,
      (SELECT count(*)::int FROM stock_history) batches,
      (SELECT count(*)::int FROM stock_report) stock_ledger,
      (SELECT count(*)::int FROM supplier_accounts) supplier_accounts,
      (SELECT count(*)::int FROM supplier_ledger) supplier_ledger,
      (SELECT count(*)::int FROM invoice) orders`)).rows[0];
    const suppliers = (await client.query('SELECT supplier_name,status FROM supplier_info ORDER BY supplier_name')).rows;
    const required = (await client.query(`SELECT table_name,column_name,data_type FROM information_schema.columns
      WHERE table_schema='medsense_app' AND table_name=ANY($1::text[]) AND is_nullable='NO' AND column_default IS NULL
      ORDER BY table_name,ordinal_position`, [['stock','stock_history','stock_report','supplier_accounts','supplier_ledger']])).rows;
    const checks = (await client.query(`SELECT rel.relname table_name,c.conname,pg_get_constraintdef(c.oid) definition
      FROM pg_constraint c JOIN pg_class rel ON rel.oid=c.conrelid JOIN pg_namespace n ON n.oid=rel.relnamespace
      WHERE n.nspname='medsense_app' AND c.contype='c' AND rel.relname=ANY($1::text[])`,
      [['stock','stock_history','stock_report','supplier_accounts','supplier_ledger']])).rows;
    console.log(JSON.stringify({state,suppliers,required,checks},null,2));
    await client.query('ROLLBACK');
  } catch(error) { console.error(error.message||error.code);process.exitCode=1; }
  finally { await client.end(); }
})();
