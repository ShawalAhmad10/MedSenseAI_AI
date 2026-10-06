// Read-only reconciliation of the supplied workbook with the database, APIs and real Edge pages.
// Tokens stay in memory. Browser analytics and every other non-read API request are blocked.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const { chromium, expect } = require('../../medsense_ai/node_modules/@playwright/test');
const { sequelize } = require('../src/config/database');
const { Pharmacist, Customer } = require('../src/models');
const directory = require('../data/requested-business-directory.json');
const categories = require('../data/requested-categories.json');
const prepared = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/prepared-stock-workbook.json'), 'utf8'));
const receipts = prepared.receipts;
const API_BASE = 'http://127.0.0.1:5005/api';
const FRONTEND_BASE = 'http://127.0.0.1:5173';
const check = expect.configure({ timeout: 90000 });
sequelize.options.logging = false;

const number = value => Number(value || 0);
const cents = value => Math.round(number(value) * 100);
const supplierName = value => value === 'ShahAlmad' ? 'Shawal Ahmad' : value;
const moneyEqual = (actual, expected, message) => assert.equal(cents(actual), cents(expected), message);
const numericText = value => Number(String(value).replace(/PKR|,/g, '').trim());
const byArrival = (a, b) => a.creationDate.localeCompare(b.creationDate) ||
  String(a.createdAt).localeCompare(String(b.createdAt)) || number(a.batchId) - number(b.batchId);
const report = (name, data = {}) => console.log(JSON.stringify({ check: name, ...data, result: 'PASS' }));

async function select(sql, replacements = {}) {
  assert.match(sql.trim(), /^SELECT\b/i, 'This verifier only executes SELECT statements');
  return sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
}

async function fingerprint() {
  const tables = ['product', 'stock', 'stock_history', 'stock_report', 'supplier_info',
    'supplier_accounts', 'supplier_ledger', 'invoice', 'invoice_report', 'brand', 'medicine_categories'];
  const state = {};
  for (const table of tables) {
    const [row] = await select(`SELECT count(*)::int AS count,
      md5(COALESCE(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) AS fingerprint
      FROM ${table} t`);
    state[table] = row;
  }
  return state;
}

async function getJSON(url, token) {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(180000),
  });
  assert.equal(response.status, 200, `GET ${new URL(url).pathname}: HTTP ${response.status}`);
  return response.json();
}

function validatePreparedRows() {
  for (const version of ['original', 'updated']) {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(prepared.source[`${version}Path`])).digest('hex');
    assert.equal(digest, prepared.source[`${version}Sha256`], `${version} workbook matches its prepared hash`);
  }
  assert.ok(Array.isArray(receipts));
  assert.equal(receipts.length, 234);
  const titles = new Map();
  receipts.forEach((receipt, index) => {
    assert.equal(receipt.sourceStockNumber, index + 1, 'Workbook stock sequence');
    assert.equal(receipt.billNo, `BILL-${String(index + 1).padStart(4, '0')}`);
    assert.equal(receipt.items.length, 1);
    assert.equal(receipt.paymentStatus, 'Paid');
    const item = receipt.items[0];
    assert.equal(item.batchNumber, `BATCH-${String(index + 1).padStart(3, '0')}`);
    assert.equal(number(item.initialQuantity), number(item.qty) + number(item.bonus), 'Free bonus is still physical stock');
    assert.ok(Number.isSafeInteger(number(item.qty)) && number(item.qty) > 0);
    assert.ok(Number.isSafeInteger(number(item.bonus)) && number(item.bonus) >= 0);
    moneyEqual(item.grossTotal, number(item.qty) * number(item.purchasePrice), 'Only paid units are charged');
    moneyEqual(item.totalPrice, Math.max(number(item.grossTotal) - number(item.discount) +
      number(item.salesTax) + number(item.advanceTax), 0), 'Recalculated free-bonus line total');
    moneyEqual(receipt.totalAmount, item.totalPrice, 'Receipt equals its line');
    moneyEqual(receipt.paidAmount, receipt.totalAmount, 'Fully paid receipt');
    moneyEqual(receipt.dueAmount, 0, 'No unpaid amount');
    titles.set(item.productName, (titles.get(item.productName) || 0) + 1);
  });
  assert.equal(titles.size, 117);
  assert.ok([...titles.values()].every(count => count === 2), 'Two receipts per inventory product');
  report('prepared workbook integrity', { receipts: receipts.length, products: titles.size,
    billRange: 'BILL-0001..BILL-0234', batchRange: 'BATCH-001..BATCH-234', originalWorkbookPreserved: true });
}

