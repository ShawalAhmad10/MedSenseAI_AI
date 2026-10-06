const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {Client}=require('pg');
const {validateReturnDate}=require('../src/services/stockReturnDateService');
const prepared=require('../data/prepared-stock-workbook.json');
const apply=process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(x=>x==='--apply'));assert.equal(process.env.DB_SCHEMA,'medsense_app');
const client=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER,
  password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionTimeoutMillis:15000,
  ...(process.env.DB_SSL==='true'?{ssl:{rejectUnauthorized:process.env.DB_SSL_REJECT_UNAUTHORIZED!=='false'}}:{})});
const importKey=prepared.source.originalSha256+':opening-damaged25-v1';
async function stable() {
  const result={};
  for(const table of ['stock','stock_history','stock_history_open','supplier_accounts','invoice']) {
    result[table]=(await client.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(t)::text,E'\n' ORDER BY row_to_json(t)::text),'')) hash FROM ${table} t`)).rows[0];
  }
  return result;
}
async function main(){
  await client.connect();await client.query("BEGIN; SET LOCAL search_path=medsense_app; SET LOCAL TIME ZONE 'Asia/Karachi'; SET LOCAL lock_timeout='30s'; SET LOCAL statement_timeout='120s'");
  await client.query('SELECT pg_advisory_xact_lock(44201,17001)');
  await client.query('LOCK TABLE stock_return,stock_return_report,stock_report,supplier_ledger,supplier_accounts,stock_workbook_activity_imports IN SHARE ROW EXCLUSIVE MODE');
  const record=(await client.query('SELECT metadata FROM stock_workbook_activity_imports WHERE import_key=$1 FOR UPDATE',[importKey])).rows[0];assert.ok(record);
  const meta=record.metadata, ordered=[...meta.returned].sort((a,b)=>Number(a.returnNumber.split('-')[1])-Number(b.returnNumber.split('-')[1]));
  assert.equal(ordered.length,25);
  const ids=ordered.map(r=>r.returnId);
  const returns=(await client.query(`SELECT r.return_id,r.return_number,r.supplier_id,r.creation_day::text return_date,
    s.creation_day::text stock_date,h.creation_day::text batch_date,h.batch_id,rr.product_quantity,rr.product_id,rr.product_price,
    r.total_amount,r.description FROM stock_return r JOIN stock s ON s.stock_id=r.stock_id
    JOIN stock_return_report rr ON rr.return_id=r.return_id JOIN stock_report m ON m.reference_type='STOCK_RETURN' AND m.reference_id=r.return_id
    JOIN stock_history h ON h.batch_id=m.batch_id WHERE r.return_id=ANY($1::int[]) ORDER BY r.return_number`,[ids])).rows;
  assert.equal(returns.length,25);
  const first=Date.parse('2026-07-02'),last=Date.parse('2026-10-01');
  const plan=ordered.map((r,i)=>{
    const actual=returns.find(x=>x.return_id===r.returnId);assert.equal(actual.batch_id,r.batchId);assert.equal(actual.product_quantity,1);assert.equal(actual.description,'Damaged');
    const date=new Date(first+Math.round((last-first)/86400000*i/24)*86400000).toISOString().slice(0,10);
    validateReturnDate(date,[actual.stock_date,actual.batch_date]);
    return {returnId:r.returnId,returnNumber:r.returnNumber,date,supplierId:actual.supplier_id,stockDate:actual.stock_date};
  });assert.equal(new Set(plan.map(x=>x.date)).size,25);
  if(meta.returnDates){
    assert.deepEqual(meta.returnDates.plan,plan);
    assert.ok(returns.every(r=>r.return_date===plan.find(p=>p.returnId===r.return_id).date));
    await client.query('ROLLBACK');console.log(JSON.stringify({alreadyUpdated:true,returns:25,distinctDates:25,changes:false}));return;
  }
  const before=await stable();
  const snapshots={};
  for(const table of ['stock_return','stock_return_report','stock_report','supplier_ledger','stock_workbook_activity_imports']) snapshots[table]=(await client.query(`SELECT * FROM ${table}`)).rows;
  let backup;
  if(apply){backup=path.resolve(__dirname,'../../database',`cloud-migration-return-dates-${new Date().toISOString().replace(/[:.]/g,'-')}`);
    fs.mkdirSync(backup);fs.writeFileSync(path.join(backup,'before.json'),JSON.stringify(snapshots,null,2),{flag:'wx'});}
  await client.query(`CREATE TEMP TABLE return_dates(return_id int PRIMARY KEY,return_number text,date date,supplier_id int) ON COMMIT DROP`);
  await client.query(`INSERT INTO return_dates SELECT "returnId","returnNumber",date,"supplierId" FROM jsonb_to_recordset($1::jsonb)
    x("returnId" int,"returnNumber" text,date date,"supplierId" int)`,[JSON.stringify(plan)]);
  assert.equal((await client.query(`UPDATE stock_return r SET creation_day=p.date,updated_at=NOW() FROM return_dates p WHERE r.return_id=p.return_id`)).rowCount,25);
  assert.equal((await client.query(`UPDATE stock_report m SET transaction_date=p.date::timestamp+INTERVAL '12 hours' FROM return_dates p
    WHERE m.reference_type='STOCK_RETURN' AND m.reference_id=p.return_id`)).rowCount,25);
  assert.equal((await client.query(`UPDATE supplier_ledger l SET creation_day=p.date,time_created=p.date::timestamp+INTERVAL '12 hours',updated_at=NOW()
    FROM return_dates p WHERE l.reference_type='STOCK_RETURN' AND l.reference_number=p.return_number`)).rowCount,25);
  await client.query(`WITH running AS(SELECT l.ledger_number,COALESCE(a.opening_balance,0)+
    SUM(COALESCE(l.debit_amount,0)-COALESCE(l.credit_amount,0)) OVER(PARTITION BY l.supplier_account_id ORDER BY l.time_created,l.ledger_number ROWS UNBOUNDED PRECEDING) balance
    FROM supplier_ledger l JOIN supplier_accounts a ON a.supplier_account_id=l.supplier_account_id WHERE l.status=1
      AND l.supplier_id IN(SELECT supplier_id FROM return_dates))
    UPDATE supplier_ledger l SET balance=r.balance FROM running r WHERE l.ledger_number=r.ledger_number AND l.balance IS DISTINCT FROM r.balance`);
  assert.deepEqual(await stable(),before,'Stock quantities, purchases, opening stock, account totals and orders must stay unchanged');
  const invalid=(await client.query(`SELECT p.return_id FROM return_dates p JOIN stock_return r ON r.return_id=p.return_id
    JOIN stock s ON s.stock_id=r.stock_id JOIN stock_report m ON m.reference_id=r.return_id AND m.reference_type='STOCK_RETURN'
    JOIN stock_history h ON h.batch_id=m.batch_id JOIN supplier_ledger l ON l.reference_type='STOCK_RETURN' AND l.reference_number=r.return_number
    WHERE r.creation_day<>p.date OR p.date<=s.creation_day OR p.date<=h.creation_day OR m.transaction_date::date<>p.date
      OR l.creation_day<>p.date OR l.time_created::date<>p.date OR p.date<'2026-07-01' OR p.date>'2026-10-01'`)).rows;assert.equal(invalid.length,0,'All return movement and ledger dates must match');
  const accountMismatch=(await client.query(`SELECT a.supplier_id FROM supplier_accounts a JOIN LATERAL(
    SELECT balance FROM supplier_ledger l WHERE l.supplier_account_id=a.supplier_account_id AND l.status=1 ORDER BY time_created DESC,ledger_number DESC LIMIT 1) l ON true
    JOIN LATERAL(SELECT COALESCE(SUM(debit_amount-credit_amount),0) net FROM supplier_ledger x
      WHERE x.supplier_account_id=a.supplier_account_id AND x.status=1) totals ON true
    WHERE a.supplier_id IN(SELECT supplier_id FROM return_dates)
      AND round((a.opening_balance+totals.net)::numeric,2)<>round(l.balance::numeric,2)`)).rows;
  assert.equal(accountMismatch.length,0,'Chronological ledger must include existing payments and refunds without changing their amounts');
  const correction={plan,range:['2026-07-01','2026-10-01'],backup};
  await client.query("UPDATE stock_workbook_activity_imports SET metadata=jsonb_set(metadata,'{returnDates}',$1::jsonb) WHERE import_key=$2",[JSON.stringify(correction),importKey]);
  await client.query(apply?'COMMIT':'ROLLBACK');
  const report={mode:apply?'saved':'rollback preview',returns:25,distinctDates:25,firstReturn:'2026-07-02',lastReturn:'2026-10-01',allAfterStockEntry:true,
    quantitiesAndAmountsPreserved:true,auditCreationTimesPreserved:true,plan,backup};
  if(backup)fs.writeFileSync(path.join(backup,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(async e=>{await client.query('ROLLBACK').catch(()=>{});console.error('Return date correction failed:',e.message);process.exitCode=1;}).finally(()=>client.end());
