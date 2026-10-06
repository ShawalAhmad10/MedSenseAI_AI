const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const prepared = require('../data/prepared-stock-workbook.json');
const apply = process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(x => x === '--apply'));
assert.equal(process.env.DB_SCHEMA, 'medsense_app');
const key = prepared.source.originalSha256 + ':opening-damaged25-v1';
const client = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionTimeoutMillis: 15000,
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } } : {}) });
const cents = n => Math.round(Number(n || 0) * 100);
const number = (prefix, n) => `${prefix}-${String(n).padStart(3, '0')}`;
async function ids(table, column, count) {
  const result = await client.query(apply
    ? 'SELECT nextval(pg_get_serial_sequence($1,$2))::integer AS id FROM generate_series(1,$3::int)'
    : `SELECT (COALESCE((SELECT MAX(${column}) FROM ${table}),0)+n)::integer AS id FROM generate_series(1,$1::int) n`,
  apply ? [table,column,count] : [count]);
  return result.rows.map(row => row.id);
}
async function next(table, column) {
  const row = (await client.query(`SELECT COALESCE(MAX(substring(${column} from '[0-9]+$')::integer),0)+1 AS n FROM ${table}`)).rows[0];
  return row.n;
}
async function main() {
  await client.connect();
  await client.query("BEGIN; SET LOCAL search_path=medsense_app; SET LOCAL TIME ZONE 'Asia/Karachi'; SET LOCAL lock_timeout='30s'; SET LOCAL statement_timeout='120s'");
  await client.query('SELECT pg_advisory_xact_lock(44201,17001)');
  await client.query('LOCK TABLE stock,stock_history,stock_history_open,stock_return,stock_return_report,stock_report,supplier_accounts,supplier_ledger,product IN SHARE ROW EXCLUSIVE MODE');
  if ((await client.query("SELECT to_regclass('medsense_app.stock_workbook_activity_imports') AS name")).rows[0].name) {
    const existing = (await client.query('SELECT metadata FROM stock_workbook_activity_imports WHERE import_key=$1',[key])).rows[0];
    if (existing) {
      const m = existing.metadata;
      assert.equal((await client.query('SELECT count(*)::int n FROM stock_history_open WHERE open_id=ANY($1::int[])',[m.openingIds])).rows[0].n,234);
      assert.equal((await client.query("SELECT count(*)::int n FROM stock_return WHERE return_id=ANY($1::int[]) AND description='Damaged'",[m.returnIds])).rows[0].n,25);
      await client.query('ROLLBACK');
      console.log(JSON.stringify({ alreadyApplied:true, openings:234, damagedReturns:25, changes:false })); return;
    }
  }
  const source = (await client.query('SELECT metadata FROM stock_workbook_imports WHERE original_sha256=$1',[prepared.source.originalSha256])).rows[0];
  assert.ok(source, 'The workbook must already be imported');
  const batchIds = source.metadata.batchIds;
  assert.equal(batchIds.length,234);
  const batches = (await client.query(`SELECT h.*,s.supplier_id,s.stock_id,si.supplier_name FROM stock_history h
    JOIN stock s ON s.stock_id=h.stock_id JOIN supplier_info si ON si.supplier_id=s.supplier_id
    WHERE h.batch_id=ANY($1::int[]) ORDER BY h.creation_day,h.created_at,h.batch_id FOR UPDATE OF h`,[batchIds])).rows;
  assert.equal(batches.length,234);
  const stateBefore = (await client.query(`SELECT (SELECT sum(remaining_quantity) FROM stock_history)::bigint::text units,
    (SELECT count(*) FROM stock)::int receipts,(SELECT count(*) FROM invoice)::int orders`)).rows[0];
  const supplierIds = [...new Set(batches.map(b => b.supplier_id))]; assert.equal(supplierIds.length,5);
  const selected = supplierIds.sort((a,b)=>a-b).flatMap(supplierId => {
    const seen = new Set();
    const candidates = batches.filter(b => b.supplier_id===supplierId && b.status===1 && b.batch_status==='ACTIVE' &&
      b.remaining_quantity>=1 && b.product_quantity>=1 && b.product_price>0 && !seen.has(b.product_id) && seen.add(b.product_id));
    assert.ok(candidates.length>=5, 'Every supplier must have five available distinct medicines');
    return candidates.slice(0,5);
  }); assert.equal(selected.length,25);
  const snapshots={};
  for(const table of ['stock','stock_history','stock_history_open','stock_return','stock_return_report','stock_report','supplier_accounts','supplier_ledger','product']) {
    snapshots[table]=(await client.query(`SELECT * FROM ${table}`)).rows;
  }
  let backup;
  if(apply) {
    backup=path.resolve(__dirname,'../../database',`cloud-migration-stock-activity-${new Date().toISOString().replace(/[:.]/g,'-')}`);
    fs.mkdirSync(backup);
    fs.writeFileSync(path.join(backup,'before.json'),JSON.stringify(snapshots,null,2),{flag:'wx'});
  }
  await client.query(fs.readFileSync(path.resolve(__dirname,'../migrations/stock_document_numbers.sql'),'utf8'));
  const openingIds=await ids('stock_history_open','open_id',234);
  const firstOpening=await next('stock_history_open','opening_number');
  const openings=batches.map((b,i)=>({ id:openingIds[i],number:number('OPEN',firstOpening+i),source:b.batch_id,product:b.product_id,
    name:b.product_title,qty:b.initial_quantity,price:b.product_price,total:b.total_price,batch:b.batch_number,
    packs:b.product_bale,size:b.product_bale_size,expiry:b.expiry_date,date:b.creation_day,created:b.created_at,
    notes:`Imported stock opening snapshot; quantity already counted in received batch ${b.batch_number}; bonus is free.` }));
  await client.query(`INSERT INTO stock_history_open(open_id,opening_number,source_batch_id,product_id,product_title,
    product_quantity,product_price,total_price,batch_number,product_bale,product_bale_size,expiry_date,creation_day,created_at,
    adjustment_type,notes,"user",status,updated_at)
    SELECT id,number,source,product,name,qty,price,total,batch,packs,size,expiry,date,created,'opening',notes,'Imported stock opening',1,NOW()
    FROM jsonb_to_recordset($1::jsonb) x(id int,number text,source int,product int,name text,qty int,price numeric,total numeric,
    batch text,packs int,size int,expiry date,date date,created timestamptz,notes text)`,[JSON.stringify(openings)]);
  const returnIds=await ids('stock_return','return_id',25);
  const reportIds=await ids('stock_return_report','report_id',25);
  const stockReportIds=await ids('stock_report','ledger_id',25);
  const ledgerIds=await ids('supplier_ledger','ledger_number',25);
  const firstReturn=await next('stock_return','return_number');
  const returned=[];
  for(let i=0;i<selected.length;i++) {
    const b=selected[i], code=number('SRET',firstReturn+i), cost=Number(b.product_price), remaining=b.remaining_quantity-1;
    assert.ok(Number.isSafeInteger(remaining)&&remaining>=0);
    await client.query(`INSERT INTO stock_return(return_id,return_number,stock_id,supplier_id,total_amount,return_type,description,
      creation_day,created_by,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'normal','Damaged',CURRENT_DATE,'Stock damaged returns',1,NOW(),NOW())`,
      [returnIds[i],code,b.stock_id,b.supplier_id,cost]);
    await client.query(`INSERT INTO stock_return_report(report_id,return_id,product_id,product_title,product_quantity,product_price,total_price,
      expiry_date,status,created_at,updated_at) VALUES($1,$2,$3,$4,1,$5,$5,$6,1,NOW(),NOW())`,
      [reportIds[i],returnIds[i],b.product_id,b.product_title,cost,b.expiry_date]);
    assert.equal((await client.query(`UPDATE stock_history SET remaining_quantity=$1,batch_status=CASE WHEN $1=0 THEN 'FINISHED' ELSE batch_status END,
      updated_at=NOW() WHERE batch_id=$2 AND remaining_quantity=$3`,[remaining,b.batch_id,b.remaining_quantity])).rowCount,1);
    await client.query(`INSERT INTO stock_report(ledger_id,batch_id,product_id,transaction_type,quantity_change,balance_after,
      reference_type,reference_id,reference_number,unit_price,total_value,notes,performed_by,transaction_date,created_at)
      VALUES($1,$2,$3,'RETURN',-1,$4,'STOCK_RETURN',$5,$6,$7,$7,'Damaged','Stock damaged returns',NOW(),NOW())`,
      [stockReportIds[i],b.batch_id,b.product_id,remaining,returnIds[i],code,cost]);
    const account=(await client.query(`UPDATE supplier_accounts SET total_return=COALESCE(total_return,0)+$1,
      current_balance=COALESCE(current_balance,0)-$1,updated_at=NOW() WHERE supplier_id=$2 AND status=1
      RETURNING supplier_account_id,current_balance`,[cost,b.supplier_id])).rows;
    assert.equal(account.length,1);
    await client.query(`INSERT INTO supplier_ledger(ledger_number,supplier_id,supplier_account_id,transaction_type,account_type,payment_type,
      stock_id,product_id,product_title,product_quantity,product_price,total_price,amount_paid,debit_amount,credit_amount,balance,
      description,reference_type,reference_number,performed_by,status,time_created,creation_day,updated_at)
      VALUES($1,$2,$3,'stock_return',2,0,$4,$5,$6,1,$7,$7,0,0,$7,$8,'Damaged','STOCK_RETURN',$9,'Stock damaged returns',1,NOW(),CURRENT_DATE,NOW())`,
      [ledgerIds[i],b.supplier_id,account[0].supplier_account_id,b.stock_id,b.product_id,b.product_title,cost,account[0].current_balance,code]);
    returned.push({ returnNumber:code,supplier:b.supplier_name,product:b.product_title,batch:b.batch_number,quantity:1,cost,
      batchId:b.batch_id,stockId:b.stock_id,returnId:returnIds[i],remainingBefore:b.remaining_quantity,remainingAfter:remaining });
  }
  await client.query(`UPDATE product p SET product_status=CASE WHEN NOT p.archived AND NOT p.manually_inactive AND EXISTS(
    SELECT 1 FROM stock_history h WHERE h.product_id=p.product_id AND h.status=1 AND h.batch_status='ACTIVE'
      AND h.remaining_quantity>0 AND h.sale_price>0 AND h.expiry_date>=CURRENT_DATE) THEN 1 ELSE 0 END
    WHERE p.product_id=ANY($1::int[])`,[selected.map(b=>b.product_id)]);
  const accounts=(await client.query('SELECT * FROM supplier_accounts WHERE status=1')).rows;
  for(const account of accounts) {
    const before=snapshots.supplier_accounts.find(a=>a.supplier_account_id===account.supplier_account_id);
    const amount=selected.filter(b=>b.supplier_id===account.supplier_id).reduce((sum,b)=>sum+cents(b.product_price),0);
    assert.equal(cents(account.total_return),cents(before.total_return)+amount);
    assert.equal(cents(account.current_balance),cents(before.current_balance)-amount);
    assert.equal(cents(account.total_debit),cents(before.total_debit));assert.equal(cents(account.total_credit),cents(before.total_credit));
  }
  const stateAfter=(await client.query(`SELECT (SELECT sum(remaining_quantity) FROM stock_history)::bigint::text units,
    (SELECT count(*) FROM stock)::int receipts,(SELECT count(*) FROM invoice)::int orders`)).rows[0];
  assert.equal(BigInt(stateAfter.units),BigInt(stateBefore.units)-25n);
  assert.equal(stateBefore.receipts,stateAfter.receipts);assert.equal(stateBefore.orders,stateAfter.orders);
  assert.deepEqual((await client.query('SELECT stock_id,total_amount,paid_amount,due_amount FROM stock ORDER BY stock_id')).rows,
    snapshots.stock.sort((a,b)=>a.stock_id-b.stock_id).map(({stock_id,total_amount,paid_amount,due_amount})=>({stock_id,total_amount,paid_amount,due_amount})));
  const metadata={ openingIds,returnIds,stockReportIds,ledgerIds,returned,stateBefore,stateAfter,backup };
  await client.query('CREATE TABLE IF NOT EXISTS stock_workbook_activity_imports(import_key text PRIMARY KEY,metadata jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW())');
  await client.query('INSERT INTO stock_workbook_activity_imports(import_key,metadata) VALUES($1,$2::jsonb)',[key,JSON.stringify(metadata)]);
  const summary={ mode:apply?'saved':'rollback preview',openingRecords:234,damagedReturns:25,returnsPerSupplier:5,
    unitsReturned:25,physicalUnitsBefore:stateBefore.units,physicalUnitsAfter:stateAfter.units,
    originalBillsAndPaymentsPreserved:true,refundIssued:false,returnCredit:returned.reduce((sum,r)=>sum+cents(r.cost),0)/100,returned,backup };
  await client.query(apply?'COMMIT':'ROLLBACK');
  if(backup) fs.writeFileSync(path.join(backup,'report.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
}
main().catch(async error=>{ await client.query('ROLLBACK').catch(()=>{});console.error('Stock activity failed:',error.message);process.exitCode=1; })
  .finally(()=>client.end());
