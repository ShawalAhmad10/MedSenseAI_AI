// Authorized evaluation account/order only. Password comes from stdin; no lead refresh.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {sequelize}=require('../src/config/database');sequelize.options.logging=false;
const User=require('../src/models/User'),jwt=require('jsonwebtoken');
const q=(sql,replacements={},transaction)=>sequelize.query(sql,{replacements,transaction,type:sequelize.QueryTypes.SELECT});
const journalFile=path.resolve(__dirname,'../data/biha-september-order.json');
async function main(){try{
 assert.equal(process.env.DB_SCHEMA,'medsense_app');
 const credential=JSON.parse(fs.readFileSync(0,'utf8'));assert.equal(credential.email,'bihafatima70@gmail.com');
 async function api(url,body,token,method='POST',allowed=[200,201]){
  const res=await fetch('http://127.0.0.1:5005/api'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});
  const value=await res.json();assert.ok(allowed.includes(res.status),`${url}: ${res.status} ${value.message}`);return {status:res.status,value};
 }
 let journal=fs.existsSync(journalFile)?JSON.parse(fs.readFileSync(journalFile,'utf8')):{};
 const existing=await q('SELECT customer_id FROM customer WHERE email=:email',{email:credential.email});
 if(!existing.length)await api('/customer/auth/register',{...credential,name:'Biha Fatima',phone:'00000000000',city:'Evaluation City',address:'Dummy evaluation address (not a real delivery address)'});
 const login=await api('/customer/auth/login',credential);const {customer,token}=login.value.data;
 const date='2026-09-30',at=date+'T07:00:00Z';
 await q('UPDATE customer SET created_at=:at WHERE customer_id=:id AND created_at>:at RETURNING customer_id',{at,id:customer.id});
 const staff=(await User.findAll({attributes:['id','email','role','isActive','isApproved','isEmailVerified']})).find(x=>x.role==='pharmacist'&&x.isActive&&x.isApproved&&x.isEmailVerified);assert.ok(staff);
 const staffToken=jwt.sign({id:staff.id,role:staff.role,email:staff.email},process.env.JWT_SECRET,{expiresIn:'30m'});
 const old=await q('SELECT invoice_id,invoice_number FROM invoice WHERE customer_id=:id ORDER BY invoice_id',{id:customer.id});assert.ok(old.length<=1,'Do not add duplicate Biha orders');
 let orderId=old[0]?.invoice_id,number=old[0]?.invoice_number;
 if(!orderId){
  const [product]=await q(`SELECT p.product_id,p.product_title FROM product p JOIN stock_history h USING(product_id)
   WHERE p.product_status=1 AND h.status=1 AND h.remaining_quantity>=2
   GROUP BY p.product_id ORDER BY min(h.creation_day),p.product_id LIMIT 1`);assert.ok(product);
  const payload={customer_id:customer.id,customer_name:customer.name,customer_phone:customer.phone,customer_email:customer.email,customer_address:customer.address,
   items:[{product_id:product.product_id,product_title:product.product_title,quantity:2,discount:0,tax:0}],payment_method:'cash',delivery_fee:0,discount:0,
   cart_instance_id:'cart-safe-biha-evaluation-20260930',notes:'Evaluation history (generated): Biha order on 2026-09-30; dummy contact details'};
  let order=await api('/orders',payload,token,'POST',[201,409]);
  if(order.status===409){assert.equal(order.value.code,'DDI_REVIEW_PENDING');const id=order.value.data.consultation.consultation_id;
   await api(`/consultations/${id}/decision`,{decision:'approved',guidance:'Evaluation workflow only: simulated review; not patient treatment advice.'},staffToken,'PATCH');
   journal.consultationId=id;order=await api('/orders',{...payload,ddi_consultation_id:id},token);
  }
  orderId=order.value.data.orderId;number=order.value.data.orderNumber;
 }
 journal={...journal,customerId:customer.id,email:credential.email,orderId,number,date,origin:'synthetic_evaluation'};fs.writeFileSync(journalFile,JSON.stringify(journal,null,2));
 await api(`/orders/${orderId}/status`,{delivery_status:'delivered',payment_status:'paid'},staffToken,'PATCH');
 await sequelize.transaction(async transaction=>{
  const batches=await q('SELECT h.creation_day FROM invoice_report r JOIN stock_history h ON h.batch_id=r.batch_id WHERE r.invoice_id=:id',{id:orderId},transaction);
  assert.ok(batches.length&&batches.every(b=>String(b.creation_day)<=date),'Stock must arrive before historical order');
  await q('UPDATE invoice SET invoice_date=:date,created_at=:at,updated_at=:at WHERE invoice_id=:id RETURNING invoice_id',{date,at,id:orderId},transaction);
  await q('UPDATE invoice_report SET created_at=:at,updated_at=:at WHERE invoice_id=:id RETURNING item_id',{at,id:orderId},transaction);
  await q("UPDATE stock_report SET reference_id=:id,transaction_date=:at,created_at=:at WHERE reference_type='INVOICE' AND reference_number=:number RETURNING ledger_id",{at,id:orderId,number},transaction);
  await q("UPDATE customer_ledger SET transaction_date=:at,created_at=:at,updated_at=:at WHERE reference_id=:id AND reference_type IN ('INVOICE','PAYMENT','ORDER_DELIVERED') RETURNING ledger_id",{at,id:orderId},transaction);
  if(journal.consultationId)await q('UPDATE pharmacist_consultations SET created_at=:at,updated_at=:at,responded_at=:at,decision_at=:at,checkout_consumed_at=:at WHERE consultation_id=:id RETURNING consultation_id',{at,id:journal.consultationId},transaction);
  await q("UPDATE pharmacist_consultations SET created_at=:at,updated_at=:at WHERE review_fingerprint=encode(sha256(convert_to(:reference,'UTF8')),'hex') RETURNING consultation_id",{at,reference:'completed-order:'+orderId},transaction);
  await q("UPDATE notifications SET created_at=:at,updated_at=:at WHERE metadata->>'orderId'=:id RETURNING id",{at,id:String(orderId)},transaction);
 });
 const owned=await api('/orders/my-orders?limit=100',null,token,'GET');assert.equal(owned.value.data.orders.length,1);
 const [invoice]=await q('SELECT invoice_id,invoice_number,invoice_date,delivery_status,payment_status,due_amount FROM invoice WHERE invoice_id=:id',{id:orderId});
 assert.equal(String(invoice.invoice_date),'2026-09-30');assert.equal(invoice.delivery_status,'delivered');assert.equal(invoice.payment_status,'paid');assert.equal(Number(invoice.due_amount),0);
 console.log(JSON.stringify({registrationLogin:'PASS',email:customer.email,invoice,customerOrderVisibility:'PASS'}));
 }finally{await sequelize.close();}}
main().catch(e=>{console.error(e.message);process.exitCode=1});
