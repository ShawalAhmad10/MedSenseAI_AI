const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = require('../data/requested-business-directory.json');
const categories = require('../data/requested-categories.json');
const { products, skipped } = require('../data/requested-products.json');

module.exports = async function importCatalog(client, options = {}) {
  const q=(sql,params)=>client.query(sql,params);
  const removedOldSupplierFinances = { ledgerRecords: 0, accounts: 0 };
  // The old supplier's stock-ledger rows were removed with the explicitly approved old stock.
  const oldSuppliers=(await q('SELECT supplier_id FROM supplier_info WHERE NOT(supplier_name=ANY($1::text[]))',[directory.suppliers])).rows.map(row=>row.supplier_id);
  if(oldSuppliers.length) {
    const ledgerCount = (await q('SELECT count(*)::int n FROM supplier_ledger WHERE supplier_id=ANY($1::int[])',[oldSuppliers])).rows[0].n;
    const accountCount = (await q('SELECT count(*)::int n FROM supplier_accounts WHERE supplier_id=ANY($1::int[])',[oldSuppliers])).rows[0].n;
    if (ledgerCount || accountCount) {
      assert.equal(options.deleteOldSupplierFinances, true, 'Separate approval is required for the old supplier financial records');
      removedOldSupplierFinances.ledgerRecords = (await q('DELETE FROM supplier_ledger WHERE supplier_id=ANY($1::int[])',[oldSuppliers])).rowCount;
      removedOldSupplierFinances.accounts = (await q('DELETE FROM supplier_accounts WHERE supplier_id=ANY($1::int[])',[oldSuppliers])).rowCount;
    }
    await q('DELETE FROM supplier_info WHERE supplier_id=ANY($1::int[])',[oldSuppliers]);
  }
  await q('DELETE FROM brand WHERE NOT(brand_name=ANY($1::text[]))',[directory.brands]);
  await q(`INSERT INTO brand(brand_name,status,created_at,updated_at)
    SELECT name,1,NOW(),NOW() FROM unnest($1::text[]) name
    WHERE NOT EXISTS(SELECT 1 FROM brand b WHERE b.brand_name=name)`,[directory.brands]);
  await q(`INSERT INTO supplier_info(supplier_name,supplier_city,supplier_contact,status,created_at,updated_at)
    SELECT name,NULL,NULL,1,NOW(),NOW() FROM unnest($1::text[]) name
    WHERE NOT EXISTS(SELECT 1 FROM supplier_info s WHERE s.supplier_name=name)`,[directory.suppliers]);
  await q(fs.readFileSync(path.resolve(__dirname,'../migrations/20261002_requested_catalog_rules.sql'),'utf8'));
  await q('DELETE FROM medicine_categories WHERE NOT(category_name=ANY($1::text[]))',[categories]);
  await q('UPDATE medicine_categories SET status=1 WHERE category_name=ANY($1::text[])',[categories]);
  await q('DELETE FROM medicine_supplier_bindings WHERE NOT EXISTS(SELECT 1 FROM product p WHERE p.medicine_supply_key=medicine_supplier_bindings.medicine_key)');
  for(const row of products) {
    assert.ok(directory.brands.includes(row.brand));
    assert.ok(directory.suppliers.includes(row.supplier));
    assert.ok(categories.includes(row.category));
  }
  const inserted=await q(`INSERT INTO product(product_title,product_generic_name,product_salt,product_category,product_brand,
    product_supplier,product_price,product_purchase_price,product_pack_price,product_pack_size,product_pack_description,
    product_min_threshold,product_discount,product_requires_rx,product_status,created_by,archived,manually_inactive)
    SELECT r.title,r.salt,r.salt,r.category,b.brand_id,s.supplier_id,r.price,NULL,r."packPrice",r."packSize",r."packDescription",
      r."minThreshold",r.discount,r."requiresRx",0,'User catalog import',false,false
    FROM jsonb_to_recordset($1::jsonb) AS r(title text,salt text,category text,brand text,supplier text,price numeric,
      "packPrice" numeric,"packSize" integer,"packDescription" text,"minThreshold" integer,discount numeric,"requiresRx" boolean)
    JOIN brand b ON b.brand_name=r.brand JOIN supplier_info s ON s.supplier_name=r.supplier RETURNING product_id,product_title`,[JSON.stringify(products)]);
  assert.equal(inserted.rowCount,67);
  // Both supplied Piriton names refer to one 120ml medicine and one supplier.
  await q(`UPDATE product SET fifo_family_id=(SELECT MIN(product_id) FROM product WHERE product_title IN('Piriton','Piriton 120ml'))
    WHERE product_title IN('Piriton','Piriton 120ml')`);
  assert.equal((await q(`SELECT count(*)::int n FROM (SELECT medicine_supply_key FROM product GROUP BY medicine_supply_key
    HAVING count(DISTINCT product_supplier)>1) conflicts`)).rows[0].n,0);
  assert.equal((await q('SELECT count(*)::int n FROM product WHERE product_brand IS NULL OR product_supplier IS NULL')).rows[0].n,0);
  assert.equal((await q('SELECT count(*)::int n FROM stock_history')).rows[0].n,0);
  const report={importedProducts:inserted.rowCount,skippedProducts:skipped.length,categories:categories.length,
    brands:(await q('SELECT count(*)::int n FROM brand')).rows[0].n,suppliers:(await q('SELECT count(*)::int n FROM supplier_info')).rows[0].n,
    stock:'zero; no stock quantity or purchase cost was supplied', removedOldSupplierFinances};
  assert.equal(report.brands,20);assert.equal(report.suppliers,5);
  report.verifiedRules = await require('./assert-requested-catalog.cjs')(client);
  return report;
};
