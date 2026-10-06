// User-requested evaluation return history adjustment. No lead data is changed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {sequelize}=require('../src/config/database');sequelize.options.logging=false;
const jwt=require('jsonwebtoken'),User=require('../src/models/User');
const q=(sql,replacements={},transaction)=>sequelize.query(sql,{replacements,transaction,type:sequelize.QueryTypes.SELECT});
async function main(){try{
 assert.equal(process.env.DB_SCHEMA,'medsense_app');
 const existing=await q('SELECT r.*,i.invoice_date,i.created_at order_created_at,i.customer_id FROM invoice_return r JOIN invoice i ON i.invoice_id=r.linked_invoice_id ORDER BY r.return_number');
 assert.ok(existing.length>=6&&existing.length<=9,'Unexpected return count; inspect before changing');
 const candidates=await q(`SELECT i.invoice_id,i.invoice_number,i.invoice_date,i.customer_id,r.product_id,r.unit_price
 FROM invoice i JOIN LATERAL(SELECT * FROM invoice_report WHERE invoice_id=i.invoice_id AND quantity>returned_quantity ORDER BY item_id LIMIT 1) r ON true
 WHERE i.invoice_date BETWEEN '2026-09-19' AND '2026-09-30' AND i.delivery_status='delivered' AND i.payment_status='paid'
 AND NOT EXISTS(SELECT 1 FROM invoice_return x WHERE x.linked_invoice_id=i.invoice_id) ORDER BY i.invoice_date,i.invoice_id`);
 const picked=[];const customerIds=[...new Set(candidates.map(x=>x.customer_id))];
 for(const id of customerIds){if(picked.length===9-existing.length)break;const row=candidates.find(x=>x.customer_id===id);if(row)picked.push(row);}
 for(const row of candidates){if(picked.length===9-existing.length)break;if(!picked.includes(row))picked.push(row);}
 assert.equal(picked.length,9-existing.length);
 console.log(JSON.stringify({existing:existing.map(r=>({number:r.return_number,order:r.linked_invoice_number,orderDate:r.invoice_date,returnDate:r.created_at})),additional:picked,target:9}));
 if(!process.argv.includes('--apply'))return;
 const backup=path.resolve(__dirname,'../../database','cloud-migration-nine-returns-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(backup);
 const snapshots={};for(const t of ['invoice_return','invoice_return_report','customer_accounts','customer_ledger','invoice_report','stock_history','stock_report'])snapshots[t]=await q(`SELECT * FROM ${t}`);
 fs.writeFileSync(path.join(backup,'before.json'),JSON.stringify(snapshots,null,2));
 const staff=(await User.findAll({attributes:['id','email','role','isActive','isApproved','isEmailVerified']})).find(x=>x.role==='pharmacist'&&x.isActive&&x.isApproved&&x.isEmailVerified);assert.ok(staff);
 const staffToken=jwt.sign({id:staff.id,role:staff.role,email:staff.email},process.env.JWT_SECRET,{expiresIn:'30m'});
 async function api(url,body,token=staffToken,method='POST'){
  const res=await fetch('http://127.0.0.1:5005/api'+url,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  const value=await res.json();assert.ok(res.ok,`${url}: ${res.status} ${value.message}`);return value;
 }
 for(const row of picked){
  const [customer]=await q('SELECT email FROM customer WHERE customer_id=:id',{id:row.customer_id});
  const token=jwt.sign({id:row.customer_id,email:customer.email,type:'customer'},process.env.JWT_SECRET,{expiresIn:'30m'});
  const result=await api('/invoice/customer-return',{linkedInvoiceId:row.invoice_id,items:[{productId:row.product_id,qty:1}],description:'Evaluation return: one unused unit'},token);
  await api(`/invoice/returns/${result.data.returnId}/status`,{refund_status:'refunded'},staffToken,'PATCH');
 }
 const all=await q('SELECT r.*,i.invoice_date,i.created_at order_created_at FROM invoice_return r JOIN invoice i ON i.invoice_id=r.linked_invoice_id ORDER BY i.invoice_date,r.return_number');assert.equal(all.length,9);
 await sequelize.transaction(async transaction=>{
  await q('SELECT pg_advisory_xact_lock(44201,17001)',{},transaction);
  for(let index=0;index<all.length;index++){
   const r=all[index],day=String(r.invoice_date).slice(0,10);
   // Date follows its own purchase; same-day Oct 3 return is strictly later in time.
   const plus=Math.min(1,Math.floor((Date.parse('2026-10-03')-Date.parse(day))/86400000));
   let at=new Date(Date.parse(day+'T07:00:00Z')+plus*86400000+3600000);
   if(at.getTime()>Date.now())at=new Date(Math.min(Date.now()-1000,new Date(r.order_created_at).getTime()+60000));
   assert.ok(at>new Date(r.order_created_at),'Return must follow order creation');
   assert.ok(at<=new Date()&&at-new Date(r.order_created_at)<=14*86400000);
   const date=at.toISOString();
   await q('UPDATE invoice_return SET created_at=:at,updated_at=:at WHERE return_id=:id RETURNING return_id',{at:date,id:r.return_id},transaction);
   await q('UPDATE invoice_return_report SET created_at=:at WHERE return_id=:id RETURNING return_item_id',{at:date,id:r.return_id},transaction);
   await q("UPDATE stock_report SET transaction_date=:at,created_at=:at WHERE reference_type='INVOICE_RETURN' AND reference_id=:id RETURNING ledger_id",{at:date,id:r.return_id},transaction);
   await q("UPDATE customer_ledger SET transaction_date=:at,created_at=:at,updated_at=:at WHERE reference_number=:number AND reference_type IN ('INVOICE_RETURN','REFUND') RETURNING ledger_id",{at:date,number:r.return_number},transaction);
  }
 });
 const after=await q(`SELECT r.return_number,i.invoice_number,i.invoice_date,(r.created_at AT TIME ZONE 'Asia/Karachi')::date::text return_date,
 r.refund_status,r.created_at>i.created_at follows_order FROM invoice_return r JOIN invoice i ON i.invoice_id=r.linked_invoice_id ORDER BY r.return_number`);
 assert.equal(after.length,9);assert.ok(after.every(r=>r.follows_order&&r.refund_status==='refunded'));
 assert.equal(new Set(after.map(r=>r.return_date)).size,9,'Each evaluation return uses a different date');
 const balances=await q('SELECT current_balance FROM customer_accounts');assert.ok(balances.every(r=>Number(r.current_balance)===0));
 console.log(JSON.stringify({result:'PASS',backup,returns:after}));
 }finally{await sequelize.close();}}
main().catch(e=>{console.error(e.message);process.exitCode=1});
