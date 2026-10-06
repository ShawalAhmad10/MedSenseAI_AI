const {sequelize}=require('../config/database');
const {synchronizeProductStatus}=require('./marketProductService');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const cents=n=>Math.round(Number(n)*100);
async function createReturn({customerId,invoiceId,items,description,performedBy,staff=false}) {
 return sequelize.transaction(async transaction=>{
  const q=(sql,replacements={})=>sequelize.query(sql,{replacements,transaction,type:sequelize.QueryTypes.SELECT});
  await q('SELECT pg_advisory_xact_lock(44201,17001)');
  const [invoice]=await q('SELECT * FROM invoice WHERE invoice_id=:id AND status=1 FOR UPDATE',{id:invoiceId});
  if(!invoice || (!staff && Number(invoice.customer_id)!==Number(customerId))) fail(404,'Invoice not found or does not belong to your account');
  if(invoice.legacy_source_schema) fail(409,'Historical source invoices are read-only and cannot be returned');
  if(invoice.delivery_status!=='delivered'||invoice.payment_status!=='paid') fail(400,'Only delivered, paid orders can be returned');
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Karachi'});
  const date=String(invoice.invoice_date).slice(0,10);
  const days=Math.round((Date.parse(today)-Date.parse(date))/86400000);
  if(days<0||days>14) fail(400,'Returns are only accepted within 14 days of purchase');
  if(!Array.isArray(items)||!items.length) fail(400,'At least one return item is required');
  if((await q('SELECT return_id FROM invoice_return WHERE linked_invoice_id=:id AND status=1',{id:invoiceId})).length) fail(409,'A return has already been submitted for this order');
  const lines=await q('SELECT * FROM invoice_report WHERE invoice_id=:id AND status=1 ORDER BY item_id FOR UPDATE',{id:invoiceId});
  const requested=new Map();
  for(const item of items){const id=Number(item.productId??item.product_id),qty=Number(item.qty??item.quantity);
   if(!Number.isSafeInteger(id)||!Number.isSafeInteger(qty)||qty<=0||requested.has(id)) fail(400,'Return products must be unique with positive whole quantities');
   requested.set(id,qty);
  }
  const allocations=[];
  for(const [id,quantity] of requested){let remaining=quantity;
   for(const line of lines.filter(l=>Number(l.product_id)===id)){
    const qty=Math.min(remaining,Number(line.quantity)-Number(line.returned_quantity));if(qty<=0)continue;
    if(!line.batch_id) fail(409,'The original sale batch is missing; this order needs manual review');
    allocations.push({line,qty});remaining-=qty;if(!remaining)break;
   }
   if(remaining) fail(400,'Return quantity exceeds the quantity available from the original order');
  }
  const totalCents=allocations.reduce((sum,{line,qty})=>sum+cents(line.unit_price)*qty,0);
  const [last]=await q("SELECT COALESCE(MAX(substring(return_number from '[0-9]+$')::integer),0)+1 n FROM invoice_return WHERE return_number ~ '^RET-[0-9]+$'");
  const number='RET-'+String(last.n).padStart(3,'0'),total=totalCents/100;
  const [header]=await q(`INSERT INTO invoice_return(return_number,linked_invoice_id,linked_invoice_number,customer_name,customer_phone,customer_email,
   return_description,subtotal,total_amount,refund_amount,created_by) VALUES(:number,:id,:invoiceNumber,:name,:phone,:email,:description,:total,:total,:total,:by) RETURNING *`,
   {number,id:invoiceId,invoiceNumber:invoice.invoice_number,name:invoice.customer_name,phone:invoice.customer_phone,email:invoice.customer_email,
    description:description||'Customer return request',total,by:performedBy||'customer'});
  for(const {line,qty} of allocations){
   const [batch]=await q('SELECT * FROM stock_history WHERE batch_id=:id AND product_id=:pid FOR UPDATE',{id:line.batch_id,pid:line.product_id});
   if(!batch) fail(409,'The original stock batch is missing');
   const remaining=Number(batch.remaining_quantity)+qty;
   await q("UPDATE stock_history SET remaining_quantity=:qty,batch_status='ACTIVE',status=1,updated_at=NOW() WHERE batch_id=:id RETURNING batch_id",{qty:remaining,id:batch.batch_id});
   await q(`INSERT INTO invoice_return_report(return_id,product_id,product_name,quantity,unit_price,total_price,product_profit,batch_id,invoice_item_id)
    VALUES(:rid,:pid,:name,:qty,:price,:total,:profit,:bid,:iid) RETURNING return_item_id`,
    {rid:header.return_id,pid:line.product_id,name:line.product_title,qty,price:line.unit_price,total:cents(line.unit_price)*qty/100,
     profit:(cents(line.unit_price)-cents(line.purchase_price||0))*qty/100,bid:line.batch_id,iid:line.item_id});
   await q('UPDATE invoice_report SET returned_quantity = returned_quantity + :qty,updated_at=NOW() WHERE item_id=:id RETURNING item_id',{qty,id:line.item_id});
   await q(`INSERT INTO stock_report(product_id,batch_id,transaction_type,quantity_change,balance_after,reference_type,reference_id,reference_number,
    unit_price,total_value,notes,transaction_date,created_at) VALUES(:pid,:bid,'RETURN',:qty,:balance,'INVOICE_RETURN',:rid,:number,:price,:total,:notes,NOW(),NOW()) RETURNING ledger_id`,
    {pid:line.product_id,bid:batch.batch_id,qty,balance:remaining,rid:header.return_id,number,price:line.purchase_price||0,total:Number(line.purchase_price||0)*qty,notes:'Customer return to original sale batch'});
  }
  if(invoice.customer_id){
   const [account]=await q('SELECT * FROM customer_accounts WHERE customer_id=:id AND status=1 FOR UPDATE',{id:invoice.customer_id});
   if(!account) fail(409,'Customer account is missing');
   const balance=Number(account.current_balance)-total;
   await q('UPDATE customer_accounts SET total_debit = total_debit - :total,current_balance=:balance,updated_at=NOW() WHERE account_id=:id RETURNING account_id',{total,balance,id:account.account_id});
   await q(`INSERT INTO customer_ledger(customer_id,account_id,transaction_date,transaction_type,reference_type,reference_id,reference_number,
    debit_amount,credit_amount,balance,description,performed_by,status,created_at,updated_at)
    VALUES(:cid,:aid,NOW(),'refund','INVOICE_RETURN',:rid,:number,0,:total,:balance,:description,:by,1,NOW(),NOW()) RETURNING ledger_id`,
    {cid:invoice.customer_id,aid:account.account_id,rid:header.return_id,number,total,balance,description:'Return '+number,by:performedBy||'customer'});
  }
  await synchronizeProductStatus([...requested.keys()],transaction);
  return {returnId:header.return_id,returnNumber:number,totalRefund:total,daysRemaining:14-days};
 });
}
async function refundReturn(returnId,performedBy){
 return sequelize.transaction(async transaction=>{
  const q=(sql,replacements={})=>sequelize.query(sql,{replacements,transaction,type:sequelize.QueryTypes.SELECT});
  await q('SELECT pg_advisory_xact_lock(44201,17001)');
  const [header]=await q('SELECT * FROM invoice_return WHERE return_id=:id AND status=1 FOR UPDATE',{id:returnId});
  if(!header)fail(404,'Return not found');
  if(header.refund_status==='refunded')return {alreadyRefunded:true};
  if(header.refund_status!=='pending')fail(409,'Only a pending refund can be paid');
  const [invoice]=await q('SELECT customer_id FROM invoice WHERE invoice_id=:id',{id:header.linked_invoice_id});
  if(invoice.customer_id){
   const [account]=await q('SELECT * FROM customer_accounts WHERE customer_id=:id AND status=1 FOR UPDATE',{id:invoice.customer_id});
   if(!account)fail(409,'Customer account is missing');
   const amount=Number(header.refund_amount),balance=Number(account.current_balance)+amount;
   await q('UPDATE customer_accounts SET total_credit = total_credit - :amount,current_balance=:balance,updated_at=NOW() WHERE account_id=:id RETURNING account_id',{amount,balance,id:account.account_id});
   await q(`INSERT INTO customer_ledger(customer_id,account_id,transaction_date,transaction_type,reference_type,reference_id,reference_number,
    debit_amount,credit_amount,balance,payment_method,description,performed_by,status,created_at,updated_at)
    VALUES(:cid,:aid,NOW(),'refund','REFUND',:iid,:number,:amount,0,:balance,'cash',:description,:by,1,NOW(),NOW()) RETURNING ledger_id`,
    {cid:invoice.customer_id,aid:account.account_id,iid:header.linked_invoice_id,number:header.return_number,amount,balance,
      description:'Refund paid for '+header.return_number,by:performedBy||'pharmacist'});
  }
  await q("UPDATE invoice_return SET refund_status='refunded',updated_at=NOW() WHERE return_id=:id RETURNING return_id",{id:returnId});
  return {alreadyRefunded:false};
 });
}
module.exports={createReturn,refundReturn};