async function reconcileDatabase() {
  const bills = receipts.map(row => row.billNo);
  const rows = await select(`SELECT s.stock_id AS "stockId", s.bill_no AS "billNo",
    s.supplier_id AS "supplierId", si.supplier_name AS "supplierName", s.total_amount AS "totalAmount",
    s.paid_amount AS "paidAmount", s.due_amount AS "dueAmount", s.creation_day::text AS "creationDate",
    s.status AS "receiptStatus", h.batch_id AS "batchId", h.batch_number AS "batchNumber",
    h.product_id AS "productId", h.product_title AS "productName", h.product_quantity AS qty,
    h.product_bonus AS bonus, h.initial_quantity AS "initialQuantity", h.remaining_quantity AS "remainingQuantity",
    h.product_price AS "purchasePrice", h.sale_price AS "salePrice", h.sales_tax AS "salesTax",
    h.advance_tax AS "advanceTax", h.product_discount AS discount, h.total_price AS "totalPrice",
    h.creation_day::text AS "arrivalDate", h.expiry_date::text AS "expiryDate",
    (h.created_at AT TIME ZONE 'Asia/Karachi')::text AS "createdAt",
    h.status AS "rowStatus", h.batch_status AS "batchStatus", p.product_title AS "catalogTitle",
    p.product_brand AS "brandId", b.brand_name AS "brandName", p.product_supplier AS "productSupplierId",
    p.product_pack_size AS "packSize", p.product_status AS "productStatus", p.fifo_family_id AS "familyId",
    p.manually_inactive AS "manuallyInactive", p.archived
    FROM stock s JOIN supplier_info si ON si.supplier_id=s.supplier_id
    JOIN stock_history h ON h.stock_id=s.stock_id JOIN product p ON p.product_id=h.product_id
    JOIN brand b ON b.brand_id=p.product_brand WHERE s.bill_no IN (:bills)`, { bills });
  assert.equal(rows.length, 234, 'One saved batch for every supplied receipt');
  assert.equal(new Set(rows.map(row => row.stockId)).size, 234);
  assert.equal(new Set(rows.map(row => row.batchId)).size, 234);
  assert.equal(new Set(rows.map(row => row.productId)).size, 117);
  const byBill = new Map(rows.map(row => [row.billNo, row]));
  for (const receipt of receipts) {
    const item = receipt.items[0];
    const actual = byBill.get(receipt.billNo);
    assert.ok(actual, `Missing saved ${receipt.billNo}`);
    assert.equal(actual.supplierName, supplierName(receipt.supplier), `Supplier: ${receipt.billNo}`);
    assert.equal(actual.supplierId, actual.productSupplierId, 'Medicine keeps its one assigned supplier');
    assert.equal(actual.creationDate, receipt.creationDate);
    assert.equal(actual.arrivalDate, receipt.creationDate, 'FIFO arrival is the purchase date');
    assert.equal(actual.createdAt.slice(0, 10), receipt.creationDate, 'Batch timestamp preserves historical arrival');
    assert.equal(actual.expiryDate, item.expiryDate);
    assert.equal(actual.batchNumber, item.batchNumber);
    assert.equal(actual.productName, item.productName);
    assert.equal(actual.catalogTitle, item.productName);
    assert.equal(actual.brandName, item.brandName);
    for (const field of ['qty', 'bonus', 'initialQuantity', 'packSize']) {
      assert.equal(number(actual[field]), number(item[field]), `${field}: ${receipt.billNo}`);
    }
    assert.equal(number(actual.remainingQuantity), number(item.initialQuantity), 'No sale is part of this import');
    for (const field of ['purchasePrice', 'salePrice', 'discount', 'salesTax', 'advanceTax', 'totalPrice']) {
      moneyEqual(actual[field], item[field], `${field}: ${receipt.billNo}`);
    }
    for (const field of ['totalAmount', 'paidAmount', 'dueAmount']) {
      moneyEqual(actual[field], receipt[field], `${field}: ${receipt.billNo}`);
    }
    assert.equal(actual.receiptStatus, 1);
    assert.equal(actual.rowStatus, 1);
    assert.equal(actual.batchStatus, 'ACTIVE');
    assert.equal(actual.productStatus, 1);
    assert.equal(actual.manuallyInactive, false);
    assert.equal(actual.archived, false);
  }
  const stockIds = rows.map(row => row.stockId);
  const ledger = await select(`SELECT *, creation_day::text AS "creationDate",
    (time_created AT TIME ZONE 'Asia/Karachi')::date::text AS "recordedDate" FROM supplier_ledger
    WHERE stock_id IN (:stockIds) ORDER BY ledger_number`, { stockIds });
  assert.equal(ledger.length, 468, 'One receipt debit and one paid credit per imported bill');
  for (const receipt of receipts) {
    const actual = byBill.get(receipt.billNo);
    const entries = ledger.filter(row => row.stock_id === actual.stockId);
    const debit = entries.find(row => row.transaction_type === 'stock_receive');
    const credit = entries.find(row => row.transaction_type === 'payment');
    assert.ok(debit && credit, 'Both bill and payment are recorded');
    assert.equal(entries.length, 2);
    assert.equal(debit.reference_type, 'STOCK');
    assert.equal(credit.reference_type, 'PAYMENT');
    assert.equal(debit.product_id, actual.productId);
    assert.equal(credit.product_id, null);
    for (const entry of entries) {
      assert.equal(entry.supplier_id, actual.supplierId);
      assert.equal(entry.reference_number, receipt.billNo);
      assert.equal(entry.creationDate, receipt.creationDate, 'Ledger preserves the workbook purchase/payment date');
      assert.equal(entry.recordedDate, receipt.creationDate, 'Ledger timestamp preserves the purchase/payment date in Pakistan');
      assert.equal(entry.status, 1);
      assert.equal(entry.performed_by, 'Stock workbook import');
    }
    moneyEqual(debit.debit_amount, receipt.totalAmount, 'Supplier receipt debit');
    moneyEqual(debit.credit_amount, 0, 'Receipt has no payment credit');
    moneyEqual(credit.credit_amount, receipt.paidAmount, 'Supplier payment credit');
    moneyEqual(credit.amount_paid, receipt.paidAmount, 'Actual paid amount');
    moneyEqual(credit.debit_amount, 0, 'Payment has no receipt debit');
    moneyEqual(credit.balance, number(debit.balance) - number(credit.credit_amount), 'Supplier running balance after payment');
  }
  const accounts = await select('SELECT * FROM supplier_accounts WHERE status=1');
  const supplierRows = new Map();
  for (const row of rows) {
    if (!supplierRows.has(row.supplierId)) supplierRows.set(row.supplierId, []);
    supplierRows.get(row.supplierId).push(row);
  }
  for (const [supplierId, imported] of supplierRows) {
    const account = accounts.find(row => row.supplier_id === supplierId);
    assert.ok(account, 'Imported supplier has an active account');
    const expectedAmount = imported.reduce((sum, row) => sum + cents(row.totalAmount), 0);
    const importedLedger = ledger.filter(row => row.supplier_id === supplierId);
    assert.equal(importedLedger.reduce((sum, row) => sum + cents(row.debit_amount), 0), expectedAmount);
    assert.equal(importedLedger.reduce((sum, row) => sum + cents(row.credit_amount), 0), expectedAmount);
    assert.ok(importedLedger.every(row => row.supplier_account_id === account.supplier_account_id));
    assert.ok(cents(account.total_debit) >= expectedAmount && cents(account.total_credit) >= expectedAmount,
      'Account includes imported paid totals and keeps any preexisting balances');
  }
  const imports = await select(`SELECT receipt_count, batch_count, metadata FROM stock_workbook_imports
    WHERE original_sha256=:original AND updated_sha256=:updated`, {
    original: prepared.source.originalSha256, updated: prepared.source.updatedSha256,
  });
  assert.equal(imports.length, 1, 'Exactly one committed import for this workbook');
  const importedRecord = imports[0];
  assert.equal(importedRecord.receipt_count, 234);
  assert.equal(importedRecord.batch_count, 234);
  const metadata = typeof importedRecord.metadata === 'string' ? JSON.parse(importedRecord.metadata) : importedRecord.metadata;
  assert.deepEqual([...metadata.stockIds].sort((a, b) => a - b), [...stockIds].sort((a, b) => a - b), 'Recorded import receipt IDs');
  assert.deepEqual([...metadata.batchIds].sort((a, b) => a - b), rows.map(row => row.batchId).sort((a, b) => a - b),
    'Recorded import batch IDs');
  assert.equal(metadata.receipts.length, 234);
  for (const receipt of receipts) {
    const saved = byBill.get(receipt.billNo);
    const mapping = metadata.receipts.find(row => String(row.sourceStockNumber) === String(receipt.sourceStockNumber));
    assert.ok(mapping, 'Workbook stock sequence has a saved ID mapping');
    assert.equal(mapping.billNo, receipt.billNo);
    assert.equal(mapping.stockId, saved.stockId);
    assert.equal(mapping.items[0].batchNumber, saved.batchNumber);
    assert.equal(mapping.items[0].batchId, saved.batchId);
    assert.equal(mapping.items[0].productId, saved.productId);
  }
  assert.ok(Array.isArray(metadata.accountsBefore) && Array.isArray(metadata.accountsAfter),
    'Import records the existing financial account balances');
  for (const [supplierId, imported] of supplierRows) {
    const account = accounts.find(row => row.supplier_id === supplierId);
    const original = metadata.accountsBefore.find(row => row.supplier_id === supplierId);
    const savedAfter = metadata.accountsAfter.find(row => row.supplier_id === supplierId);
    assert.ok(savedAfter, 'Import has a supplier account result');
    const amount = imported.reduce((sum, row) => sum + cents(row.totalAmount), 0) / 100;
    const supplierTotal = metadata.perSupplierTotals.find(row => row.supplierId === supplierId);
    assert.ok(supplierTotal, 'Supplier totals recorded in the import');
    assert.equal(supplierTotal.receiptCount, imported.length);
    moneyEqual(supplierTotal.totalAmount, amount, 'Recorded supplier receipt total');
    moneyEqual(supplierTotal.paidAmount, amount, 'Recorded supplier paid total');
    moneyEqual(supplierTotal.dueAmount, 0, 'Recorded supplier due total');
    moneyEqual(account.total_debit, number(original?.total_debit) + amount, 'Existing supplier debit plus imported receipts');
    moneyEqual(account.total_credit, number(original?.total_credit) + amount, 'Existing supplier credit plus imported payments');
    moneyEqual(account.current_balance, original?.current_balance, 'Fully paid stock preserves prior supplier balance');
    moneyEqual(account.total_return, original?.total_return, 'Existing returns preserved');
    moneyEqual(account.opening_balance, original?.opening_balance, 'Existing opening balance preserved');
    if (original) assert.equal(account.supplier_account_id, original.supplier_account_id, 'Existing financial account ID preserved');
    for (const field of ['current_balance', 'total_debit', 'total_credit', 'total_return', 'opening_balance']) {
      moneyEqual(account[field], savedAfter[field], 'Account equals the committed import result');
    }
  }
  const stockReport = await select(`SELECT *, (transaction_date AT TIME ZONE 'Asia/Karachi')::date::text AS "movementDate"
    FROM stock_report WHERE reference_type='STOCK'
    AND reference_id IN (:stockIds)`, { stockIds });
  assert.equal(stockReport.length, 234);
  for (const row of rows) {
    const movement = stockReport.find(item => item.batch_id === row.batchId);
    assert.ok(movement, 'Every batch has its purchase movement');
    assert.equal(movement.transaction_type, 'PURCHASE');
    assert.equal(movement.product_id, row.productId);
    assert.equal(movement.reference_id, row.stockId);
    assert.equal(movement.reference_number, row.billNo);
    assert.equal(movement.movementDate, row.creationDate, 'Purchase movement preserves the arrival date in Pakistan');
    assert.equal(movement.quantity_change, row.initialQuantity);
    assert.equal(movement.balance_after, row.initialQuantity);
    moneyEqual(movement.unit_price, row.purchasePrice, 'Movement purchase unit cost');
    moneyEqual(movement.total_value, row.totalPrice, 'Movement uses charged bill total, excludes free bonus cost');
  }
  report('database workbook reconciliation', { receipts: rows.length, batches: rows.length, products: 117,
    supplierLedgerEntries: ledger.length, purchaseMovements: stockReport.length,
    paidTotal: receipts.reduce((sum, row) => sum + cents(row.paidAmount), 0) / 100, bonusesFree: true });
  return { rows, byBill };
}

