require('dotenv').config();
const assert = require('node:assert/strict');
const { chromium } = require('../../medsense_ai/node_modules/@playwright/test');
const jwt = require('jsonwebtoken');
const desired = require('../data/requested-business-directory.json');
const { sequelize } = require('../src/config/database');
const { Pharmacist } = require('../src/models');
sequelize.options.logging=false;
(async()=>{
  let browser;
  try {
    const staff = (await Pharmacist.findAll()).find(row=>row.role==='pharmacist'&&row.isActive&&row.isApproved&&row.isEmailVerified);
    assert.ok(staff);
    const token = jwt.sign({id:staff.id,role:staff.role},process.env.JWT_SECRET,{expiresIn:'5m'});
    for (const [endpoint,names] of [['brand',desired.brands],['suppliers',desired.suppliers]]) {
      const response = await fetch('http://127.0.0.1:5005/api/'+endpoint,{headers:{Authorization:`Bearer ${token}`}});
      assert.equal(response.status,200);
      const rows=await response.json();
      assert.deepEqual(rows.map(row=>row.name).sort(),[...names].sort());
      assert.ok(rows.every(row=>row.status==='active'));
    }
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage();
    await page.addInitScript(({token})=>localStorage.setItem('medsense_auth_user',JSON.stringify({token,role:'pharmacist'})),{token});
    for (const [route,names] of [['brands',desired.brands],['suppliers',desired.suppliers]]) {
      await page.goto('http://127.0.0.1:5173/pharmacist/dashboard/'+route);
      for (const name of names) await page.getByText(name,{exact:true}).first().waitFor({state:'attached',timeout:45000});
      console.log(JSON.stringify({page:route,exactNamesVisible:names.length,result:'PASS'}));
    }
    console.log('Database-backed APIs and both frontend management pages verified.');
  } finally {await browser?.close();await sequelize.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1});
