const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const jwt = require('jsonwebtoken');
const { chromium, expect } = require('../../medsense_ai/node_modules/@playwright/test');
const { sequelize, User, Brand } = require('../src/models');
require('../src/models/StockReturn');
require('../src/models/StockReturnReport');
require('../src/models/StockHistoryOpen');
sequelize.options.logging = false;
const project = path.resolve(__dirname,'../..');
const output = path.join(project,'database/final-postgresql-20261003/runtime-verification.json');
async function json(url, token) {
  const response = await fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,new URL(url).pathname);
  return response.json();
}
async function main() {
  let browser, original, changed = false;
  try {
    assert.ok(['localhost','127.0.0.1'].includes(process.env.DB_HOST));
    assert.equal(process.env.DB_NAME,'medsenseai_pharm');
    assert.equal(process.env.DB_SCHEMA,'public');
    const missing = [];
    for (const model of Object.values(sequelize.models)) {
      const columns = await sequelize.getQueryInterface().describeTable(model.getTableName());
      for (const attribute of Object.values(model.rawAttributes)) {
        if (!columns[attribute.field]) missing.push(model.tableName+'.'+attribute.field);
      }
    }
    assert.deepEqual(missing,[],'Missing runtime model columns');
    const staff = await User.findAll({where:{isActive:true,isApproved:true,isEmailVerified:true},order:[['created_at','ASC']]});
    assert.ok(staff.length);
    const tokens = [staff[0],staff[1] || staff[0]].map(user => jwt.sign({id:user.id,role:user.role},process.env.JWT_SECRET,{expiresIn:'15m'}));
    const [apiProducts,proxyProducts,secondProducts] = await Promise.all([
      json('http://127.0.0.1:5005/api/products',tokens[0]),
      json('http://127.0.0.1:5173/api/products',tokens[0]),
      json('http://127.0.0.1:5173/api/products',tokens[1]),
    ]);
    assert.deepEqual(proxyProducts,apiProducts);
    assert.deepEqual(secondProducts,apiProducts);
    const [counts] = await sequelize.query(`SELECT (SELECT count(*)::int FROM product WHERE NOT archived) products,
      (SELECT count(*)::int FROM brand) brands,(SELECT count(*)::int FROM supplier_info) suppliers,
      (SELECT count(*)::int FROM stock_history) batches,(SELECT count(*)::int FROM invoice) invoices,
      (SELECT count(*)::int FROM invoice_return) returns,(SELECT count(*)::int FROM customer) customers`,
      {type:sequelize.QueryTypes.SELECT});
    assert.equal(apiProducts.length,counts.products);
    const aiEnv = require('dotenv').parse(fs.readFileSync(path.join(project,'ai_service/.env')));
    const aiUrl = new URL(aiEnv.MEDSENSE_DATABASE_URL);
    assert.equal(aiUrl.hostname,process.env.DB_HOST);
    assert.equal(aiUrl.pathname,'/'+process.env.DB_NAME);
    assert.equal(aiUrl.searchParams.get('options'),'-csearch_path=public');
    for (const url of ['http://127.0.0.1:5005/health','http://127.0.0.1:8000/api/v1/health','http://127.0.0.1:8002/api/v1/lead-runtime/health']) await json(url);
    browser = await chromium.launch({channel:'msedge',headless:true});
    const contexts = await Promise.all(tokens.map(async token => {
      const context = await browser.newContext();
      await context.addInitScript(token => localStorage.setItem('medsense_auth_user',JSON.stringify({token})),token);
      return context;
    }));
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const errors = [];
    pages.forEach(page => page.on('pageerror',error => errors.push(error.message)));
    original = await Brand.findOne({order:[['brand_id','ASC']]});
    assert.ok(original);
    const originalName = original.brand_name;
    await Promise.all(pages.map(page => page.goto('http://127.0.0.1:5173/pharmacist/dashboard/brands')));
    for (const page of pages) await expect(page.getByText(originalName,{exact:true})).toBeVisible({timeout:30000});
    const updatedName = originalName + ' sync verification';
    changed = true;
    await pages[0].getByText(originalName,{exact:true}).locator('..').getByTitle('Edit brand').click();
    await pages[0].locator('form input').fill(updatedName);
    const saved = pages[0].waitForResponse(response => response.request().method()==='PUT' && response.url().includes('/api/brand/'));
    await pages[0].locator('form button[type="submit"]').click();
    assert.equal((await saved).status(),200);
    await expect(pages[1].getByText(updatedName,{exact:true})).toBeVisible({timeout:18000});
    assert.equal((await Brand.findByPk(original.brand_id)).brand_name,updatedName);
    // Restore through the same public application API, then verify the other session refreshes.
    const restored = await contexts[0].request.put(`http://127.0.0.1:5173/api/brand/brand-${original.brand_id}`,
      {headers:{Authorization:`Bearer ${tokens[0]}`},data:{name:originalName}});
    assert.equal(restored.status(),200);
    await expect(pages[1].getByText(originalName,{exact:true})).toBeVisible({timeout:18000});
    assert.equal((await Brand.findByPk(original.brand_id)).brand_name,originalName);
    changed = false;
    // Visit every changed master surface to catch runtime errors beyond compilation.
    for (const route of ['inventory','customers','products','suppliers','orders','settings','analytics']) {
      await pages[0].goto(`http://127.0.0.1:5173/pharmacist/dashboard/${route}`);
      await pages[0].waitForLoadState('networkidle',{timeout:25000});
    }
    assert.deepEqual(errors,[],'Browser runtime errors');
    const report = {verifiedAt:new Date().toISOString(),database:process.env.DB_NAME,schema:'public',counts,
      runtimeModelColumns:'PASS',frontendMatchesDatabase:'PASS',twoUserSessions:'PASS',
      committedFrontendEditStoredInPostgresql:'PASS',otherSessionRefreshWithoutReload:'PASS',
      originalBrandRestored:'PASS',aiUsesSameDatabase:'PASS',browserErrors:errors};
    fs.writeFileSync(output,JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally {
    if (changed && original) await original.update({brand_name:original.brand_name});
    if (browser) await browser.close();
    await sequelize.close();
  }
}
main().catch(error => {console.error(error.message);process.exitCode=1;});
