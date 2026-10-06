require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }, connectionTimeoutMillis: 15000 });
if (process.env.DB_SCHEMA !== 'medsense_app') throw new Error('Expected the verified account database schema');

// Test the complete import in an isolated schema; never change application rows.
(async () => {
  try {
    await client.connect();
    await client.query('BEGIN');
    const previewSchema = `catalog_preview_${process.pid}`;
    await client.query(`CREATE SCHEMA ${previewSchema}`);
    await client.query(`SET LOCAL search_path=${previewSchema}`);
    for (const [table, id] of [['brand','brand_id'],['supplier_info','supplier_id'],['product','product_id'],
      ['stock','stock_id'],['stock_history','batch_id'],['supplier_ledger','ledger_number'],['supplier_accounts','supplier_account_id']]) {
      await client.query(`CREATE TABLE ${table} (LIKE medsense_app.${table} INCLUDING ALL)`);
      await client.query(`CREATE SEQUENCE ${table}_preview_id`);
      await client.query(`ALTER TABLE ${table} ALTER COLUMN ${id} SET DEFAULT nextval('${table}_preview_id')`);
    }
    const result = await require('./import-requested-catalog.cjs')(client);
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ mode: 'isolated rollback preview', ...result, applicationDataChanged: false }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error.message || error.code || 'Database connection could not be established');
    process.exitCode = 1;
  } finally { await client.end(); }
})();
