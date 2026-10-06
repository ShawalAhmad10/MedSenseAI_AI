const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});const {sequelize}=require('../src/config/database');sequelize.options.logging=false;
const User=require('../src/models/User'),jwt=require('jsonwebtoken');
const {chromium,expect}=require('../../medsense_ai/node_modules/@playwright/test');
const journal=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/customer-orders-evaluation-progress.json'),'utf8'));
const q=(sql,replacements={},transaction)=>sequelize.query(sql,{replacements,transaction,type:sequelize.QueryTypes.SELECT});
async function main(){let browser;try{
 assert.equal(journal.orders.length,50);assert.equal(journal.returns.length,6);
 const staff=(await User.findAll({attributes:['id','email','role','isActive','isApproved','isEmailVerified']})).find(s=>s.role==='pharmacist'&&s.isActive&&s.isApproved&&s.isEmailVerified);assert.ok(staff);
 const staffToken=jwt.sign({id:staff.id,role:staff.role,email:staff.email},process.env.JWT_SECRET,{expiresIn:'30m'});
 async function api(url,token,body,method='GET',status=200){const res=await fetch('http://127.0.0.1:5005/api'+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});const value=await res.json();assert.equal(res.status,status,`${url}: ${value.message}`);return value;}
 // Align generated dates and explicitly keep generated telemetry separate from real observations.
 await sequelize.transaction(async transaction=>{
  await q(`UPDATE stock_report r SET reference_id=i.invoice_id,transaction_date=i.created_at,created_at=i.created_at
   FROM invoice i WHERE r.reference_type='INVOICE' AND r.reference_number=i.invoice_number RETURNING r.ledger_id`,{},transaction);
  await q(`UPDATE pharmacist_consultations c SET created_at=i.created_at,updated_at=i.created_at FROM invoice i
   WHERE c.review_fingerprint=encode(sha256(convert_to('completed-order:'||i.invoice_id::text,'UTF8')),'hex') RETURNING c.consultation_id`,{},transaction);
  await q(`UPDATE pharmacist_consultations c SET created_at=i.created_at,updated_at=i.created_at,responded_at=i.created_at,
   decision_at=i.created_at,checkout_consumed_at=i.created_at FROM invoice i
   WHERE c.cart_instance_id='cart-safe-evaluation-'||lpad(i.invoice_id::text,12,'0') RETURNING c.consultation_id`,{},transaction);
  await q(`UPDATE notifications n SET created_at=i.created_at,updated_at=i.created_at FROM invoice i
   WHERE n.metadata->>'orderId'=i.invoice_id::text RETURNING n.id`,{},transaction);
 });
 const invoices=await q('SELECT * FROM invoice ORDER BY invoice_id');assert.equal(invoices.length,50);
 assert.deepEqual(invoices.map(i=>i.invoice_id),Array.from({length:50},(_,i)=>i+1));
 assert.deepEqual(invoices.map(i=>i.invoice_number),Array.from({length:50},(_,i)=>'INV-'+String(i+1).padStart(3,'0')));
 assert.ok(invoices.every(i=>i.delivery_status==='delivered'&&i.payment_status==='paid'&&Number(i.due_amount)===0&&Number(i.paid_amount)===Number(i.total_amount)));
 assert.equal(String(invoices[0].invoice_date),'2026-07-01');assert.equal(String(invoices[49].invoice_date),'2026-10-03');
 const dateErrors=await q(`SELECT r.item_id FROM invoice_report r JOIN invoice i USING(invoice_id) JOIN stock_history h USING(batch_id)
  WHERE h.creation_day>i.invoice_date OR h.creation_day>i.created_at::date`);assert.equal(dateErrors.length,0);
 const totals=await q(`SELECT i.invoice_id FROM invoice i JOIN invoice_report r USING(invoice_id) GROUP BY i.invoice_id
  HAVING abs(sum(r.total_price)-i.total_amount)>0.01`);assert.equal(totals.length,0);
 const wrongProfit=await q('SELECT item_id FROM invoice_report WHERE abs(total_price-(unit_price*quantity-discount+tax))>0.01');assert.equal(wrongProfit.length,0);
 const stockBefore=JSON.parse(fs.readFileSync(path.join(journal.backup,'before.json'),'utf8')).stock_history;
 const movements=await q("SELECT batch_id,sum(quantity_change)::int change FROM stock_report WHERE reference_type IN ('INVOICE','INVOICE_RETURN') GROUP BY batch_id");
 const changes=new Map(movements.map(r=>[r.batch_id,r.change]));const currentStock=await q('SELECT batch_id,remaining_quantity FROM stock_history');
 for(const b of currentStock)assert.equal(b.remaining_quantity,Number(stockBefore.find(x=>x.batch_id===b.batch_id).remaining_quantity)+(changes.get(b.batch_id)||0));
 const accounts=await q('SELECT * FROM customer_accounts ORDER BY customer_id');assert.ok(accounts.every(a=>Number(a.current_balance)===0));
 const ledgers=await q('SELECT customer_id,sum(debit_amount-credit_amount) net FROM customer_ledger GROUP BY customer_id');assert.ok(ledgers.every(l=>Number(l.net)===0));
 const returns=await api('/invoice/returns?limit=100',staffToken);assert.equal(returns.data.length,6);assert.ok(returns.data.every(r=>r.refund_status==='refunded'));
 // Repeat pharmacist paid/refund actions: no double payment or stock change.
 const ledgerCount=(await q('SELECT count(*)::int n FROM customer_ledger'))[0].n;
 await api('/orders/50/status',staffToken,{delivery_status:'delivered',payment_status:'paid'},'PATCH');
 await api(`/invoice/returns/${journal.returns[0].returnId}/status`,staffToken,{refund_status:'refunded'},'PATCH');
 assert.equal((await q('SELECT count(*)::int n FROM customer_ledger'))[0].n,ledgerCount);
 const orders=await api('/orders?limit=100',staffToken);assert.equal(orders.data.orders.length,50);
 const invoiceList=await api('/invoice?limit=100',staffToken);assert.equal(invoiceList.data.length,50);
 const consultations=await api('/consultations/queue?limit=100',staffToken);assert.ok(consultations.data.length>0);
 const lead=await api('/leads?limit=100',staffToken);assert.equal(lead.data.leads.length,3);
 assert.deepEqual(lead.data.leads.map(l=>l.order_count).sort((a,b)=>b-a),[30,10,10]);
 console.log(JSON.stringify({check:'Database and staff API',orders:50,returns:6,consultations:consultations.data.length,
  leads:lead.data.leads.map(l=>({name:l.customer_name,orders:l.order_count,status:l.scoring.status,reason:l.scoring.reason})),result:'PASS'}));
 browser=await chromium.launch({channel:'msedge',headless:true});const check=expect.configure({timeout:120000});
 for(const customer of journal.customers){
  const token=jwt.sign({id:customer.id,email:customer.email,type:'customer'},process.env.JWT_SECRET,{expiresIn:'30m'});
  const owned=await api('/orders/my-orders?limit=100',token);assert.equal(owned.data.orders.length,customer.name==='Iman Fatima'?30:10);
  assert.ok(owned.data.orders.every(o=>o.customer_id===customer.id&&o.delivery_status==='delivered'&&o.payment_status==='paid'));
  const customerReturns=await api('/invoice/customer-returns',token);assert.equal(customerReturns.data.length,2);
  const someoneElse=invoices.find(i=>i.customer_id!==customer.id);
  await api('/invoice/customer-return',token,{linkedInvoiceId:someoneElse.invoice_id,items:[{productId:900127,qty:1}]},'POST',404);
  const context=await browser.newContext({timezoneId:'Asia/Karachi'});await context.addInitScript(user=>localStorage.setItem('medsense_customer_auth',JSON.stringify(user)),{...customer,token});
  await context.route('**/api/**',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(120000);await page.goto('http://127.0.0.1:5173/orders');
  await check(page.getByText('Order INV-', {exact:false})).toHaveCount(customer.name==='Iman Fatima'?30:10);
  await page.goto('http://127.0.0.1:5173/refunds');await page.getByRole('button',{name:'My Returns (2)',exact:true}).click();await check(page.getByText('Refunded',{exact:true})).toHaveCount(2);
  await context.close();console.log(JSON.stringify({check:'Customer browser',customer:customer.name,orders:owned.data.orders.length,returns:2,result:'PASS'}));
 }
 const context=await browser.newContext();await context.addInitScript(token=>localStorage.setItem('medsense_auth_user',JSON.stringify({token})),staffToken);
 const page=await context.newPage();page.setDefaultTimeout(120000);await page.goto('http://127.0.0.1:5173/pharmacist/dashboard/leads');
 await check(page.getByRole('heading',{name:'AI Lead Scoring'})).toBeVisible();await check(page.getByText('Iman Fatima',{exact:true})).toBeVisible();
 await context.close();console.log('PASS: customers, storefront orders/refunds, pharmacist invoices/status and lead records verified.');
 }finally{await browser?.close();await sequelize.close();}}
main().catch(e=>{console.error('Evaluation verification failed:',e.message);process.exitCode=1});
