require('dotenv').config();
const { sequelize } = require('../src/config/database');
sequelize.options.logging=false;
(async()=>{try{
  const q=sql=>sequelize.query(sql,{type:sequelize.QueryTypes.SELECT});
  console.log('Brands: '+JSON.stringify(await q(`SELECT b.brand_id,b.brand_name,b.status,count(p.product_id)::int products
    FROM brand b LEFT JOIN product p ON p.product_brand=b.brand_id GROUP BY b.brand_id ORDER BY b.brand_id`)));
  console.log('Suppliers: '+JSON.stringify(await q(`SELECT s.supplier_id,s.supplier_name,s.status,
    (SELECT count(*)::int FROM product p WHERE p.product_supplier=s.supplier_id) products,
    (SELECT count(*)::int FROM stock r WHERE r.supplier_id=s.supplier_id) receipts,
    (SELECT count(*)::int FROM supplier_ledger l WHERE l.supplier_id=s.supplier_id) ledgerEntries,
    (SELECT count(*)::int FROM supplier_accounts a WHERE a.supplier_id=s.supplier_id) accounts
    FROM supplier_info s ORDER BY s.supplier_id`)));
}finally{await sequelize.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