function assertProducts(products, databaseRows) {
  assert.equal(products.length, 117);
  for (const product of products) {
    const rows = databaseRows.filter(row => `prod-${row.productId}` === product.id).sort(byArrival);
    assert.equal(rows.length, 2);
    assert.equal(product.title, rows[0].catalogTitle);
    assert.equal(product.supplierName, rows[0].supplierName);
    assert.equal(product.brandName, rows[0].brandName);
    assert.equal(number(product.stockQty), rows.reduce((sum, row) => sum + row.remainingQuantity, 0));
    assert.equal(product.status, 'active');
    assert.equal(number(product.batchCount), 2);
    assert.equal(number(product.activeBatchId), rows[0].batchId);
    moneyEqual(product.activeBatchPrice, rows[0].salePrice, 'Product oldest batch price');
    assert.equal(number(product.activeBatchQty), rows[0].remainingQuantity);
  }
}

function assertStockReceipts(response, byBill) {
  assert.equal(response.success, true);
  assert.equal(response.data.length, 234);
  for (const receipt of receipts) {
    const actual = response.data.find(row => row.billNo === receipt.billNo);
    const saved = byBill.get(receipt.billNo);
    assert.ok(actual);
    assert.equal(actual.stock_id, saved.stockId, 'Generated DB stock ID is mapped by bill, not workbook sequence');
    assert.equal(actual.supplierName, saved.supplierName);
    assert.equal(actual.creationDate, receipt.creationDate);
    for (const field of ['totalAmount', 'paidAmount', 'dueAmount']) moneyEqual(actual[field], receipt[field], field);
    assert.equal(actual.items.length, 1);
    const item = actual.items[0];
    assert.equal(item.batchNumber, saved.batchNumber);
    assert.equal(number(item.qty), saved.qty);
    assert.equal(number(item.bonus), saved.bonus);
    assert.equal(number(item.totalQty), saved.initialQuantity);
    assert.equal(number(item.remainingQty), saved.remainingQuantity);
    assert.equal(item.batchStatus, 'ACTIVE');
    moneyEqual(item.totalPrice, saved.totalPrice, 'API free-bonus total');
  }
}

