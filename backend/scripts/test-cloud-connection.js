/** Read-only diagnosis of the database configured in backend/.env. */
const path = require('node:path');
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function testConnection() {
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  if (required.some(key => !process.env[key])) {
    console.error('Missing database configuration: ' + required.filter(key => !process.env[key]).join(', '));
    process.exitCode = 1;
    return;
  }
  const schema = process.env.DB_SCHEMA || 'public';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error('Invalid DB_SCHEMA');
  const db = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432, dialect: 'postgres', logging: false,
    dialectOptions: { options: `-c search_path=${schema}`, connectionTimeoutMillis: 15000,
      ...(process.env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } } : {}) },
    pool: { max: 1, min: 0, acquire: 15000 },
    retry: { max: 0 }
  });
  let schemaReady = true;
  let dataReady = true;
  try {
    console.log('\nCLOUD DATABASE CONNECTION TEST (read only)\n');
    await db.authenticate();
    console.log('[PASS] Database connection');
    console.log('Application schema: ' + schema);
    const active = await db.query('SELECT current_schema() AS schema', { type: QueryTypes.SELECT });
    if (active[0].schema !== schema) throw new Error('Configured schema is unavailable or search_path was not applied');
    const tables = await db.query("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = :schema", { replacements: { schema }, type: QueryTypes.SELECT });
    console.log(`Tables/views found: ${tables.length} (count alone does not confirm schema compatibility)`);
    for (const [table, label] of [['product', 'Products'], ['invoice', 'Orders'], ['users', 'Users']]) {
      if (!tables.some(row => row.table_name === table)) {
        console.log(`[FAIL] Missing table: ${table}`); schemaReady = false; dataReady = false; continue;
      }
      const object = tables.find(row => row.table_name === table);
      console.log(`${table}: ${object.table_type}`);
      const rows = await db.query(`SELECT COUNT(*) AS count FROM "${schema}"."${table}"`, { type: QueryTypes.SELECT });
      const count = Number(rows[0].count);
      console.log(`${label}: ${count}`);
      if (count === 0) {
        console.log(`[EMPTY] No ${label.toLowerCase()} in this database`);
        if (table !== 'invoice') dataReady = false;
      }
    }
    const columns = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = :schema AND table_name = 'product'", { replacements: { schema }, type: QueryTypes.SELECT });
    const expected = ['product_id', 'product_title', 'product_price', 'product_category'];
    const missing = expected.filter(name => !columns.some(column => column.column_name === name));
    if (missing.length) {
      schemaReady = false;
      console.log('[FAIL] Product columns required by this backend are missing: ' + missing.join(', '));
    }
    const primaryKey = columns.find(column => column.column_name === 'product_id');
    if (primaryKey && primaryKey.data_type !== 'integer') {
      schemaReady = false;
      console.log(`[FAIL] product.product_id is ${primaryKey.data_type}; this backend requires integer IDs. Its migrations cannot be used on this schema.`);
    }
    if (!missing.length) {
      const products = await db.query(`SELECT product_id, product_title, product_price, product_category FROM "${schema}".product ORDER BY product_id LIMIT 5`, { type: QueryTypes.SELECT });
      for (const product of products) console.log(`- ${product.product_title} (${product.product_category}) - Rs. ${product.product_price}`);
      if (!products.length) console.log('No sample products to display.');
    }
    console.log('\nConnection: PASS');
    console.log(`Backend schema: ${schemaReady ? 'Checked product columns match' : 'INCOMPATIBLE - use a database matching this project before running migrations'}`);
    console.log(`Products/users: ${dataReady ? 'Present' : 'EMPTY - existing local data has not been confirmed in this cloud database'}`);
    if (schema === 'medsense_app') {
      const historical = await db.query('SELECT COUNT(*) AS count FROM invoice WHERE legacy_source_schema IS NOT NULL', { type: QueryTypes.SELECT });
      console.log('Previous cloud invoices visible in application: ' + Number(historical[0].count));
    }
    console.log('No data was imported or changed by this test.');
    if (!schemaReady || !dataReady) process.exitCode = 1;
  } catch (error) {
    console.error('[FAIL] ' + error.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
if (require.main === module && !process.env.NODE_TEST_CONTEXT) testConnection();
module.exports = { testConnection };
