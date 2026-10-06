require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { sequelize } = require('../src/config/database');
const desired = require('../data/requested-business-directory.json');
sequelize.options.logging=false;
const addOnly = process.argv.includes('--add-unlinked-names');
const unlink = process.argv.includes('--unlink-approved');
const deleteFinancial = process.argv.includes('--delete-approved-financial-history');
if (!addOnly && !unlink && !process.argv.includes('--preserve-approved-links')) throw new Error('Run linked-name replacements only after user approval');
(async()=>{
  const transaction = await sequelize.transaction();
  const q = (sql,replacements={})=>sequelize.query(sql,{type:sequelize.QueryTypes.SELECT,transaction,replacements});
  try {
    await q('LOCK TABLE brand,supplier_info,product,stock,stock_return,supplier_accounts,supplier_ledger IN SHARE ROW EXCLUSIVE MODE');
    const brands = await q('SELECT * FROM brand ORDER BY brand_id');
    const suppliers = await q('SELECT * FROM supplier_info ORDER BY supplier_id');
    assert.ok(brands.every(row=>desired.brands.includes(row.brand_name)||row.brand_name==='GSK'),'Unexpected brand; no changes committed');
    assert.ok(suppliers.every(row=>desired.suppliers.includes(row.supplier_name)||row.supplier_name==='MedesenseAI'),'Unexpected supplier; no changes committed');
    const protectedTables = ['product','stock','stock_history','stock_return','supplier_accounts','supplier_ledger'];
    const before = {};
    const savedRows = {};
    for (const table of protectedTables) {
      before[table] = (await q(`SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) checksum FROM ${table} t`))[0].checksum;
      savedRows[table] = await q(`SELECT * FROM ${table}`);
    }
    const directory = path.resolve(__dirname,'../../database/cloud-migration-business-directory-'+new Date().toISOString().replaceAll(/[:.]/g,'-'));
    fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,'directory-before.json'),JSON.stringify({brands,suppliers,tables:savedRows}));
    // Reuse the existing identities so historical product, receipt and account links do not change.
    if (!addOnly && !unlink) {
      await q("UPDATE brand SET brand_name='GSK Pakistan',status=1,updated_at=NOW() WHERE brand_name='GSK'");
      await q("UPDATE supplier_info SET supplier_name='MedSenseAI_Traders',status=1,updated_at=NOW() WHERE supplier_name='MedesenseAI'");
    }
    for (const name of desired.brands.filter(name=>!addOnly||name!=='GSK Pakistan')) {
      await q(`INSERT INTO brand(brand_name,status,created_at,updated_at)
        SELECT :name,1,NOW(),NOW() WHERE NOT EXISTS(SELECT 1 FROM brand WHERE brand_name=:name)`,{name});
    }
    for (const name of desired.suppliers.filter(name=>!addOnly||name!=='MedSenseAI_Traders')) {
      await q(`INSERT INTO supplier_info(supplier_name,supplier_city,supplier_contact,status,created_at,updated_at)
        SELECT :name,NULL,NULL,1,NOW(),NOW() WHERE NOT EXISTS(SELECT 1 FROM supplier_info WHERE supplier_name=:name)`,{name});
    }
    const oldBrandIds=brands.filter(row=>row.brand_name==='GSK').map(row=>row.brand_id);
    const oldSupplierIds=suppliers.filter(row=>row.supplier_name==='MedesenseAI').map(row=>row.supplier_id);
    const changes = {};
    if (unlink) {
      if (oldBrandIds.length) {
        changes.unlinkedProductBrands=(await q('UPDATE product SET product_brand=NULL WHERE product_brand IN(:ids) RETURNING product_id',{ids:oldBrandIds})).length;
        await q('DELETE FROM brand WHERE brand_id IN(:ids)',{ids:oldBrandIds});
      }
      if (oldSupplierIds.length) {
        changes.unlinkedProductSuppliers=(await q('UPDATE product SET product_supplier=NULL WHERE product_supplier IN(:ids) RETURNING product_id',{ids:oldSupplierIds})).length;
        changes.unlinkedReceipts=(await q('UPDATE stock SET supplier_id=NULL WHERE supplier_id IN(:ids) RETURNING stock_id',{ids:oldSupplierIds})).length;
        await q('UPDATE stock_return SET supplier_id=NULL WHERE supplier_id IN(:ids)',{ids:oldSupplierIds});
        if (deleteFinancial) {
          changes.deletedLedgerEntries=(await q('DELETE FROM supplier_ledger WHERE supplier_id IN(:ids) RETURNING ledger_number',{ids:oldSupplierIds})).length;
          changes.deletedSupplierAccounts=(await q('DELETE FROM supplier_accounts WHERE supplier_id IN(:ids) RETURNING supplier_account_id',{ids:oldSupplierIds})).length;
          await q('DELETE FROM supplier_info WHERE supplier_id IN(:ids)',{ids:oldSupplierIds});
        }
      }
    }
    const currentBrands = (await q('SELECT brand_name FROM brand')).map(row=>row.brand_name);
    const currentSuppliers = (await q('SELECT supplier_name FROM supplier_info')).map(row=>row.supplier_name);
    const expectedBrands=addOnly ? desired.brands.map(name=>name==='GSK Pakistan'?'GSK':name) : desired.brands;
    const expectedSuppliers=addOnly ? desired.suppliers.map(name=>name==='MedSenseAI_Traders'?'MedesenseAI':name)
      : unlink && !deleteFinancial && oldSupplierIds.length ? [...desired.suppliers,'MedesenseAI'] : desired.suppliers;
    assert.deepEqual(currentBrands.sort(),[...expectedBrands].sort());
    assert.deepEqual(currentSuppliers.sort(),[...expectedSuppliers].sort());
    for (const table of protectedTables) {
      if (!unlink || table==='stock_history') {
        assert.equal((await q(`SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) checksum FROM ${table} t`))[0].checksum,before[table],`${table} must remain unchanged`);
      } else {
        const expected=savedRows[table].filter(row=>!(deleteFinancial && ['supplier_accounts','supplier_ledger'].includes(table) && oldSupplierIds.includes(row.supplier_id)))
          .map(row=>{
            const copy={...row};
            if (table==='product') {
              if(oldBrandIds.includes(copy.product_brand))copy.product_brand=null;
              if(oldSupplierIds.includes(copy.product_supplier))copy.product_supplier=null;
            }
            if(['stock','stock_return'].includes(table) && oldSupplierIds.includes(copy.supplier_id))copy.supplier_id=null;
            return copy;
          });
        const normalize=rows=>rows.map(row=>JSON.stringify(row)).sort();
        assert.deepEqual(normalize(await q(`SELECT * FROM ${table}`)),normalize(expected),`${table}: only approved changes allowed`);
      }
    }
    await transaction.commit();
    console.log(JSON.stringify({brands:currentBrands.length,suppliers:currentSuppliers.length,exactNames:addOnly?'2 linked-name replacements pending':unlink&&!deleteFinancial?'Old supplier finance decision pending':'PASS',changes,stockQuantities:'UNCHANGED',backup:directory}));
  } catch(error){await transaction.rollback();throw error;}
  finally{await sequelize.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1});