function assertFifoProducts(products, databaseRows, receiptResponse) {
  assert.equal(products.length, 116, 'One storefront card per medicine family; Piriton has two inventory names');
  const familyIds = products.flatMap(row => row.versionIds);
  assert.equal(familyIds.length, 117);
  assert.equal(new Set(familyIds).size, 117);
  const expectedBatchIds = new Set();
  for (const product of products) {
    const queue = databaseRows.filter(row => product.versionIds.includes(`prod-${row.productId}`)).sort(byArrival);
    assert.ok(queue.length === 2 || queue.length === 4);
    const first = queue[0];
    expectedBatchIds.add(first.batchId);
    assert.equal(product.activeBatchId, first.batchId, 'FIFO starts with the oldest arrival');
    assert.equal(product.activeBatchNumber, first.batchNumber);
    assert.equal(product.title, first.productName);
    moneyEqual(product.price, first.salePrice, 'Customer price comes from the FIFO batch');
    assert.equal(product.status, 'active');
    assert.equal(number(product.activeBatchQty), first.remainingQuantity);
    assert.equal(number(product.stockQty), queue.reduce((sum, row) => sum + row.remainingQuantity, 0));
    assert.deepEqual(product.fifoBatches.map(row => row.batchId), queue.map(row => row.batchId));
  }
  const customerMarkedBatchIds = receiptResponse.data.flatMap(receipt => receipt.items)
    .filter(item => item.activeForCustomers).map(item => item.batchId).sort((a, b) => a - b);
  assert.deepEqual(customerMarkedBatchIds, [...expectedBatchIds].sort((a, b) => a - b));
  report('FIFO API availability', { storefrontCards: 116, availableCards: 116,
    inventoryProducts: 117, currentCustomerBatches: expectedBatchIds.size });
}

