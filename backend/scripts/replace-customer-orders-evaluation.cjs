// User-authorized evaluation history. Passwords are read from stdin and never persisted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {sequelize}=require('../src/config/database');sequelize.options.logging=false;
const jwt=require('jsonwebtoken'),User=require('../src/models/User');
const apply=process.argv.includes('--apply');
const journalPath=path.resolve(__dirname,'../data/customer-orders-evaluation-progress.json');
const q=(sql,replacements={},transaction)=>sequelize.query(sql,{replacements,transaction,type:sequelize.QueryTypes.SELECT});
const stamp=date=>`${date}T07:00:00.000Z`;
async function api(url,body,token,method='POST',allowed=[200,201]){
 const res=await fetch('http://127.0.0.1:5005/api'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});
 const json=await res.json();if(!allowed.includes(res.status))throw new Error(`${method} ${url}: ${res.status} ${json.message||json.code}`);
 return {status:res.status,json};
}
function save(journal){fs.writeFileSync(journalPath,JSON.stringify(journal,null,2));}
async function main(){
 assert.equal(process.env.DB_SCHEMA,'medsense_app');
 const credentials=apply?JSON.parse(fs.readFileSync(0,'utf8')):null;
 let journal=fs.existsSync(journalPath)?JSON.parse(fs.readFileSync(journalPath,'utf8')):null;
 if(!journal){
  const counts={};for(const table of ['customer','invoice','customer_prescriptions','customer_subscriptions','stock','stock_history'])counts[table]=(await q(`SELECT count(*)::int n FROM ${table}`))[0].n;
  assert.equal(counts.customer_subscriptions,0,'Do not reset accounts with active external billing');
  const profiles=await q('SELECT customer_name,email,phone,customer_city,address FROM customer');
  console.log(JSON.stringify({mode:apply?'APPLY':'READ-ONLY PREVIEW',oldCounts:counts,newCustomers:3,newOrders:50,split:[30,10,10],range:['2026-07-01','2026-10-03']}));
  if(!apply)return;
  const backup=path.resolve(__dirname,'../../database','cloud-migration-customer-orders-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(backup);
  const tables=['customer','customer_accounts','customer_ledger','customer_prescriptions','customer_refill_reminders','pharmacist_consultations','invoice','invoice_report',
   'stock_history','stock_report','storefront_checkout_idempotency','notifications','storefront_funnel_events','funnel_outbox'];
  const snapshots={};
  await sequelize.transaction(async transaction=>{
   await q('SELECT pg_advisory_xact_lock(44201,17001)',{},transaction);
   for(const table of tables){await q(`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE`,{},transaction);snapshots[table]=await q(`SELECT * FROM ${table}`,{},transaction);}
   for(const t of ['invoice_return_report','invoice_return']){const [exists]=await q('SELECT to_regclass(:name) name',{name:'medsense_app.'+t},transaction);if(exists.name){snapshots[t]=await q(`SELECT * FROM ${t}`,{},transaction);}}
   fs.writeFileSync(path.join(backup,'before.json'),JSON.stringify(snapshots,null,2),{flag:'wx'});
   // Restore only inventory movements belonging to removed customer invoices/returns.
   await q(`UPDATE stock_history h SET remaining_quantity=h.remaining_quantity-x.net FROM
    (SELECT batch_id,sum(quantity_change)::int net FROM stock_report WHERE reference_type IN ('INVOICE','INVOICE_RETURN') GROUP BY batch_id) x
    WHERE h.batch_id=x.batch_id RETURNING h.batch_id`,{},transaction);
   await q("DELETE FROM stock_report WHERE reference_type IN ('INVOICE','INVOICE_RETURN')",{},transaction);
   await q("DELETE FROM notifications WHERE type='new_order' OR metadata ? 'orderId' OR title LIKE 'DDI flag%'",{},transaction);
   for(const t of ['funnel_outbox','storefront_funnel_events','storefront_checkout_idempotency','pharmacist_consultations','customer_refill_reminders','customer_prescriptions',
     ...(['invoice_return_report','invoice_return'].filter(t=>snapshots[t])), 'invoice_report','customer_ledger','customer_accounts','invoice','customer'])await q(`DELETE FROM ${t}`,{},transaction);
   await q(fs.readFileSync(path.resolve(__dirname,'../migrations/20261003_customer_order_returns.sql'),'utf8'),{},transaction);
   const [sequence]=await q("SELECT pg_get_serial_sequence('invoice','invoice_id') name",{},transaction);
   assert.match(sequence.name,/^[a-zA-Z0-9_.]+$/);await q(`ALTER SEQUENCE ${sequence.name} RESTART WITH 1`,{},transaction);
  });
  journal={version:1,origin:'synthetic_evaluation',backup,profiles,customers:[],orders:[],returns:[],resetAt:new Date().toISOString()};save(journal);
  console.log('Backup and old customer/order reset complete; stock receipts and supplier history preserved.');
 }
 if(!apply)return;
 assert.equal(credentials.length,3);
 const staff=(await User.findAll({attributes:['id','email','role','isActive','isApproved','isEmailVerified']})).find(s=>s.role==='pharmacist'&&s.isActive&&s.isApproved&&s.isEmailVerified);assert.ok(staff);
 const staffToken=jwt.sign({id:staff.id,role:staff.role,email:staff.email},process.env.JWT_SECRET,{expiresIn:'4h'});
 const tokens=[];
 for(let i=0;i<3;i++){
  const credential=credentials[i];
  let customer=journal.customers[i];
  if(!customer){
   const existing=journal.profiles.find(p=>p.email===credential.email)||journal.profiles.find(p=>i===2&&p.customer_name==='Shawal Ahmad');
   const payload={name:['Iman Fatima','Amna Rana','Shawal Ahmad'][i],email:credential.email,password:credential.password,
    phone:existing?.phone||'03001234567',city:existing?.customer_city||'Lahore',address:existing?.address||'Evaluation address, Lahore'};
   const registered=await api('/customer/auth/register',payload);customer=registered.json.data.customer;
   await q("UPDATE customer SET created_at='2026-07-01T06:00:00Z' WHERE customer_id=:id RETURNING customer_id",{id:customer.id});
   journal.customers.push(customer);save(journal);
  }
  const login=await api('/customer/auth/login',credential);assert.equal(login.json.data.customer.id,customer.id);
  tokens.push(login.json.data.token);
 }
 console.log('All 3 customer registrations and actual logins PASS.');
 const pool=await q(`SELECT p.product_id,p.product_title,p.product_salt,min(h.creation_day)::text arrival
  FROM product p JOIN stock_history h USING(product_id) WHERE h.remaining_quantity>=10 AND h.status=1 AND p.product_status=1
  AND p.product_title<>'Piriton 120ml' GROUP BY p.product_id ORDER BY min(h.creation_day),p.product_id`);
 assert.ok(pool.length>20);
 for(let index=journal.orders.length;index<50;index++){
  const n=index+1,cidx=index%5<3?0:index%5===3?1:2,customer=journal.customers[cidx];
  const date=new Date(Date.UTC(2026,6,1)+Math.floor(index*94/49)*86400000).toISOString().slice(0,10);
  const available=pool.filter(p=>p.arrival<=date);assert.ok(available.length);
  let chosen=[available[index%available.length]];
  if(n%3===0&&available.length>1){chosen.push(available[(index+7)%available.length]);chosen=[...new Map(chosen.map(p=>[p.product_id,p])).values()];}
  if(n%10===0){const pair=['Claritek XL 500mg','Lipiget 20mg'].map(name=>available.find(p=>p.product_title===name));if(pair.every(Boolean))chosen=pair;}
  const items=chosen.map(p=>({product_id:p.product_id,product_title:p.product_title,quantity:2+(index%4),discount:0,tax:0}));
  const payload={customer_id:customer.id,customer_name:customer.name,customer_phone:customer.phone,customer_email:customer.email,
   customer_address:customer.address,items,payment_method:'cash',delivery_fee:0,discount:0,
   cart_instance_id:'cart-safe-evaluation-'+String(n).padStart(12,'0'),notes:`Evaluation history (generated): order ${n}, purchase date ${date}`};
  let result=await api('/orders',payload,tokens[cidx],'POST',[201,409]);let consultationId=null;
  if(result.status===409){
   assert.equal(result.json.code,'DDI_REVIEW_PENDING',JSON.stringify(result.json));
   consultationId=result.json.data.consultation.consultation_id;
   assert.ok(consultationId);
   // Simulated evaluation decision, explicitly labelled, never represented as clinical guidance.
   await api(`/consultations/${consultationId}/decision`,{decision:'approved',guidance:'Evaluation workflow only: simulated pharmacist review of the displayed DDI. This is not patient treatment advice.'},staffToken,'PATCH');
   result=await api('/orders',{...payload,ddi_consultation_id:consultationId},tokens[cidx]);
  }
  const orderId=result.json.data.orderId;assert.equal(orderId,n,'Order IDs must be exactly 1 through 50');assert.equal(result.json.data.orderNumber,'INV-'+String(n).padStart(3,'0'));
  await api(`/orders/${orderId}/status`,{delivery_status:'delivered',payment_status:'paid'},staffToken,'PATCH');
  await sequelize.transaction(async transaction=>{
   const rows=await q('SELECT h.creation_day FROM invoice_report r JOIN stock_history h ON h.batch_id=r.batch_id WHERE r.invoice_id=:id',{id:orderId},transaction);
   assert.ok(rows.every(r=>String(r.creation_day)<=date),'Do not create a historical sale before stock arrival');
   await q('UPDATE invoice SET invoice_date=:date,created_at=:at,updated_at=:at WHERE invoice_id=:id RETURNING invoice_id',{date,at:stamp(date),id:orderId},transaction);
   await q('UPDATE invoice_report SET created_at=:at,updated_at=:at WHERE invoice_id=:id RETURNING item_id',{at:stamp(date),id:orderId},transaction);
   await q("UPDATE stock_report SET reference_id=:id,transaction_date=:at,created_at=:at WHERE reference_type='INVOICE' AND reference_number=:number RETURNING ledger_id",{at:stamp(date),id:orderId,number:result.json.data.orderNumber},transaction);
   await q("UPDATE customer_ledger SET transaction_date=:at,created_at=:at,updated_at=:at WHERE reference_id=:id AND reference_type IN ('INVOICE','PAYMENT','ORDER_DELIVERED') RETURNING ledger_id",{at:stamp(date),id:orderId},transaction);
   if(consultationId)await q('UPDATE pharmacist_consultations SET created_at=:at,updated_at=:at,responded_at=:at,decision_at=:at,checkout_consumed_at=:at WHERE consultation_id=:id RETURNING consultation_id',{at:stamp(date),id:consultationId},transaction);
  });
  journal.orders.push({id:orderId,number:result.json.data.orderNumber,date,customerId:customer.id,items,consultationId});save(journal);
  console.log(JSON.stringify({completedOrders:n,date,customer:customer.name,consultation:consultationId}));
 }
 // Six small returns, two per customer, on recent deliveries within the real 14-day return window.
 for(let cidx=0;cidx<3;cidx++){
  const customer=journal.customers[cidx];const candidates=journal.orders.filter(o=>o.customerId===customer.id&&o.date>='2026-09-19').slice(-2);
  assert.equal(candidates.length,2);
  for(const order of candidates){if(journal.returns.some(r=>r.orderId===order.id))continue;
   const [line]=await q('SELECT * FROM invoice_report WHERE invoice_id=:id ORDER BY item_id LIMIT 1',{id:order.id});
   const before=(await q('SELECT remaining_quantity FROM stock_history WHERE batch_id=:id',{id:line.batch_id}))[0];
   const returned=await api('/invoice/customer-return',{linkedInvoiceId:order.id,items:[{productId:line.product_id,qty:1,unitPrice:0.01,name:line.product_title}],
    description:'Evaluation return: one unused unit'},tokens[cidx]);
   assert.equal(returned.json.data.totalRefund,Number(line.unit_price),'Return price must come from invoice, not submitted price');
   const after=(await q('SELECT remaining_quantity FROM stock_history WHERE batch_id=:id',{id:line.batch_id}))[0];assert.equal(after.remaining_quantity,before.remaining_quantity+1);
   const rejected=await api('/invoice/customer-return',{linkedInvoiceId:order.id,items:[{productId:line.product_id,qty:1}]},tokens[cidx],'POST',[409]);assert.equal(rejected.status,409);
   await api(`/customer/${customer.id}/payment`,{amount:returned.json.data.totalRefund,transactionType:'refund',invoiceId:order.id,
    invoiceNumber:order.number,referenceNumber:returned.json.data.returnNumber,notes:'Evaluation refund paid'},staffToken);
   journal.returns.push({...returned.json.data,orderId:order.id,customerId:customer.id,batchId:line.batch_id});save(journal);
  }
 }
 // Validate ledgers and account balances after delivery, payment and refund.
 const accounts=await q('SELECT customer_id,current_balance FROM customer_accounts ORDER BY customer_id');assert.equal(accounts.length,3);assert.ok(accounts.every(a=>Number(a.current_balance)===0));
 const summary=await q(`SELECT customer_name,count(*)::int orders,min(invoice_date)::text first,max(invoice_date)::text last,
  count(*) FILTER(WHERE delivery_status='delivered' AND payment_status='paid' AND due_amount=0)::int delivered_paid FROM invoice GROUP BY customer_name ORDER BY orders DESC`);
 assert.deepEqual(summary.map(r=>r.orders),[30,10,10]);assert.ok(summary.every(r=>r.orders===r.delivered_paid));
 const scoring=await api('/leads/recalculate?limit=100',{},staffToken,'POST',[200,503]);
 journal.leadResult=scoring.json;journal.complete=true;save(journal);
 console.log(JSON.stringify({result:'PASS',summary,returns:journal.returns.length,accountsSettled:true,leadHttpStatus:scoring.status,backup:journal.backup}));
}
main().catch(error=>{console.error('Evaluation import stopped safely:',error.message);process.exitCode=1}).finally(()=>sequelize.close());
