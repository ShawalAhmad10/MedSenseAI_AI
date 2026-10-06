// Read-only verification; deliberately does not request or change leads.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {sequelize}=require('../src/config/database');sequelize.options.logging=false;
const jwt=require('jsonwebtoken'),User=require('../src/models/User');
const q=sql=>sequelize.query(sql,{type:sequelize.QueryTypes.SELECT});
async function main(){try{
 const [totals]=await q('SELECT (SELECT count(*) FROM invoice)::int orders,(SELECT count(*) FROM customer)::int customers,(SELECT count(*) FROM invoice_return)::int returns');
 assert.deepEqual(totals,{orders:51,customers:4,returns:9});
 const bad=await q(`SELECT r.return_id FROM invoice_return r JOIN invoice i ON i.invoice_id=r.linked_invoice_id
 WHERE r.created_at<=i.created_at OR r.created_at>NOW() OR r.refund_status<>'refunded'
 OR EXISTS(SELECT 1 FROM invoice_return_report d WHERE d.return_id=r.return_id AND d.created_at<>r.created_at)
 OR EXISTS(SELECT 1 FROM stock_report s WHERE s.reference_type='INVOICE_RETURN' AND s.reference_id=r.return_id AND s.transaction_date<>r.created_at)
 OR EXISTS(SELECT 1 FROM customer_ledger l WHERE l.reference_number=r.return_number AND l.reference_type IN ('INVOICE_RETURN','REFUND') AND l.transaction_date<>r.created_at)`);assert.equal(bad.length,0);
 assert.ok((await q('SELECT current_balance FROM customer_accounts')).every(r=>Number(r.current_balance)===0));
 assert.ok((await q('SELECT customer_id,sum(debit_amount-credit_amount) net FROM customer_ledger GROUP BY customer_id')).every(r=>Number(r.net)===0));
 const folders=fs.readdirSync(path.resolve(__dirname,'../../database')).filter(x=>x.startsWith('cloud-migration-nine-returns-')).sort();
 const before=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../database',folders.at(-1),'before.json'),'utf8'));
 const newIds=new Set((await q('SELECT return_id FROM invoice_return')).map(r=>r.return_id).filter(id=>!before.invoice_return.some(r=>r.return_id===id)));
 const changes=new Map();for(const r of await q('SELECT batch_id,return_id,quantity FROM invoice_return_report'))if(newIds.has(r.return_id))changes.set(r.batch_id,(changes.get(r.batch_id)||0)+r.quantity);
 for(const stock of await q('SELECT batch_id,remaining_quantity FROM stock_history'))assert.equal(stock.remaining_quantity,Number(before.stock_history.find(r=>r.batch_id===stock.batch_id).remaining_quantity)+(changes.get(stock.batch_id)||0));
 const staff=(await User.findAll({attributes:['id','email','role','isActive','isApproved','isEmailVerified']})).find(x=>x.role==='pharmacist'&&x.isActive&&x.isApproved&&x.isEmailVerified);
 async function api(url,token){const res=await fetch('http://127.0.0.1:5173/api'+url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(120000)});const value=await res.json();assert.ok(res.ok,`${url}: ${value.message}`);return value;}
 const staffToken=jwt.sign({id:staff.id,role:staff.role,email:staff.email},process.env.JWT_SECRET,{expiresIn:'15m'});
 const returns=await api('/invoice/returns?limit=100',staffToken);assert.equal(returns.data.length,9);
 const [biha]=await q("SELECT customer_id,email FROM customer WHERE email='bihafatima70@gmail.com'");
 const token=jwt.sign({id:biha.customer_id,email:biha.email,type:'customer'},process.env.JWT_SECRET,{expiresIn:'15m'});
 const orders=await api('/orders/my-orders?limit=100',token);assert.equal(orders.data.orders.length,1);
 assert.equal(orders.data.orders[0].invoice_number||orders.data.orders[0].orderNumber,'INV-051');
 const ownedReturns=await api('/invoice/customer-returns',token);assert.equal(ownedReturns.data.length,1);
 console.log(JSON.stringify({result:'PASS',...totals,returnDatesAndRefundDates:'after orders and synchronized',stock:'original sale batches restored correctly',customerBalances:0,frontendProxy:'staff sees 9 returns; Biha sees her 1 order and 1 return',leads:'untouched'}));
 }finally{await sequelize.close();}}
main().catch(e=>{console.error(e.message);process.exitCode=1});
