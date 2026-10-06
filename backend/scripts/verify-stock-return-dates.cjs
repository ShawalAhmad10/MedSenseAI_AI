const assert=require('node:assert/strict'),path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {sequelize}=require('../src/config/database');const {Pharmacist}=require('../src/models');
const jwt=require('jsonwebtoken');const {chromium,expect}=require('../../medsense_ai/node_modules/@playwright/test');
const prepared=require('../data/prepared-stock-workbook.json');
sequelize.options.logging=false;const check=expect.configure({timeout:120000});
const select=(sql,replacements={})=>sequelize.query(sql,{replacements,type:sequelize.QueryTypes.SELECT});
async function fingerprint(){const [r]=await select(`SELECT md5(string_agg(value,E'\n' ORDER BY value)) hash FROM(
  SELECT row_to_json(t)::text value FROM stock_history t UNION ALL SELECT row_to_json(t)::text FROM stock_return t
  UNION ALL SELECT row_to_json(t)::text FROM supplier_accounts t UNION ALL SELECT row_to_json(t)::text FROM supplier_ledger t
  UNION ALL SELECT row_to_json(t)::text FROM stock_report t UNION ALL SELECT row_to_json(t)::text FROM stock_return_report t) x`);return r.hash;}
async function main(){let browser;try{
  const [record]=await select('SELECT metadata FROM stock_workbook_activity_imports WHERE import_key=:key',
    {key:prepared.source.originalSha256+':opening-damaged25-v1'});assert.ok(record.metadata.returnDates);
  const plan=record.metadata.returnDates.plan;assert.equal(plan.length,25);assert.equal(new Set(plan.map(p=>p.date)).size,25);
  const before=await fingerprint();
  const staff=(await Pharmacist.findAll({attributes:['id','role','isActive','isApproved','isEmailVerified']}))
    .find(u=>u.role==='pharmacist'&&u.isActive&&u.isApproved&&u.isEmailVerified);assert.ok(staff);
  const token=jwt.sign({id:staff.id,role:staff.role},process.env.JWT_SECRET,{expiresIn:'20m'});
  async function get(url){const res=await fetch('http://127.0.0.1:5005/api'+url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(120000)});
    assert.equal(res.status,200);return (await res.json()).data;}
  const returns=await get('/stock/return');assert.equal(returns.length,25);
  for(const p of plan){const r=returns.find(r=>r.returnNumber===p.returnNumber);assert.ok(r);assert.equal(r.returnDate,p.date);
    assert.ok(p.date>p.stockDate&&p.date>='2026-07-01'&&p.date<='2026-10-01');}
  const july=await get('/stock/reports/return-report?fromDate=2026-07-01&toDate=2026-07-31&limit=100');
  assert.equal(july.length,plan.filter(p=>p.date<='2026-07-31').length);
  assert.ok(july.every(r=>String(r.creationDay).startsWith('2026-07')));
  const target=plan.find(p=>p.stockDate==='2026-07-05');
  const r=returns.find(r=>r.returnNumber===target.returnNumber);
  const saved=record.metadata.returned.find(x=>x.returnId===target.returnId);
  const payload={stockId:r.stockId,supplierId:r.supplierId,returnType:'normal',description:'Date validation check',
    items:[{batchLineId:`stk-line-${saved.batchId}`,productId:r.items[0].productId,name:r.items[0].name,quantity:1,price:r.items[0].price,expiry:r.items[0].expiry}]};
  for(const date of ['2026-07-01','2026-07-05','2026-02-30','2926-10-01']){
    const response=await fetch('http://127.0.0.1:5005/api/stock/return',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({...payload,returnDate:date}),signal:AbortSignal.timeout(30000)});
    assert.equal(response.status,400,`Invalid return date ${date} must be rejected`);
  }
  assert.equal(await fingerprint(),before,'Rejected date requests must not change stock or money');
  console.log(JSON.stringify({check:'API dates and rejection',returns:25,distinctDates:25,julyReportRows:july.length,invalidRequestsRejected:4,result:'PASS'}));
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({timezoneId:'Asia/Karachi'});
  await context.addInitScript(token=>localStorage.setItem('medsense_auth_user',JSON.stringify({token})),token);
  await context.route('**/api/**',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(120000);
  await page.goto('http://127.0.0.1:5173/pharmacist/dashboard/inventory');
  await check(page.getByRole('heading',{name:'Inventory',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Stock Returns',exact:true}).click();await check(page.locator('table tbody tr')).toHaveCount(25);
  const cells=await page.locator('table tbody tr').evaluateAll(rs=>rs.map(r=>[...r.querySelectorAll('td')].map(c=>c.innerText)));
  const expected=await page.evaluate(plan=>plan.map(p=>({...p,display:new Date(p.date).toLocaleDateString()})),plan);
  for(const p of expected)assert.equal(cells.find(r=>r[0]===p.returnNumber)[7],p.display);
  await page.getByRole('button',{name:'Return Stock',exact:true}).click();
  const heading=page.getByRole('heading',{name:'Return Stock to Supplier',exact:true});await check(heading).toBeVisible();
  const modal=heading.locator('..').locator('..').locator('..').locator('..');
  await modal.locator('select').first().selectOption(r.stockId);
  const dateField=page.getByLabel('Return Date *',{exact:true});await check(dateField).toHaveAttribute('min','2026-07-06');
  await dateField.fill('2026-07-05');assert.equal(await dateField.evaluate(input=>input.validity.rangeUnderflow),true);
  await dateField.fill('2026-07-06');assert.equal(await dateField.evaluate(input=>input.checkValidity()),true);
  assert.equal(await fingerprint(),before);
  console.log('PASS:25 historical dates display correctly; Return Date picker and backend reject returns before/on stock entry.');
}finally{await browser?.close();await sequelize.close();}}
main().catch(e=>{console.error('Return date verification failed:',e.message);process.exitCode=1;});
