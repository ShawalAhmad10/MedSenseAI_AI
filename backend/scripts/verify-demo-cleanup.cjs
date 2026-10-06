require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { sequelize } = require('../src/config/database');
const { Pharmacist } = require('../src/models');
sequelize.options.logging = false;
(async () => {
  try {
    const totals = (await sequelize.query(`SELECT (SELECT count(*) FROM product)::int products,
      (SELECT count(*) FROM invoice)::int orders,(SELECT count(*) FROM stock_history)::int batches,
      (SELECT count(*) FROM product WHERE product_category='DEMO ONLY' OR product_title ~* '^DEMO ')::int demoProducts,
      (SELECT count(*) FROM invoice_report r LEFT JOIN product p USING(product_id) WHERE p.product_id IS NULL)::int orphanItems`,
      { type: sequelize.QueryTypes.SELECT }))[0];
    assert.equal(totals.demoproducts,0); assert.equal(totals.orphanitems,0);
    const products = await fetch('http://127.0.0.1:5005/api/products?view=storefront');
    assert.equal(products.status,200);
    assert.doesNotMatch(JSON.stringify(await products.json()),/DEMO Product|DEMO ONLY/);
    const staff = (await Pharmacist.findAll()).find(row => row.isActive && (row.role==='admin' || (row.isApproved && row.isEmailVerified)));
    assert.ok(staff);
    const token = jwt.sign({ id: staff.id, role: staff.role },process.env.JWT_SECRET,{ expiresIn:'3m' });
    const headers = { Authorization:`Bearer ${token}` };
    for (const endpoint of ['/invoice?limit=100','/leads?limit=100']) {
      const response = await fetch('http://127.0.0.1:5005/api'+endpoint,{ headers, signal:AbortSignal.timeout(60000) });
      assert.equal(response.status,200,endpoint);
      const body = await response.json();
      if (endpoint.startsWith('/leads')) assert.equal(body.data.leads.length,4);
    }
    console.log(JSON.stringify({ totals, storefront:'PASS',invoiceAPI:'PASS',leadScoring:'PASS',staffAuthentication:'PASS' }));
    const carts = await sequelize.query(`SELECT consultation_id,jsonb_path_query_array(cart_snapshot::jsonb,'$.**.productId') ids,
      jsonb_path_query_array(cart_snapshot::jsonb,'$.**.product_id') snake_ids FROM pharmacist_consultations`,{ type:sequelize.QueryTypes.SELECT });
    const existingProducts = new Set((await sequelize.query('SELECT product_id FROM product',{type:sequelize.QueryTypes.SELECT})).map(row=>Number(row.product_id)));
    assert.ok(carts.every(row=>[...row.ids,...row.snake_ids].every(id=>existingProducts.has(Number(id)))), 'No consultation references a deleted product');
    console.log('Remaining consultation product references: PASS');
  } finally { await sequelize.close(); }
})().catch(error=>{ console.error(error.message);process.exitCode=1; });
