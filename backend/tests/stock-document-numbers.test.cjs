const test = require('node:test');
const assert = require('node:assert/strict');
const { sequelize } = require('../src/config/database');
const { nextDocumentNumber, formatDocumentNumber } = require('../src/services/stockDocumentNumberService');
const { generateNextInvoiceNumber } = require('../src/services/invoiceNumberService');
test('document numbers require a transaction and reject unknown domains', async () => {
  await assert.rejects(nextDocumentNumber('stock', null), /transaction/);
  await assert.rejects(nextDocumentNumber('unsafe', {}), /Unknown/);
});
test('document allocation locks before finding the maximum existing business number', async t => {
  const transaction = {}, calls = [];
  t.mock.method(sequelize, 'query', async (sql, options) => {
    assert.equal(options.transaction, transaction);calls.push(sql);
    return sql.includes('MAX(') ? [{last:'234'}] : [];
  });
  assert.equal(await nextDocumentNumber('bill',transaction),'BILL-235');
  assert.match(calls[0],/pg_advisory_xact_lock/);assert.match(calls[1],/MAX\(substring/);
});
test('new returns start at 001 and number 1000 does not wrap or truncate', async t => {
  let last='0';
  t.mock.method(sequelize,'query',async sql=>sql.includes('MAX(')?[{last}]:[]);
  assert.equal(await nextDocumentNumber('returns',{}),'SRET-001');last='999';
  assert.equal(await nextDocumentNumber('returns',{}),'SRET-1000');
  assert.equal(formatDocumentNumber('BILL-0001'),'BILL-001');
  assert.equal(formatDocumentNumber('BATCH-1000'),'BATCH-1000');
});
test('future invoices use three digits and continue highest legacy invoice suffix', async t => {
  t.mock.method(sequelize,'query',async sql=> {
    if(sql.includes('SELECT invoice_number')) {assert.match(sql,/ORDER BY substring/);return [{invoice_number:'INV-000099'}];}
    return [];
  });
  assert.equal(await generateNextInvoiceNumber({}),'INV-100');
});
test.after(()=>sequelize.close());
