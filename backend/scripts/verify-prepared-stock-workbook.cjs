const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const original = require('../data/stock-workbook-original.json');
const updated = require('../data/stock-workbook-updated.json');
const prepared = require('../data/prepared-stock-workbook.json');
const cents = value => Math.round(Number(value) * 100);
const cols = row => Object.fromEntries(Object.entries(row.cells).map(([key,value]) => [key.replace(/\d+$/,''), value]));
const sheet = (data,name) => data.find(row => row.name === name).rows.slice(1).map(cols);
const first = sheet(original, 'Stock_Batch_Lines');
const last = sheet(updated, 'Stock_Batch_Lines');
const summaries = sheet(updated, 'Batch_Summary');
assert.equal(last.length, 234);
assert.equal(summaries.length, 234);
let totalCents = 0;
const aggregates = new Map();
for (let i=0;i<last.length;i++) {
  const old = first[i], row = last[i], receipt = prepared.receipts[i], item = receipt.items[0], summary = summaries[i];
  const bill = `BILL-${String(i+1).padStart(4,'0')}`;
  const batch = `BATCH-${String(i+1).padStart(3,'0')}`;
  assert.equal(row.A, i+1); assert.equal(row.C, bill); assert.equal(row.G, batch);
  assert.equal(receipt.billNo, bill); assert.equal(item.batchNumber, batch);
  for (const column of ['A','B','D','E','F','H','I','J','K','L','M','N','O','P','Q','X']) assert.equal(row[column], old[column]);
  const gross = old.H*old.J*cents(old.N);
  const discount = Math.round(gross*old.M/100);
  const subtotal = gross-discount;
  const tax = Math.round(subtotal*Math.round(old.P*100)/10000);
  const advance = Math.round(subtotal*Math.round(old.Q*100)/10000);
  const total = subtotal+tax+advance;
  for (const [column, expected] of Object.entries({R:gross,S:discount,T:subtotal,U:tax,V:advance,W:total,Y:total,Z:0})) assert.equal(cents(row[column]),expected);
  assert.equal(item.qty, old.H*old.J); assert.equal(item.bonus, old.I*old.J); assert.equal(item.initialQuantity, old.K);
  assert.equal(cents(receipt.totalAmount), total); assert.equal(cents(receipt.paidAmount), total); assert.equal(receipt.dueAmount,0);
  assert.equal(summary.B,bill); assert.equal(summary.A,row.B); assert.equal(summary.C,row.D);
  for (const [column, expected] of Object.entries({E:gross,F:tax,G:advance,H:discount,I:subtotal,J:total,K:total,L:0})) assert.equal(cents(summary[column]),expected);
  totalCents += total;
  const key = JSON.stringify([row.E,row.F,row.B]);
  const aggregate = aggregates.get(key)||{units:0,value:0,batches:0};
  aggregate.units+=row.K;aggregate.value+=total;aggregate.batches++;
  aggregates.set(key,aggregate);
}
assert.equal(aggregates.size,117);
for (const row of sheet(updated,'Stock_Reconciliation')) {
  const aggregate = aggregates.get(JSON.stringify([row.A,row.B,row.C]));
  assert.ok(aggregate);assert.equal(row.D,aggregate.units);assert.equal(cents(row.E),aggregate.value);assert.equal(row.H,2);
}
assert.deepEqual(updated.find(sheet=>sheet.name==='Rules_Notes'),original.find(sheet=>sheet.name==='Rules_Notes'));
for (const [field,hash] of [['originalPath','originalSha256'],['updatedPath','updatedSha256']]) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(prepared.source[field]))).digest('hex'),prepared.source[hash]);
}
assert.equal(cents(prepared.totals.revisedTotal),totalCents);
console.log(JSON.stringify({result:'PASS',receipts:234,products:117,total:totalCents/100,
  checks:'Bill/batch sequence, free bonus quantities, rounded totals, paid amounts, summaries and workbook hashes verified'}));
