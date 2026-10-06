// Appends the approved attachment without changing existing products, orders or stock.
// Default invocation runs a rollback preview; --apply saves after all checks pass.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const directory = require('../data/requested-business-directory.json');
const categories = require('../data/requested-categories.json');
const { products, skipped } = require('../data/additional-products-101-150.json');
const apply = process.argv.includes('--apply');
if (process.env.DB_SCHEMA !== 'medsense_app') throw new Error('Expected the verified account database schema');
const client = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }, connectionTimeoutMillis: 15000 });
const q = (sql, values) => client.query(sql, values);
const fields = { product_title:'title', product_salt:'salt', product_generic_name:'salt', product_category:'category',
  product_pack_description:'packDescription', product_requires_rx:'requiresRx' };
const numericFields = { product_price:'price', product_pack_price:'packPrice', product_pack_size:'packSize',
  product_min_threshold:'minThreshold', product_discount:'discount' };
function assertMatch(actual, expected, brandId, supplierId) {
  assert.equal(actual.product_brand, brandId, `Brand mismatch: ${expected.title}`);
  assert.equal(actual.product_supplier, supplierId, `Supplier mismatch: ${expected.title}`);
  for (const [column, field] of Object.entries(fields)) assert.equal(actual[column], expected[field], `${column}: ${expected.title}`);
  for (const [column, field] of Object.entries(numericFields)) assert.equal(Number(actual[column]), expected[field], `${column}: ${expected.title}`);
}
async function preservedRows() {
  return (await q(`SELECT
    (SELECT md5(COALESCE(string_agg(to_jsonb(i)::text,'' ORDER BY invoice_id),'')) FROM invoice i) invoices,
    (SELECT md5(COALESCE(string_agg(to_jsonb(h)::text,'' ORDER BY batch_id),'')) FROM stock_history h) batches,
    (SELECT md5(COALESCE(string_agg(to_jsonb(u)::text,'' ORDER BY id),'')) FROM users u) staff,
    (SELECT md5(COALESCE(string_agg(to_jsonb(c)::text,'' ORDER BY customer_id),'')) FROM customer c) customers`)).rows[0];
}
(async () => {
  let backupDirectory;
  try {
    assert.equal(products.length + skipped.length, 50);
    for (const row of products) {
      assert.ok(directory.brands.includes(row.brand), `Unknown brand: ${row.brand}`);
      assert.ok(directory.suppliers.includes(row.supplier), `Unknown supplier: ${row.supplier}`);
      assert.ok(categories.includes(row.category), `Unresolved category: ${row.title}`);
    }
    await client.connect();
    await q('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await q('SET LOCAL search_path=medsense_app');
    await q("SET LOCAL lock_timeout='15s'");
    await q('LOCK TABLE brand,invoice,medicine_categories,medicine_supplier_bindings,product,stock_history,supplier_info IN SHARE ROW EXCLUSIVE MODE');
    const beforeProducts = (await q('SELECT * FROM product ORDER BY product_id')).rows;
    const beforeChecksums = (await q('SELECT product_id,md5(to_jsonb(p)::text) checksum FROM product p ORDER BY product_id')).rows;
    const beforeCategories = (await q('SELECT * FROM medicine_categories ORDER BY display_order')).rows;
    const preserved = await preservedRows();
    const brands = (await q('SELECT brand_id,brand_name,status FROM brand')).rows;
    const suppliers = (await q('SELECT supplier_id,supplier_name,status FROM supplier_info')).rows;
    assert.deepEqual(brands.map(row => row.brand_name).sort(), [...directory.brands].sort());
    assert.deepEqual(suppliers.map(row => row.supplier_name).sort(), [...directory.suppliers].sort());
    const pending = [];
    let alreadyPresent = 0;
    for (const row of products) {
      const brand = brands.find(master => master.brand_name === row.brand && master.status === 1);
      const supplier = suppliers.find(master => master.supplier_name === row.supplier && master.status === 1);
      assert.ok(brand && supplier, `Brand/supplier must be active: ${row.title}`);
      const existing = beforeProducts.filter(p => p.product_title?.trim().toLowerCase() === row.title.toLowerCase());
      if (existing.length) {
        assert.equal(existing.length, 1, `Ambiguous existing title: ${row.title}`);
        assert.equal(existing[0].archived, false, `Archived existing title: ${row.title}`);
        assertMatch(existing[0], row, brand.brand_id, supplier.supplier_id);
        alreadyPresent += 1;
      } else pending.push(row);
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'rollback-preview', existingProducts: beforeProducts.length,
      newProducts: pending.length, alreadyPresent, skipped: skipped.length, totalAfter: beforeProducts.length + pending.length }));
    if (apply && pending.length) {
      backupDirectory = path.resolve(__dirname, '../../database/cloud-migration-add-products-' + new Date().toISOString().replaceAll(/[:.]/g,'-'));
      fs.mkdirSync(backupDirectory, { recursive: true });
      fs.writeFileSync(path.join(backupDirectory, 'catalog-before.json'), JSON.stringify({
        createdAt: new Date().toISOString(), schema: 'medsense_app', products: beforeProducts,
        categories: beforeCategories, preservedChecksums: preserved,
      }));
      console.log('Backup saved: ' + backupDirectory);
    }
    await q(`INSERT INTO medicine_categories(category_name,display_order,status)
      SELECT category_name,ordinality,1 FROM unnest($1::text[]) WITH ORDINALITY AS c(category_name,ordinality)
      ON CONFLICT(category_name) DO NOTHING`, [categories]);
    assert.deepEqual((await q('SELECT category_name FROM medicine_categories WHERE status=1 ORDER BY display_order')).rows
      .map(row => row.category_name), categories);
    const inserted = await q(`INSERT INTO product(product_title,product_generic_name,product_salt,product_category,product_brand,
      product_supplier,product_price,product_purchase_price,product_pack_price,product_pack_size,product_pack_description,
      product_min_threshold,product_discount,product_requires_rx,product_status,created_by,archived,manually_inactive)
      SELECT r.title,r.salt,r.salt,r.category,b.brand_id,s.supplier_id,r.price,NULL,r."packPrice",r."packSize",r."packDescription",
        r."minThreshold",r.discount,r."requiresRx",0,'User catalog import',false,false
      FROM jsonb_to_recordset($1::jsonb) AS r(title text,salt text,category text,brand text,supplier text,price numeric,
        "packPrice" numeric,"packSize" integer,"packDescription" text,"minThreshold" integer,discount numeric,"requiresRx" boolean)
      JOIN brand b ON b.brand_name=r.brand JOIN supplier_info s ON s.supplier_name=r.supplier RETURNING *`, [JSON.stringify(pending)]);
    assert.equal(inserted.rowCount, pending.length);
    for (const expected of pending) {
      const actual = inserted.rows.find(row => row.product_title === expected.title);
      assert.ok(actual);
      assertMatch(actual, expected, brands.find(row => row.brand_name === expected.brand).brand_id,
        suppliers.find(row => row.supplier_name === expected.supplier).supplier_id);
      assert.equal(actual.product_purchase_price, null);
      assert.equal(actual.product_status, 0);
      assert.ok(actual.medicine_supply_key);
    }
    assert.deepEqual((await q(`SELECT product_id,md5(to_jsonb(p)::text) checksum FROM product p
      WHERE product_id=ANY($1::int[]) ORDER BY product_id`, [beforeProducts.map(row => row.product_id)])).rows, beforeChecksums,
      'Existing products must not change');
    assert.deepEqual(await preservedRows(), preserved, 'Existing orders, stock and login accounts must not change');
    const totalProducts = (await q('SELECT count(*)::int count FROM product')).rows[0].count;
    assert.equal(totalProducts, beforeProducts.length + inserted.rowCount);
    assert.equal((await q(`SELECT count(*)::int n FROM (SELECT medicine_supply_key FROM product WHERE NOT archived
      GROUP BY medicine_supply_key HAVING count(DISTINCT product_supplier)>1) conflicts`)).rows[0].n, 0);
    await q(apply ? 'COMMIT' : 'ROLLBACK');
    const report = { committed: apply, importedProducts: inserted.rowCount, alreadyPresent, skipped: skipped.length,
      totalProducts, categories: categories.length, brands: brands.length, suppliers: suppliers.length,
      stock: 'New products have zero stock; purchase cost was not supplied',
      checks: 'Product values and preserved existing products/orders/stock/login accounts verified' };
    if (backupDirectory) fs.writeFileSync(path.join(backupDirectory, 'import-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } catch (error) {
    await q('ROLLBACK').catch(() => {});
    console.error(error.message || error.code || 'Database connection could not be established');
    process.exitCode = 1;
  } finally { await client.end(); }
})();
