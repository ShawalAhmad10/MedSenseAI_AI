const assert=require('node:assert/strict');
const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {sequelize}=require('../src/config/database');
const {Pharmacist}=require('../src/models');
const jwt=require('jsonwebtoken');
const {chromium,expect}=require('../../medsense_ai/node_modules/@playwright/test');
sequelize.options.logging=false;
const prepared=require('../data/prepared-stock-workbook.json');
const check=expect.configure({timeout:120000});
const num=(prefix,n)=>`${prefix}-${String(n).padStart(3,'0')}`;
async function rows(sql,replacements={}) {return sequelize.query(sql,{replacements,type:sequelize.QueryTypes.SELECT});}
async function fingerprint() {
  const [r]=await rows(`SELECT md5(string_agg(value,E'\n' ORDER BY value)) hash FROM (
    SELECT row_to_json(h)::text value FROM stock_history h UNION ALL SELECT row_to_json(s)::text FROM stock_return s
    UNION ALL SELECT row_to_json(o)::text FROM stock_history_open o UNION ALL SELECT row_to_json(a)::text FROM supplier_accounts a
    UNION ALL SELECT row_to_json(l)::text FROM supplier_ledger l) x`);return r.hash;
}
async function main() {
  let browser;
  try {
    const [record]=await rows('SELECT metadata FROM stock_workbook_activity_imports WHERE import_key=:key',
      {key:prepared.source.originalSha256+':opening-damaged25-v1'});assert.ok(record);
    const meta=record.metadata;
    const before=await fingerprint();
    const totals=await rows(`SELECT s.supplier_id,si.supplier_name,count(*)::int count,SUM(rr.product_quantity)::int quantity,
      SUM(rr.total_price)::numeric(14,2)::text credit FROM stock_return s JOIN stock_return_report rr USING(return_id)
      JOIN supplier_info si ON si.supplier_id=s.supplier_id WHERE s.description='Damaged' GROUP BY s.supplier_id,si.supplier_name`);
    assert.equal(totals.length,5);assert.ok(totals.every(s=>s.count===5&&s.quantity===5));
    const [opening]=await rows(`SELECT count(*)::int count,SUM(product_quantity)::bigint::text qty FROM stock_history_open WHERE source_batch_id IS NOT NULL`);
    assert.equal(opening.count,234);assert.equal(opening.qty,'1229525');
    const [stock]=await rows('SELECT sum(remaining_quantity)::bigint::text qty FROM stock_history');assert.equal(stock.qty,'1229500');
    for(const r of meta.returned) {
      const [b]=await rows('SELECT remaining_quantity FROM stock_history WHERE batch_id=:id',{id:r.batchId});assert.equal(b.remaining_quantity,r.remainingAfter);
    }
    const staff=(await Pharmacist.findAll({attributes:['id','role','isActive','isApproved','isEmailVerified']}))
      .find(u=>u.role==='pharmacist'&&u.isActive&&u.isApproved&&u.isEmailVerified);assert.ok(staff);
    const token=jwt.sign({id:staff.id,role:staff.role},process.env.JWT_SECRET,{expiresIn:'20m'});
    async function get(url) {const response=await fetch('http://127.0.0.1:5005/api'+url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(120000)});
      assert.equal(response.status,200,url);return (await response.json()).data;}
    const [openings,returns,receipt]=await Promise.all([get('/stock/opening'),get('/stock/return'),get('/stock/batch/STK-45')]);
    assert.equal(openings.length,234);assert.equal(returns.length,25);
    assert.equal(receipt.stockNumber,'STK-001');assert.equal(receipt.billNumber,'BILL-001');assert.equal(receipt.billNo,'BILL-0001');
    assert.deepEqual(openings.map(o=>o.openingNumber).sort(),Array.from({length:234},(_,i)=>num('OPEN',i+1)).sort());
    assert.deepEqual(returns.map(r=>r.returnNumber).sort(),Array.from({length:25},(_,i)=>num('SRET',i+1)).sort());
    assert.ok(returns.every(r=>r.description==='Damaged'&&r.items.length===1&&Number(r.items[0].quantity)===1));
    console.log(JSON.stringify({check:'database and API',openings:234,damagedReturns:25,perSupplier:5,returnedUnits:25,
      remainingUnits:stock.qty,returnCredit:totals.reduce((n,t)=>n+Number(t.credit),0),result:'PASS'}));
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({timezoneId:'Asia/Karachi'});
    await context.addInitScript(token=>localStorage.setItem('medsense_auth_user',JSON.stringify({token})),token);
    await context.route('**/api/**',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
    const page=await context.newPage();page.setDefaultTimeout(120000);
    await page.goto('http://127.0.0.1:5173/pharmacist/dashboard/inventory');
    await check(page.getByRole('heading',{name:'Inventory',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Stock Batches',exact:true}).click();
    await check(page.locator('table tbody tr')).toHaveCount(234);
    await check(page.getByRole('columnheader',{name:'Discount%',exact:true})).toBeVisible();
    const receiptCells=await page.locator('table tbody tr').evaluateAll(rs=>rs.map(r=>[...r.querySelectorAll('td')].map(c=>c.innerText)));
    assert.ok(receiptCells.every(r=>r[5]==='0%'));
    assert.deepEqual(receiptCells.map(r=>r[0]).sort(),Array.from({length:234},(_,i)=>num('STK',i+1)).sort());
    assert.deepEqual(receiptCells.map(r=>r[2]).sort(),Array.from({length:234},(_,i)=>num('BILL',i+1)).sort());
    await page.getByRole('button',{name:'Opening / Adjusted Stock',exact:true}).click();
    await check(page.locator('table tbody tr')).toHaveCount(234);
    const openingCells=await page.locator('table tbody tr td:first-child').allTextContents();
    assert.deepEqual(openingCells.sort(),Array.from({length:234},(_,i)=>num('OPEN',i+1)).sort());
    await page.getByRole('button',{name:'Stock Returns',exact:true}).click();
    await check(page.locator('table tbody tr')).toHaveCount(25);
    await check(page.getByRole('columnheader',{name:'Reason',exact:true})).toBeVisible();
    const returnCells=await page.locator('table tbody tr').evaluateAll(rs=>rs.map(r=>[...r.querySelectorAll('td')].map(c=>c.innerText)));
    assert.ok(returnCells.every(r=>r[4]==='Damaged'));
    assert.deepEqual(returnCells.map(r=>r[0]).sort(),Array.from({length:25},(_,i)=>num('SRET',i+1)).sort());
    for(const s of totals) assert.equal(returnCells.filter(r=>r[2]===s.supplier_name).length,5);
    assert.equal(await fingerprint(),before,'Read-only verification preserves stock and money');
    console.log('PASS: actual frontend displays0% discounts,234 opening records,25 Damaged returns, and sequential document numbers.');
  } finally {await browser?.close();await sequelize.close();}
}
main().catch(e=>{console.error('Stock activity verification failed:',e.message);process.exitCode=1;});
