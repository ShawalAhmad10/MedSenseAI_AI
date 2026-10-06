const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const {injectReplacements}=require('sequelize/lib/utils/sql');
const realDialect=require('../src/config/database').sequelize.dialect;
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Karachi'});
function fixture(options={}){
 const writes=[];const invoice={invoice_id:1,customer_id:7,invoice_number:'INV-001',customer_name:'Evaluation customer',customer_phone:null,customer_email:null,
  invoice_date:today,delivery_status:'delivered',payment_status:'paid',...options.invoice};
 const lines=options.lines||[{item_id:11,product_id:101,product_title:'Medicine',batch_id:51,quantity:3,returned_quantity:0,unit_price:8,purchase_price:5}];
 const fake={QueryTypes:{SELECT:'select'},transaction:async fn=>{try{return await fn({})}catch(e){writes.length=0;throw e}},
  query:async(sql,{replacements:r={}})=>{
   assert.doesNotMatch(injectReplacements(sql,realDialect,r),/(?<!:):[A-Za-z]\w*/, 'SQL replacements must resolve before sending to PostgreSQL');
   if(sql.startsWith('SELECT pg_advisory'))return [];
   if(sql.startsWith('SELECT * FROM invoice WHERE'))return [invoice];
   if(sql.startsWith('SELECT return_id'))return options.duplicate?[{return_id:9}]:[];
   if(sql.startsWith('SELECT * FROM invoice_report'))return lines;
   if(sql.includes('MAX(substring'))return [{n:1}];
   if(sql.startsWith('SELECT * FROM stock_history'))return [{batch_id:r.id,remaining_quantity:10}];
   if(sql.startsWith('SELECT * FROM customer_accounts'))return [{account_id:2,current_balance:0}];
   if(sql.startsWith('INSERT INTO invoice_return(')){writes.push({sql,r});return [{return_id:3,return_number:r.number}];}
   if(sql.startsWith('SELECT * FROM invoice_return'))return [{return_id:3,linked_invoice_id:1,return_number:'RET-001',refund_amount:8,refund_status:options.refundStatus||'pending'}];
   if(sql.startsWith('SELECT customer_id FROM invoice'))return [{customer_id:7}];
   writes.push({sql,r});return [];
  }};
 const original=Module._load;
 Module._load=function(id,parent,...args){if(parent?.filename.endsWith('customerOrderReturnService.js')){
  if(id==='../config/database')return {sequelize:fake};if(id==='./marketProductService')return {synchronizeProductStatus:async()=>{}};
 }return original.call(this,id,parent,...args)};
 const target=require.resolve('../src/services/customerOrderReturnService');delete require.cache[target];
 let service;try{service=require(target)}finally{Module._load=original;delete require.cache[target]}
 return {service,writes};
}
const request={customerId:7,invoiceId:1,items:[{productId:101,qty:1,unitPrice:0.01}],description:'Evaluation return'};
test('return uses original sale price/cost, restores original batch, and preserves invoice history',async()=>{
 const {service,writes}=fixture();const result=await service.createReturn(request);
 assert.equal(result.totalRefund,8);assert.equal(result.returnNumber,'RET-001');
 const detail=writes.find(w=>w.sql.startsWith('INSERT INTO invoice_return_report'));assert.equal(detail.r.price,8);assert.equal(detail.r.profit,3);assert.equal(detail.r.bid,51);
 const stock=writes.find(w=>w.sql.startsWith('UPDATE stock_history'));assert.equal(stock.r.id,51);assert.equal(stock.r.qty,11);
 assert.ok(!writes.some(w=>/^UPDATE invoice SET|SET quantity =/.test(w.sql)));
 assert.ok(writes.some(w=>w.sql.includes('returned_quantity = returned_quantity +')));
});
test('multi-batch partial return allocates each original sale line once',async()=>{
 const {service,writes}=fixture({lines:[{item_id:11,product_id:101,product_title:'Medicine',batch_id:51,quantity:2,returned_quantity:0,unit_price:8,purchase_price:5},
  {item_id:12,product_id:101,product_title:'Medicine',batch_id:52,quantity:3,returned_quantity:0,unit_price:10,purchase_price:6}]});
 const result=await service.createReturn({...request,items:[{productId:101,qty:3}]});assert.equal(result.totalRefund,26);
 const details=writes.filter(w=>w.sql.startsWith('INSERT INTO invoice_return_report'));assert.deepEqual(details.map(w=>[w.r.bid,w.r.qty]),[[51,2],[52,1]]);
});
for(const [name,options,items,status] of [
 ['other customer',{invoice:{customer_id:8}},request.items,404],['unpaid invoice',{invoice:{payment_status:'unpaid'}},request.items,400],
 ['undelivered invoice',{invoice:{delivery_status:'pending'}},request.items,400],['expired window',{invoice:{invoice_date:'2026-01-01'}},request.items,400],
 ['duplicate return',{duplicate:true},request.items,409],['excess quantity',{},[{productId:101,qty:4}],400],
 ['foreign product',{},[{productId:999,qty:1}],400],['fractional quantity',{},[{productId:101,qty:0.5}],400],
 ['duplicate lines',{},[{productId:101,qty:1},{productId:101,qty:1}],400],['missing batch',{lines:[{product_id:101,quantity:3,returned_quantity:0}]},request.items,409]
])test(name+' rejects without any stock/account writes',async()=>{
 const {service,writes}=fixture(options);await assert.rejects(service.createReturn({...request,items}),e=>e.status===status);assert.equal(writes.length,0);
});
test('staff refund records the cash payout and settles customer balance',async()=>{
 const {service,writes}=fixture();await service.refundReturn(3,'staff');
 const account=writes.find(w=>w.sql.startsWith('UPDATE customer_accounts'));assert.equal(account.r.amount,8);assert.equal(account.r.balance,8);
 assert.ok(writes.some(w=>w.sql.includes("'REFUND'")));assert.ok(writes.some(w=>w.sql.includes("refund_status='refunded'")));
});
test('retrying an already paid refund never pays or changes accounts twice',async()=>{
 const {service,writes}=fixture({refundStatus:'refunded'});assert.equal((await service.refundReturn(3,'staff')).alreadyRefunded,true);assert.equal(writes.length,0);
});
