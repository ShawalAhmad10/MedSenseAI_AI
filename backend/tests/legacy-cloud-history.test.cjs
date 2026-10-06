const test=require('node:test');const assert=require('node:assert/strict');const {sequelize}=require('../src/config/database');const orders=require('../src/controllers/orderController');const invoices=require('../src/controllers/invoiceController');const Invoice=require('../src/models/Invoice');
const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;}});
test('staff history includes archived original cloud invoices without replacing current order IDs',async t=>{let call=0;t.mock.method(sequelize,'query',async(sql,options)=>{assert.match(sql,/i\.status = 1 OR i\.legacy_source_schema IS NOT NULL/);if(call++===0)return[{total:138}];assert.match(sql,/i\.legacy_source_invoice_id/);return[{invoice_id:900100,legacy_source_invoice_id:1,legacy_source_schema:'public',status:0,item_count:0}];});const res=response();await orders.getAllOrders({query:{page:2,limit:100}},res);assert.equal(res.statusCode,200);assert.equal(res.body.data.pagination.totalPages,2);assert.equal(res.body.data.orders[0].invoice_id,900100);assert.equal(res.body.data.orders[0].legacy_source_invoice_id,1);});
test('customer-owned reads keep authenticated ownership filters when history is available',async t=>{t.mock.method(sequelize,'query',async(sql,options)=>{assert.match(sql,/i\.customer_id = :customer_id/);assert.equal(options.replacements.customer_id,82);return sql.includes('COUNT(*) as total')?[{total:0}]:[];});const res=response();await orders.getAllOrders({query:{customer_id:1},customerOrderCustomerId:82},res);assert.equal(res.body.data.orders.length,0);});
test('legacy order status cannot mutate stock, customer accounts or history',async t=>{let rolledBack=false;t.mock.method(sequelize,'transaction',async()=>({rollback:async()=>{rolledBack=true;}}));t.mock.method(sequelize,'query',async sql=>{assert.doesNotMatch(sql.trim(),/^(UPDATE|INSERT|DELETE)\b/i);return[{invoice_id:900100,legacy_source_schema:'public'}];});const res=response();await orders.updateOrderStatus({params:{id:900100},body:{delivery_status:'cancelled'}},res);assert.equal(res.statusCode,409);assert.equal(rolledBack,true);});
test('legacy invoice changes reject before financial effects',async t=>{for(const name of ['updateInvoiceStatus','deleteInvoice']){let rolledBack=false;t.mock.method(sequelize,'transaction',async()=>({rollback:async()=>{rolledBack=true;}}));t.mock.method(Invoice,'findOne',async()=>({invoice_id:900100,legacy_source_schema:'public'}));const res=response();await invoices[name]({params:{id:900100},body:{linkedInvoiceId:900100,customerName:'Historical record',items:[{qty:1}],paymentStatus:'paid'}},res);assert.equal(res.statusCode,409,name);if(name!=='deleteInvoice')assert.equal(rolledBack,true);}});
test('legacy invoice returns roll back before stock or financial writes', async t => {
  let rolledBack = false;
  t.mock.method(sequelize, 'transaction', async callback => {
    try { return await callback({}); }
    catch (error) { rolledBack = true; throw error; }
  });
  t.mock.method(sequelize, 'query', async sql => {
    assert.doesNotMatch(sql.trim(), /^(UPDATE|INSERT|DELETE)\b/i);
    return sql.includes('FROM invoice WHERE') ? [{invoice_id:900100,legacy_source_schema:'public'}] : [];
  });
  const res = response();
  await invoices.createInvoiceReturn({body:{linkedInvoiceId:900100,items:[{productId:1,qty:1}]}},res);
  assert.equal(res.statusCode,409);
  assert.equal(rolledBack,true);
});