async function readOnlyContext(browser, authKey, token, blockedWrites) {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Karachi' });
  await context.addInitScript(({ authKey, token }) => {
    localStorage.setItem(authKey, JSON.stringify({ token }));
  }, { authKey, token });
  await context.route('**/api/**', route => {
    const request = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue();
    blockedWrites.push({ method: request.method(), path: new URL(request.url()).pathname });
    return route.abort('blockedbyclient');
  });
  return context;
}

async function verifyBrowser(browser, staffToken, customerToken, products, storefrontProducts, stockResponse, byBill) {
  const blockedWrites = [];
  const staffContext = await readOnlyContext(browser, 'medsense_auth_user', staffToken, blockedWrites);
  const staffPage = await staffContext.newPage();
  staffPage.setDefaultTimeout(90000);
  await staffPage.goto(`${FRONTEND_BASE}/pharmacist/dashboard/products`);
  await check(staffPage.getByRole('heading', { name: 'Product Management', exact: true })).toBeVisible();
  await check(staffPage.getByText(/117 total products/)).toBeVisible();
  await staffPage.locator('select').filter({ has: staffPage.locator('option[value="all"]') }).selectOption('all');
  const editButtons = staffPage.getByRole('button', { name: 'Edit product', exact: true });
  await check(editButtons).toHaveCount(117);
  await check(editButtons.locator('..').locator('..').getByText('active', { exact: true })).toHaveCount(117);
  report('actual pharmacist Products page', { rows: 117, active: 117 });

  await staffPage.goto(`${FRONTEND_BASE}/pharmacist/dashboard/inventory`);
  await check(staffPage.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  await check(staffPage.getByText(/117 products total/)).toBeVisible();
  const inventoryRows = staffPage.locator('table tbody tr');
  await check(inventoryRows).toHaveCount(117);
  const inventoryCells = await inventoryRows.evaluateAll(rows => rows.map(row =>
    [...row.querySelectorAll('td')].map(cell => cell.innerText)));
  for (const product of products) {
    const cells = inventoryCells.find(row => row[0].split('\n')[0] === product.title);
    assert.ok(cells, 'Product is visible in real Inventory');
    assert.equal(cells[2], product.brandName);
    assert.equal(cells[3], product.supplierName);
    assert.equal(number(cells[7].split('\n')[0]), product.stockQty, 'Inventory displays aggregate units, including free bonus');
  }
  await staffPage.getByRole('button', { name: 'Stock Batches', exact: true }).click();
  await check(staffPage.getByText(/234 received stock batches/)).toBeVisible();
  const stockRows = staffPage.locator('table tbody tr');
  await check(stockRows).toHaveCount(234);
  const stockCells = await stockRows.evaluateAll(rows => rows.map(row =>
    [...row.querySelectorAll('td')].map(cell => cell.innerText)));
  for (const receipt of receipts) {
    const saved = byBill.get(receipt.billNo);
    const cells = stockCells.find(row => row[2].trim() === receipt.billNo);
    assert.ok(cells, 'Sequential bill is visible');
    assert.equal(cells[1], saved.supplierName);
    assert.equal(cells[3], new Date(receipt.creationDate).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' }),
      'Visible purchase date');
    assert.equal(cells[4].split('\n')[0], saved.productName, 'Visible received medicine');
    moneyEqual(numericText(cells[5]), receipt.totalAmount, 'Visible total');
    moneyEqual(numericText(cells[6]), receipt.paidAmount, 'Visible paid amount');
    moneyEqual(numericText(cells[7]), 0, 'Visible due amount');
    assert.match(cells[8], /Paid/);
    assert.doesNotMatch(cells[8], /Unpaid/);
  }
  for (const receipt of [receipts[0], receipts.find(row => row.items[0].bonus > 0), receipts.at(-1)].filter(Boolean)) {
    const saved = byBill.get(receipt.billNo);
    const actual = stockResponse.data.find(row => row.billNo === receipt.billNo);
    await stockRows.filter({ has: staffPage.getByText(receipt.billNo, { exact: true }) })
      .getByRole('button', { name: 'View', exact: true }).click();
    const heading = staffPage.getByRole('heading', { name: `Stock Batch ${actual.stockNumber}`, exact: true });
    await check(heading).toBeVisible();
    const modal = heading.locator('..').locator('..').locator('..').locator('..');
    const detailCells = await modal.locator('table tbody tr').first().locator('td').allTextContents();
    assert.equal(detailCells[0].split('Active for Customers')[0].trim(), saved.batchNumber);
    assert.equal(number(detailCells[3]), saved.qty);
    assert.equal(number(detailCells[4]), saved.bonus);
    moneyEqual(numericText(detailCells[5]), saved.purchasePrice, 'Visible batch purchase cost');
    moneyEqual(numericText(detailCells[6]), saved.salePrice, 'Visible batch sale price');
    moneyEqual(numericText(detailCells[11]), saved.totalPrice, 'Visible batch total excludes free bonus');
    assert.equal(number(detailCells[12]), saved.remainingQuantity);
    await modal.locator('button').first().click();
    await check(heading).not.toBeVisible();
  }
  report('actual Inventory and Stock Batches pages', { inventoryRows: 117, receipts: 234,
    dueAmounts: 0, paidStatus: true, batchDetailsChecked: true });

  const customerContext = await readOnlyContext(browser, 'medsense_customer_auth', customerToken, blockedWrites);
  const customerPage = await customerContext.newPage();
  customerPage.setDefaultTimeout(90000);
  await customerPage.goto(`${FRONTEND_BASE}/search`);
  await check(customerPage.getByRole('heading', { name: 'All Products', exact: true })).toBeVisible();
  const cards = customerPage.locator('.sf-product-card');
  await check(cards).toHaveCount(116);
  await check(cards.getByRole('button', { name: 'Out of stock', exact: true })).toHaveCount(0);
  const addButtons = cards.getByRole('button', { name: 'Add to cart', exact: true });
  await check(addButtons).toHaveCount(116);
  assert.ok(await addButtons.evaluateAll(buttons => buttons.every(button => !button.disabled)));
  const visibleCards = await cards.evaluateAll(nodes => nodes.map(node => ({
    title: node.querySelector('strong')?.textContent?.trim(),
    prices: [...node.querySelectorAll('strong')].map(strong => strong.textContent.trim()),
  })));
  for (const product of storefrontProducts) {
    const card = visibleCards.find(row => row.title === product.title);
    assert.ok(card, 'Each FIFO medicine card is visible exactly once');
    assert.equal(visibleCards.filter(row => row.title === product.title).length, 1);
    const priceLabel = card.prices.find(value => value.startsWith('PKR '));
    moneyEqual(numericText(priceLabel), product.price, 'Storefront displays its oldest available batch price');
  }
  const nav = customerPage.getByRole('navigation', { name: 'Store categories' });
  await check(nav.getByRole('link')).toHaveCount(categories.length + 1);
  report('actual storefront', { availableFifoCards: 116, enabledPurchaseButtons: 116,
    duplicateCards: 0, ordersPlaced: 0 });
  report('browser write prevention', { blockedAutomaticWriteRequests: blockedWrites.length });
}

(async () => {
  let browser;
  try {
    validatePreparedRows();
    const before = await fingerprint();
    assert.equal(before.product.count, 117);
    assert.equal(before.stock.count, 234);
    assert.equal(before.stock_history.count, 234);
    assert.equal(before.brand.count, 20);
    assert.equal(before.supplier_info.count, 5);
    assert.equal(before.medicine_categories.count, 35);
    const { rows, byBill } = await reconcileDatabase();
    const staff = (await Pharmacist.findAll({ attributes: ['id', 'role', 'isActive', 'isApproved', 'isEmailVerified'] }))
      .find(row => row.role === 'pharmacist' && row.isActive && row.isApproved && row.isEmailVerified);
    const customer = (await Customer.findAll({ attributes: ['customer_id', 'is_active', 'status'] }))
      .find(row => row.is_active && row.status !== 0);
    assert.ok(staff && customer, 'Approved staff and active customer are required for page verification');
    const staffToken = jwt.sign({ id: staff.id, role: staff.role }, process.env.JWT_SECRET, { expiresIn: '20m' });
    const customerToken = jwt.sign({ id: customer.customer_id, type: 'customer' }, process.env.JWT_SECRET, { expiresIn: '20m' });
    const [products, proxyProducts, stockResponse, proxyStock, storefrontProducts, brands, suppliers, categoryResponse] = await Promise.all([
      getJSON(`${API_BASE}/products`, staffToken), getJSON(`${FRONTEND_BASE}/api/products`, staffToken),
      getJSON(`${API_BASE}/stock/batch`, staffToken), getJSON(`${FRONTEND_BASE}/api/stock/batch`, staffToken),
      getJSON(`${API_BASE}/products?view=storefront`), getJSON(`${API_BASE}/brand`, staffToken),
      getJSON(`${API_BASE}/suppliers`, staffToken), getJSON(`${API_BASE}/products/categories`),
    ]);
    assertProducts(products, rows);
    assertProducts(proxyProducts, rows);
    assertStockReceipts(stockResponse, byBill);
    assertStockReceipts(proxyStock, byBill);
    assertFifoProducts(storefrontProducts, rows, stockResponse);
    assert.deepEqual(brands.map(row => row.name).sort(), [...directory.brands].sort());
    assert.deepEqual(suppliers.map(row => row.name).sort(), directory.suppliers.map(supplierName).sort());
    assert.deepEqual(categoryResponse.data.categories, categories);
    report('backend API and frontend proxy', { activeProducts: 117, receipts: 234, batches: 234,
      categories: 35, brands: 20, suppliers: 5 });
    if (!process.argv.includes('--api-only')) {
      browser = await chromium.launch({ channel: 'msedge', headless: true });
      await verifyBrowser(browser, staffToken, customerToken, products, storefrontProducts, stockResponse, byBill);
    }
    assert.deepEqual(await fingerprint(), before, 'Verification must not change products, stock, money or orders');
    report('database preserved during verification', { readOnly: true });
    console.log('PASS: imported stock matches the workbook; free bonuses, payments and FIFO availability are verified.');
  } finally {
    await browser?.close();
    await sequelize.close();
  }
})().catch(error => {
  console.error('Stock workbook verification failed:', error.message);
  process.exitCode = 1;
});
