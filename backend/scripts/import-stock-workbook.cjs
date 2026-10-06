const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const INPUT_PATH = path.resolve(__dirname, '../data/prepared-stock-workbook.json');
const ACTOR = 'Stock workbook import';
const OLD_SUPPLIER = 'ShahAlmad';
const NEW_SUPPLIER = 'Shawal Ahmad';
const TRACKER = 'stock_workbook_imports';
const ID_COLUMNS = { stock: 'stock_id', stock_history: 'batch_id', stock_report: 'ledger_id',
  supplier_accounts: 'supplier_account_id', supplier_ledger: 'ledger_number' };

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const text = (value, label, max = 255) => {
  assert.equal(typeof value, 'string', `${label} must be text`);
  assert.ok(value.length > 0 && value.length <= max && value === value.trim(), `${label} is invalid`);
  return value;
};
const integer = (value, label, minimum = 0) => {
  assert.ok(typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= 2147483647,
    `${label} must be a whole number between ${minimum} and 2147483647`);
  return value;
};
const cents = (value, label, minimum = 0) => {
  assert.ok(typeof value === 'number' && Number.isFinite(value) && value >= minimum, `${label} is invalid`);
  const result = Math.round(value * 100);
  assert.ok(Number.isSafeInteger(result) && Math.abs(value * 100 - result) < 0.00001,
    `${label} must have at most two decimal places`);
  assert.ok(result <= 9999999999, `${label} exceeds stock_report monetary precision`);
  return result;
};
const decimal = value => (value / 100).toFixed(2);
const date = (value, label) => {
  assert.ok(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  `${label} must be a valid YYYY-MM-DD date`);
  return value;
};
const dbCents = value => Math.round(Number(value || 0) * 100);

function validatePreparedWorkbook(input) {
  assert.ok(input && typeof input === 'object' && input.source, 'Prepared workbook/source is missing');
  const source = {};
  for (const key of ['originalPath', 'updatedPath']) source[key] = text(input.source[key], `source.${key}`, 32767);
  for (const key of ['originalSha256', 'updatedSha256']) {
    assert.ok(typeof input.source[key] === 'string' && /^[a-f0-9]{64}$/.test(input.source[key]), `Invalid source.${key}`);
    source[key] = input.source[key];
  }
  assert.ok(Array.isArray(input.receipts), 'Prepared receipts are missing');
  assert.equal(input.receipts.length, 234, 'This workbook must contain the approved 234 receipts');
  const directory = require('../data/requested-business-directory.json');
  const allowedSuppliers = directory.suppliers.map(name => name === OLD_SUPPLIER ? NEW_SUPPLIER : name);
  const bills = new Set();
  const batches = new Set();
  const sourceNumbers = new Set();
  const productCounts = new Map();
  const receipts = input.receipts.map((receipt, sourceOrder) => {
    const sourceStockNumber = text(String(receipt.sourceStockNumber ?? ''), 'Source stock number');
    assert.ok(!sourceNumbers.has(sourceStockNumber), `Duplicate source stock number ${sourceStockNumber}`);
    sourceNumbers.add(sourceStockNumber);
    const supplier = text(receipt.supplier, `${sourceStockNumber} supplier`);
    assert.ok(allowedSuppliers.includes(supplier), `${sourceStockNumber} has an unapproved supplier`);
    const billNo = text(receipt.billNo, `${sourceStockNumber} bill number`, 100);
    assert.match(billNo, /^BILL-\d{4,}$/, 'Bill number must retain application-compatible BILL-0001 formatting');
    assert.ok(!bills.has(billNo), `Duplicate bill ${billNo}`);
    bills.add(billNo);
    const creationDate = date(receipt.creationDate, `${billNo} arrival date`);
    assert.equal(receipt.paymentStatus, 'Paid', `${billNo} must match the approved fully-paid source`);
    assert.ok(Array.isArray(receipt.items) && receipt.items.length === 1, `${billNo} must have one workbook line`);
    const items = receipt.items.map(item => {
      const productName = text(item.productName, `${billNo} medicine name`);
      const brandName = text(item.brandName, `${billNo} brand`);
      assert.ok(directory.brands.includes(brandName), `${billNo} has an unapproved brand`);
      const batchNumber = text(item.batchNumber, `${billNo} batch number`, 100);
      assert.match(batchNumber, /^BATCH-\d{3,}$/, 'Batch number must retain BATCH-001 formatting');
      assert.ok(!batches.has(batchNumber), `Duplicate batch ${batchNumber}`);
      batches.add(batchNumber);
      const qty = integer(item.qty, `${batchNumber} paid units`, 1);
      const bonus = integer(item.bonus, `${batchNumber} free units`);
      const initialQuantity = integer(item.initialQuantity, `${batchNumber} physical units`, 1);
      const packSize = integer(item.packSize, `${batchNumber} pack size`, 1);
      const qtyPacks = integer(item.qtyPacks, `${batchNumber} purchased packs`, 1);
      const bonusPacks = integer(item.bonusPacks, `${batchNumber} bonus packs`);
      assert.equal(qty, qtyPacks * packSize, `${batchNumber} paid pack/unit conversion differs`);
      assert.equal(bonus, bonusPacks * packSize, `${batchNumber} bonus pack/unit conversion differs`);
      assert.equal(initialQuantity, qty + bonus, `${batchNumber} initial quantity must include free bonuses`);
      const money = {};
      for (const key of ['purchasePrice', 'salePrice', 'discount', 'salesTax', 'advanceTax', 'grossTotal', 'subtotal', 'totalPrice']) {
        money[key] = cents(item[key], `${batchNumber} ${key}`, ['purchasePrice', 'salePrice'].includes(key) ? 0.01 : 0);
      }
      assert.equal(BigInt(money.grossTotal), BigInt(qty) * BigInt(money.purchasePrice), `${batchNumber} charges bonus units or has an incorrect gross total`);
      assert.equal(money.subtotal, money.grossTotal - money.discount, `${batchNumber} subtotal differs`);
      assert.equal(money.totalPrice, money.subtotal + money.salesTax + money.advanceTax, `${batchNumber} total/tax calculation differs`);
      const expiryDate = date(item.expiryDate, `${batchNumber} expiry`);
      assert.ok(expiryDate >= creationDate, `${batchNumber} expired before its arrival`);
      const key = JSON.stringify([productName, brandName, packSize]);
      const prior = productCounts.get(key);
      assert.ok(!prior || prior.supplier === supplier, `${productName} is assigned to multiple suppliers`);
      productCounts.set(key, { supplier, count: (prior?.count || 0) + 1 });
      return { productName, brandName, batchNumber, qty, bonus, initialQuantity, packSize, qtyPacks, bonusPacks,
        expiryDate, ...Object.fromEntries(Object.entries(money).map(([key, value]) => [key, decimal(value)])) };
    });
    const totalAmount = cents(receipt.totalAmount, `${billNo} total`);
    const paidAmount = cents(receipt.paidAmount, `${billNo} paid`);
    const dueAmount = cents(receipt.dueAmount, `${billNo} due`);
    assert.equal(totalAmount, items.reduce((sum, item) => sum + dbCents(item.totalPrice), 0), `${billNo} does not equal its line totals`);
    assert.equal(paidAmount, totalAmount, `${billNo} fully-paid amount differs`);
    assert.equal(dueAmount, 0, `${billNo} cannot have unpaid dues`);
    return { sourceStockNumber, sourceOrder, supplier, billNo, creationDate, paymentStatus: 'Paid',
      totalAmount: decimal(totalAmount), paidAmount: decimal(paidAmount), dueAmount: decimal(dueAmount), items };
  }).sort((a, b) => a.creationDate.localeCompare(b.creationDate) || a.sourceOrder - b.sourceOrder);
  assert.equal(productCounts.size, 117, 'Workbook must cover the existing 117 approved medicines');
  for (const [key, value] of productCounts) assert.equal(value.count, 2, `Expected two arrivals for ${key}`);
  assert.deepEqual([...bills].sort(), Array.from({ length: 234 }, (_, n) => `BILL-${String(n + 1).padStart(4, '0')}`).sort(), 'Bill sequence differs');
  assert.deepEqual([...batches].sort(), Array.from({ length: 234 }, (_, n) => `BATCH-${String(n + 1).padStart(3, '0')}`).sort(), 'Batch sequence differs');
  const payloadSha256 = sha256(JSON.stringify(receipts));
  return { source, receipts, payloadSha256 };
}

function verifySourceFiles(source) {
  for (const prefix of ['original', 'updated']) {
    assert.equal(sha256(fs.readFileSync(source[`${prefix}Path`])), source[`${prefix}Sha256`], `${prefix} workbook checksum changed`);
  }
}

async function allocateIds(client, table, count, apply) {
  const column = ID_COLUMNS[table];
  assert.ok(column, 'Unknown ID allocation table');
  const sql = apply
    ? 'SELECT nextval(pg_get_serial_sequence($1, $2))::bigint AS id FROM generate_series(1,$3::int) n ORDER BY n'
    : `SELECT (COALESCE((SELECT MAX(${column}) FROM ${table}),0)::bigint+n)::bigint AS id FROM generate_series(1,$1::int) n ORDER BY n`;
  const rows = (await client.query(sql, apply ? [table, column, count] : [count])).rows;
  const ids = rows.map(row => Number(row.id));
  ids.forEach(id => integer(id, `${table} allocated ID`, 1));
  return ids;
}

async function createStaging(client, prepared) {
  await client.query(`CREATE TEMP TABLE workbook_receipts (
    receipt_idx integer PRIMARY KEY, source_stock_number text, supplier_name text, supplier_id integer,
    bill_no text, creation_date date, total_amount numeric(14,2), paid_amount numeric(14,2), due_amount numeric(14,2),
    stock_id integer, account_id integer, balance_before numeric(14,2)) ON COMMIT DROP;
    CREATE TEMP TABLE workbook_items (
      item_idx integer PRIMARY KEY, receipt_idx integer, product_name text, brand_name text, product_id integer,
      batch_number text, batch_id integer, qty integer, bonus integer, initial_quantity integer,
      pack_size integer, qty_packs integer, bonus_packs integer, purchase_price numeric(14,2), sale_price numeric(14,2),
      expiry_date date, discount numeric(14,2), sales_tax numeric(14,2), advance_tax numeric(14,2), total_price numeric(14,2)) ON COMMIT DROP`);
  const headers = prepared.receipts.map((receipt, index) => ({ receipt_idx: index + 1,
    source_stock_number: receipt.sourceStockNumber, supplier_name: receipt.supplier, bill_no: receipt.billNo,
    creation_date: receipt.creationDate, total_amount: receipt.totalAmount, paid_amount: receipt.paidAmount, due_amount: receipt.dueAmount }));
  const items = prepared.receipts.flatMap((receipt, index) => receipt.items.map(item => ({ item_idx: index + 1,
    receipt_idx: index + 1, product_name: item.productName, brand_name: item.brandName, batch_number: item.batchNumber,
    qty: item.qty, bonus: item.bonus, initial_quantity: item.initialQuantity, pack_size: item.packSize,
    qty_packs: item.qtyPacks, bonus_packs: item.bonusPacks, purchase_price: item.purchasePrice, sale_price: item.salePrice,
    expiry_date: item.expiryDate, discount: item.discount, sales_tax: item.salesTax,
    advance_tax: item.advanceTax, total_price: item.totalPrice })));
  await client.query(`INSERT INTO workbook_receipts(receipt_idx,source_stock_number,supplier_name,bill_no,creation_date,total_amount,paid_amount,due_amount)
    SELECT * FROM jsonb_to_recordset($1::jsonb) r(receipt_idx integer,source_stock_number text,supplier_name text,
      bill_no text,creation_date date,total_amount numeric,paid_amount numeric,due_amount numeric)`, [JSON.stringify(headers)]);
  await client.query(`INSERT INTO workbook_items(item_idx,receipt_idx,product_name,brand_name,batch_number,qty,bonus,initial_quantity,
      pack_size,qty_packs,bonus_packs,purchase_price,sale_price,expiry_date,discount,sales_tax,advance_tax,total_price)
    SELECT * FROM jsonb_to_recordset($1::jsonb) i(item_idx integer,receipt_idx integer,product_name text,brand_name text,
      batch_number text,qty integer,bonus integer,initial_quantity integer,pack_size integer,qty_packs integer,bonus_packs integer,
      purchase_price numeric,sale_price numeric,expiry_date date,discount numeric,sales_tax numeric,advance_tax numeric,total_price numeric)`, [JSON.stringify(items)]);
}

async function resolveMasters(client) {
  const aliases = (await client.query('SELECT supplier_id,supplier_name,status FROM supplier_info WHERE supplier_name=ANY($1::text[])', [[OLD_SUPPLIER, NEW_SUPPLIER]])).rows;
  assert.equal(aliases.length, 1, 'Expected exactly one existing old/new Shawal Ahmad supplier; no new supplier will be created');
  assert.equal(aliases[0].status, 1, 'Shawal Ahmad supplier must be active');
  const badSuppliers = (await client.query(`SELECT r.supplier_name,COUNT(s.supplier_id)::int AS matches FROM workbook_receipts r
    LEFT JOIN supplier_info s ON CASE WHEN s.supplier_name=$1 THEN $2 ELSE s.supplier_name END=r.supplier_name AND s.status=1
    GROUP BY r.receipt_idx,r.supplier_name HAVING COUNT(s.supplier_id)<>1`, [OLD_SUPPLIER, NEW_SUPPLIER])).rows;
  assert.equal(badSuppliers.length, 0, 'Workbook supplier is missing, inactive or ambiguous');
  await client.query(`UPDATE workbook_receipts r SET supplier_id=s.supplier_id FROM supplier_info s
    WHERE CASE WHEN s.supplier_name=$1 THEN $2 ELSE s.supplier_name END=r.supplier_name AND s.status=1`, [OLD_SUPPLIER, NEW_SUPPLIER]);
  const unmatched = (await client.query(`SELECT i.product_name,i.brand_name,i.pack_size,COUNT(p.product_id)::int AS matches
    FROM workbook_items i LEFT JOIN brand b ON b.brand_name=i.brand_name AND b.status=1
    LEFT JOIN product p ON p.product_title=i.product_name AND p.product_brand=b.brand_id
      AND p.product_pack_size=i.pack_size AND NOT p.archived
    GROUP BY i.item_idx,i.product_name,i.brand_name,i.pack_size HAVING COUNT(p.product_id)<>1`)).rows;
  assert.equal(unmatched.length, 0, `Medicine/title/brand/pack matching failed: ${JSON.stringify(unmatched.slice(0, 5))}`);
  await client.query(`UPDATE workbook_items i SET product_id=p.product_id FROM product p JOIN brand b ON b.brand_id=p.product_brand
    WHERE p.product_title=i.product_name AND b.brand_name=i.brand_name AND b.status=1
      AND p.product_pack_size=i.pack_size AND NOT p.archived`);
  const supplierConflicts = (await client.query(`SELECT i.product_name FROM workbook_items i JOIN product p USING(product_id)
    JOIN workbook_receipts r USING(receipt_idx) WHERE p.product_supplier IS DISTINCT FROM r.supplier_id`)).rows;
  assert.equal(supplierConflicts.length, 0, `Medicine supplier assignment differs: ${JSON.stringify(supplierConflicts.slice(0, 5))}`);
  return { supplierId: aliases[0].supplier_id, oldName: OLD_SUPPLIER, newName: NEW_SUPPLIER,
    changed: aliases[0].supplier_name === OLD_SUPPLIER };
}

async function snapshotAffected(client, trackerExists) {
  const snapshots = {};
  for (const [table, predicate] of [
    ['product', 'product_id IN(SELECT product_id FROM workbook_items)'],
    ['supplier_info', 'supplier_id IN(SELECT supplier_id FROM workbook_receipts)'],
    ['stock', 'supplier_id IN(SELECT supplier_id FROM workbook_receipts)'],
    ['stock_history', 'product_id IN(SELECT product_id FROM workbook_items) OR stock_id IN(SELECT stock_id FROM stock WHERE supplier_id IN(SELECT supplier_id FROM workbook_receipts))'],
    ['stock_report', 'product_id IN(SELECT product_id FROM workbook_items)'],
    ['supplier_accounts', 'supplier_id IN(SELECT supplier_id FROM workbook_receipts)'],
    ['supplier_ledger', 'supplier_id IN(SELECT supplier_id FROM workbook_receipts)'],
    ['medicine_supplier_bindings', 'medicine_key IN(SELECT medicine_supply_key FROM product WHERE product_id IN(SELECT product_id FROM workbook_items))']
  ]) snapshots[table] = (await client.query(`SELECT * FROM ${table} WHERE ${predicate}`)).rows;
  snapshots[TRACKER] = trackerExists ? (await client.query(`SELECT * FROM ${TRACKER}`)).rows : [];
  return snapshots;
}

function createBackup(prepared, before, schema) {
  const directory = path.join(PROJECT_ROOT, 'database', `cloud-migration-stock-import-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  assert.ok(path.resolve(directory).startsWith(path.join(PROJECT_ROOT, 'database') + path.sep), 'Backup path escaped the project');
  fs.mkdirSync(directory, { recursive: false });
  fs.writeFileSync(path.join(directory, 'stock-before.json'), JSON.stringify(before, null, 2), { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'prepared-workbook.json'), JSON.stringify(prepared, null, 2), { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), schema,
    source: prepared.source, payloadSha256: prepared.payloadSha256,
    affectedRows: Object.fromEntries(Object.entries(before).map(([key, rows]) => [key, rows.length])),
    beforeSha256: sha256(fs.readFileSync(path.join(directory, 'stock-before.json'))) }, null, 2), { flag: 'wx' });
  return directory;
}

async function setAllocatedIds(client, table, rows, apply) {
  const ids = await allocateIds(client, table, rows, apply);
  const stage = table === 'stock' ? 'workbook_receipts' : 'workbook_items';
  const index = table === 'stock' ? 'receipt_idx' : 'item_idx';
  const column = table === 'stock' ? 'stock_id' : 'batch_id';
  await client.query(`UPDATE ${stage} s SET ${column}=u.id FROM unnest($1::integer[]) WITH ORDINALITY u(id,n) WHERE s.${index}=u.n`, [ids]);
  return ids;
}

async function insertStock(client, prepared, apply) {
  const stockIds = await setAllocatedIds(client, 'stock', prepared.receipts.length, apply);
  const batchIds = await setAllocatedIds(client, 'stock_history', prepared.receipts.length, apply);
  await client.query(`INSERT INTO stock(stock_id,supplier_id,total_amount,paid_amount,due_amount,discount,bill_no,builty_no,
      creation_day,created_by,status,created_at,updated_at)
    SELECT stock_id,supplier_id,total_amount,paid_amount,due_amount,0,bill_no,'',creation_date,$1,1,
      creation_date::timestamp+receipt_idx*INTERVAL '1 second',NOW() FROM workbook_receipts ORDER BY receipt_idx`, [ACTOR]);
  await client.query(`INSERT INTO stock_history(batch_id,stock_id,product_id,product_title,batch_number,initial_quantity,remaining_quantity,
      product_quantity,product_bonus,product_price,sale_price,expiry_date,batch_status,product_bale,product_bale_size,
      sales_tax,advance_tax,product_discount,total_price,creation_day,status,created_at,updated_at)
    SELECT i.batch_id,r.stock_id,i.product_id,i.product_name,i.batch_number,i.initial_quantity,i.initial_quantity,
      i.qty,i.bonus,i.purchase_price,i.sale_price,i.expiry_date,
      CASE WHEN i.initial_quantity=0 THEN 'FINISHED' WHEN i.expiry_date<CURRENT_DATE THEN 'EXPIRED' ELSE 'ACTIVE' END,
      i.qty_packs,i.pack_size,i.sales_tax,i.advance_tax,i.discount,i.total_price,r.creation_date,1,
      r.creation_date::timestamp+r.receipt_idx*INTERVAL '1 second',NOW()
    FROM workbook_items i JOIN workbook_receipts r USING(receipt_idx) ORDER BY i.item_idx`);
  const reportIds = await allocateIds(client, 'stock_report', batchIds.length, apply);
  await client.query(`INSERT INTO stock_report(ledger_id,batch_id,product_id,transaction_type,quantity_change,balance_after,
      reference_type,reference_id,reference_number,unit_price,total_value,notes,performed_by,transaction_date,
      sales_tax,advance_tax,product_expiry,created_at)
    SELECT ($1::integer[])[i.item_idx],i.batch_id,i.product_id,'PURCHASE',i.initial_quantity,i.initial_quantity,
      'STOCK',r.stock_id,r.bill_no,i.purchase_price,i.total_price,
      'Workbook purchase from '||r.supplier_name||'; bonus units are free',$2,
      r.creation_date::timestamp+r.receipt_idx*INTERVAL '1 second',i.sales_tax,i.advance_tax,i.expiry_date::text,NOW()
    FROM workbook_items i JOIN workbook_receipts r USING(receipt_idx) ORDER BY i.item_idx`, [reportIds, ACTOR]);
  return { stockIds, batchIds, reportIds };
}

async function insertFinances(client, prepared, apply) {
  const missing = (await client.query(`SELECT DISTINCT r.supplier_id FROM workbook_receipts r
    WHERE NOT EXISTS(SELECT 1 FROM supplier_accounts a WHERE a.supplier_id=r.supplier_id AND a.status=1) ORDER BY r.supplier_id`)).rows;
  if (missing.length) {
    const accountIds = await allocateIds(client, 'supplier_accounts', missing.length, apply);
    await client.query(`INSERT INTO supplier_accounts(supplier_account_id,supplier_id,current_balance,total_debit,total_credit,
        total_return,opening_balance,account_status,status,creation_day,created_at,updated_at)
      SELECT u.account_id,u.supplier_id,0,0,0,0,0,'active',1,
        (SELECT MIN(creation_date) FROM workbook_receipts r WHERE r.supplier_id=u.supplier_id),NOW(),NOW()
      FROM unnest($1::integer[],$2::integer[]) u(account_id,supplier_id)`, [accountIds, missing.map(row => row.supplier_id)]);
  }
  await client.query(`UPDATE workbook_receipts r SET account_id=a.supplier_account_id,balance_before=a.current_balance
    FROM supplier_accounts a WHERE a.supplier_id=r.supplier_id AND a.status=1`);
  const ledgerIds = await allocateIds(client, 'supplier_ledger', prepared.receipts.length * 2, apply);
  await client.query(`WITH events AS (
    SELECT r.receipt_idx,0 AS event_rank,r.supplier_id,r.account_id,r.stock_id,i.product_id,i.product_name,
      i.qty,i.purchase_price,i.total_price,0::numeric AS amount_paid,i.total_price AS debit,0::numeric AS credit,
      'stock_receive'::text AS transaction_type,1 AS account_type,'STOCK'::text AS reference_type,r.bill_no,r.creation_date,r.balance_before
    FROM workbook_receipts r JOIN workbook_items i USING(receipt_idx)
    UNION ALL
    SELECT r.receipt_idx,1,r.supplier_id,r.account_id,r.stock_id,NULL,NULL,0,0,0,r.paid_amount,0,r.paid_amount,
      'payment',0,'PAYMENT',r.bill_no,r.creation_date,r.balance_before FROM workbook_receipts r
  ), balanced AS (
    SELECT e.*,ROW_NUMBER() OVER(ORDER BY receipt_idx,event_rank)::int AS allocation_idx,
      balance_before+SUM(debit-credit) OVER(PARTITION BY supplier_id ORDER BY receipt_idx,event_rank ROWS UNBOUNDED PRECEDING) AS running_balance
    FROM events e
  ) INSERT INTO supplier_ledger(ledger_number,supplier_id,supplier_account_id,transaction_type,account_type,payment_type,
      stock_id,product_id,product_title,product_quantity,product_price,total_price,amount_paid,debit_amount,credit_amount,balance,
      description,reference_type,reference_number,performed_by,status,time_created,creation_day,updated_at)
    SELECT ($1::integer[])[allocation_idx],supplier_id,account_id,transaction_type,account_type,0,stock_id,
      product_id,product_name,qty,purchase_price,total_price,amount_paid,debit,credit,running_balance,
      CASE WHEN event_rank=0 THEN 'Stock received from workbook; free bonus excluded from cost' ELSE 'Fully paid workbook bill' END,
      reference_type,bill_no,$2,1,creation_date::timestamp+receipt_idx*INTERVAL '1 second'+event_rank*INTERVAL '1 microsecond',creation_date,NOW()
    FROM balanced ORDER BY receipt_idx,event_rank`, [ledgerIds, ACTOR]);
  await client.query(`WITH totals AS (SELECT supplier_id,SUM(total_amount) AS debit,SUM(paid_amount) AS credit
    FROM workbook_receipts GROUP BY supplier_id)
    UPDATE supplier_accounts a SET total_debit=a.total_debit+t.debit,total_credit=a.total_credit+t.credit,
      current_balance=a.current_balance+t.debit-t.credit,updated_at=NOW()
    FROM totals t WHERE a.supplier_id=t.supplier_id AND a.status=1`);
  return ledgerIds;
}

async function synchronizeProducts(client) {
  const initialized = (await client.query(`WITH first_cost AS (
    SELECT DISTINCT ON(h.product_id) h.product_id,h.product_price FROM stock_history h
    WHERE h.product_id IN(SELECT product_id FROM workbook_items) AND h.status=1 AND h.product_price>0
    ORDER BY h.product_id,COALESCE(h.creation_day,h.created_at::date) ASC NULLS LAST,h.created_at ASC NULLS LAST,h.batch_id
  ) UPDATE product p SET product_purchase_price=f.product_price FROM first_cost f
    WHERE p.product_id=f.product_id AND p.product_purchase_price IS NULL RETURNING p.product_id,p.product_purchase_price`)).rows;
  await client.query(`UPDATE product p SET product_status=CASE WHEN NOT p.archived AND NOT p.manually_inactive AND EXISTS(
    SELECT 1 FROM stock_history h WHERE h.product_id=p.product_id AND h.status=1 AND h.batch_status='ACTIVE'
      AND h.remaining_quantity>0 AND h.sale_price>0 AND(h.expiry_date IS NULL OR h.expiry_date>=CURRENT_DATE)) THEN 1 ELSE 0 END
    WHERE p.product_id IN(SELECT product_id FROM workbook_items)`);
  return initialized;
}

async function verifyInsertedRows(client) {
  const headerErrors = (await client.query(`SELECT r.bill_no FROM workbook_receipts r LEFT JOIN stock s ON s.stock_id=r.stock_id
    WHERE s.stock_id IS NULL OR s.bill_no IS DISTINCT FROM r.bill_no OR s.supplier_id IS DISTINCT FROM r.supplier_id
      OR s.creation_day IS DISTINCT FROM r.creation_date OR ROUND(s.total_amount::numeric,2) IS DISTINCT FROM r.total_amount
      OR ROUND(s.paid_amount::numeric,2) IS DISTINCT FROM r.paid_amount OR ROUND(s.due_amount::numeric,2) IS DISTINCT FROM r.due_amount
      OR s.status<>1`)).rows;
  assert.equal(headerErrors.length, 0, `Imported bill verification failed: ${JSON.stringify(headerErrors.slice(0, 5))}`);
  const batchErrors = (await client.query(`SELECT i.batch_number FROM workbook_items i JOIN workbook_receipts r USING(receipt_idx)
    LEFT JOIN stock_history h ON h.batch_id=i.batch_id WHERE h.batch_id IS NULL OR h.stock_id IS DISTINCT FROM r.stock_id
      OR h.product_id IS DISTINCT FROM i.product_id OR h.product_title IS DISTINCT FROM i.product_name
      OR h.batch_number IS DISTINCT FROM i.batch_number OR h.initial_quantity IS DISTINCT FROM i.initial_quantity
      OR h.product_quantity IS DISTINCT FROM i.qty OR h.product_bonus IS DISTINCT FROM i.bonus
      OR h.remaining_quantity<0 OR h.remaining_quantity>h.initial_quantity OR h.status<>1
      OR h.product_bale IS DISTINCT FROM i.qty_packs OR h.product_bale_size IS DISTINCT FROM i.pack_size
      OR ROUND(h.product_price::numeric,2) IS DISTINCT FROM i.purchase_price OR ROUND(h.sale_price::numeric,2) IS DISTINCT FROM i.sale_price
      OR h.expiry_date IS DISTINCT FROM i.expiry_date OR h.creation_day IS DISTINCT FROM r.creation_date
      OR ROUND(h.sales_tax::numeric,2) IS DISTINCT FROM i.sales_tax OR ROUND(h.advance_tax::numeric,2) IS DISTINCT FROM i.advance_tax
      OR ROUND(h.product_discount::numeric,2) IS DISTINCT FROM i.discount OR ROUND(h.total_price::numeric,2) IS DISTINCT FROM i.total_price`)).rows;
  assert.equal(batchErrors.length, 0, `Imported batch verification failed: ${JSON.stringify(batchErrors.slice(0, 5))}`);
  const reportErrors = (await client.query(`SELECT i.batch_number FROM workbook_items i JOIN workbook_receipts r USING(receipt_idx)
    LEFT JOIN stock_report p ON p.batch_id=i.batch_id AND p.transaction_type='PURCHASE' AND p.performed_by=$1
    GROUP BY i.item_idx,i.batch_number HAVING COUNT(p.ledger_id)<>1 OR BOOL_OR(p.product_id IS DISTINCT FROM i.product_id
      OR p.quantity_change IS DISTINCT FROM i.initial_quantity OR p.balance_after IS DISTINCT FROM i.initial_quantity
      OR p.reference_type IS DISTINCT FROM 'STOCK' OR p.reference_id IS DISTINCT FROM r.stock_id
      OR p.reference_number IS DISTINCT FROM r.bill_no OR p.unit_price IS DISTINCT FROM i.purchase_price
      OR p.total_value IS DISTINCT FROM i.total_price OR p.sales_tax IS DISTINCT FROM i.sales_tax
      OR p.advance_tax IS DISTINCT FROM i.advance_tax OR p.product_expiry IS DISTINCT FROM i.expiry_date::text
      OR p.transaction_date::date IS DISTINCT FROM r.creation_date)`, [ACTOR])).rows;
  assert.equal(reportErrors.length, 0, `Purchase report verification failed: ${JSON.stringify(reportErrors.slice(0, 5))}`);
  const ledgerErrors = (await client.query(`SELECT r.bill_no FROM workbook_receipts r JOIN workbook_items i USING(receipt_idx)
    LEFT JOIN supplier_ledger l
      ON l.stock_id=r.stock_id AND l.performed_by=$1 AND l.status=1
    GROUP BY r.receipt_idx,r.bill_no,r.total_amount,r.paid_amount HAVING COUNT(l.ledger_number)<>2
      OR COUNT(*) FILTER(WHERE l.transaction_type='stock_receive')<>1 OR COUNT(*) FILTER(WHERE l.transaction_type='payment')<>1
      OR COALESCE(SUM(l.debit_amount),0)<>r.total_amount OR COALESCE(SUM(l.credit_amount),0)<>r.paid_amount
      OR COALESCE(SUM(l.amount_paid),0)<>r.paid_amount OR BOOL_OR(l.supplier_id IS DISTINCT FROM r.supplier_id
        OR l.reference_number IS DISTINCT FROM r.bill_no OR l.creation_day IS DISTINCT FROM r.creation_date
        OR l.time_created::date IS DISTINCT FROM r.creation_date
        OR(l.transaction_type='stock_receive' AND(l.reference_type IS DISTINCT FROM 'STOCK'
          OR l.account_type<>1 OR l.product_id IS DISTINCT FROM i.product_id OR l.product_title IS DISTINCT FROM i.product_name
          OR l.product_quantity IS DISTINCT FROM i.qty OR l.product_price IS DISTINCT FROM i.purchase_price
          OR l.total_price IS DISTINCT FROM i.total_price OR l.debit_amount IS DISTINCT FROM i.total_price
          OR l.credit_amount<>0 OR l.amount_paid<>0))
        OR(l.transaction_type='payment' AND(l.reference_type IS DISTINCT FROM 'PAYMENT'
          OR l.account_type<>0 OR l.product_id IS NOT NULL OR l.debit_amount<>0
          OR l.credit_amount IS DISTINCT FROM r.paid_amount OR l.amount_paid IS DISTINCT FROM r.paid_amount)))`, [ACTOR])).rows;
  assert.equal(ledgerErrors.length, 0, `Supplier ledger verification failed: ${JSON.stringify(ledgerErrors.slice(0, 5))}`);
}

async function loadTrackedIds(client, metadata) {
  assert.ok(Array.isArray(metadata.receipts) && metadata.receipts.length === 234, 'Import tracker receipt map is incomplete');
  const map = metadata.receipts.map((receipt, index) => ({ receipt_idx: index + 1, bill_no: receipt.billNo,
    stock_id: receipt.stockId, batch_number: receipt.items[0]?.batchNumber, batch_id: receipt.items[0]?.batchId,
    product_id: receipt.items[0]?.productId, supplier_id: receipt.supplierId }));
  const mismatches = (await client.query(`SELECT r.bill_no FROM jsonb_to_recordset($1::jsonb) m(receipt_idx integer,bill_no text,
      stock_id integer,batch_number text,batch_id integer,product_id integer,supplier_id integer)
    JOIN workbook_receipts r USING(receipt_idx) JOIN workbook_items i USING(receipt_idx)
    WHERE m.bill_no IS DISTINCT FROM r.bill_no OR m.batch_number IS DISTINCT FROM i.batch_number
      OR m.product_id IS DISTINCT FROM i.product_id OR m.supplier_id IS DISTINCT FROM r.supplier_id`, [JSON.stringify(map)])).rows;
  assert.equal(mismatches.length, 0, 'Tracked source-to-product mapping changed');
  await client.query(`WITH m AS (SELECT * FROM jsonb_to_recordset($1::jsonb) x(receipt_idx integer,stock_id integer,batch_id integer))
    UPDATE workbook_receipts r SET stock_id=m.stock_id FROM m WHERE m.receipt_idx=r.receipt_idx`, [JSON.stringify(map)]);
  await client.query(`WITH m AS (SELECT * FROM jsonb_to_recordset($1::jsonb) x(receipt_idx integer,stock_id integer,batch_id integer))
    UPDATE workbook_items i SET batch_id=m.batch_id FROM m WHERE m.receipt_idx=i.receipt_idx`, [JSON.stringify(map)]);
}

function verifyPreservedProducts(before, after) {
  const byId = new Map(after.map(row => [row.product_id, row]));
  for (const old of before) {
    const current = byId.get(old.product_id);
    assert.ok(current, 'Existing product was removed');
    for (const key of Object.keys(old).filter(key => !['product_status', 'product_purchase_price', 'updated_at'].includes(key))) {
      assert.deepEqual(current[key], old[key], `Existing product field ${key} changed for ${old.product_title}`);
    }
    if (old.product_purchase_price !== null) assert.equal(current.product_purchase_price, old.product_purchase_price, 'Existing default purchase price was overwritten');
  }
}

async function importWorkbook(client, prepared, options = {}) {
  const apply = options.apply === true;
  const schema = options.schema || 'medsense_app';
  assert.equal(schema, 'medsense_app', 'Import requires the verified MedSenseAI application schema');
  let inTransaction = false;
  let committed = false;
  let backupDirectory;
  try {
    await client.query('BEGIN');
    inTransaction = true;
    await client.query(`SET LOCAL search_path="${schema}"; SET LOCAL TIME ZONE 'Asia/Karachi';
      SET LOCAL lock_timeout='30s'; SET LOCAL statement_timeout='120s'`);
    await client.query('SELECT pg_advisory_xact_lock(44201,17001)');
    await client.query(`LOCK TABLE brand,medicine_supplier_bindings,product,stock,stock_history,stock_report,
      supplier_accounts,supplier_info,supplier_ledger IN SHARE ROW EXCLUSIVE MODE`);
    await createStaging(client, prepared);
    const supplierRename = await resolveMasters(client);
    const trackerExists = Boolean((await client.query('SELECT to_regclass($1) AS name', [`${schema}.${TRACKER}`])).rows[0].name);
    if (trackerExists) {
      await client.query(`LOCK TABLE ${TRACKER} IN SHARE ROW EXCLUSIVE MODE`);
      const previous = (await client.query(`SELECT * FROM ${TRACKER} WHERE original_sha256=$1 OR updated_sha256=$2`,
        [prepared.source.originalSha256, prepared.source.updatedSha256])).rows;
      if (previous.length) {
        assert.equal(previous.length, 1, 'Source hashes refer to conflicting import records');
        assert.equal(previous[0].original_sha256, prepared.source.originalSha256, 'Original workbook checksum differs from tracked import');
        assert.equal(previous[0].updated_sha256, prepared.source.updatedSha256, 'Updated workbook checksum differs from tracked import');
        assert.equal(previous[0].payload_sha256, prepared.payloadSha256, 'Prepared values differ from the already imported workbook');
        await loadTrackedIds(client, previous[0].metadata);
        await verifyInsertedRows(client);
        await client.query('ROLLBACK');
        inTransaction = false;
        return { mode: 'verified existing import; no changes', applicationDataChanged: false,
          receiptCount: previous[0].receipt_count, batchCount: previous[0].batch_count, alreadyImported: true };
      }
    }
    const collisions = (await client.query(`SELECT 'bill' AS type,s.bill_no AS number FROM stock s JOIN workbook_receipts r
      ON LOWER(REGEXP_REPLACE(s.bill_no,'[^a-zA-Z0-9]','','g'))=LOWER(REGEXP_REPLACE(r.bill_no,'[^a-zA-Z0-9]','','g'))
      UNION ALL SELECT 'batch',h.batch_number FROM stock_history h JOIN workbook_items i
      ON LOWER(REGEXP_REPLACE(h.batch_number,'[^a-zA-Z0-9]','','g'))=LOWER(REGEXP_REPLACE(i.batch_number,'[^a-zA-Z0-9]','','g'))`)).rows;
    assert.equal(collisions.length, 0, `Refusing existing bill/batch collisions: ${JSON.stringify(collisions.slice(0, 5))}`);
    const before = await snapshotAffected(client, trackerExists);
    if (apply) backupDirectory = createBackup(prepared, before, schema);
    if (supplierRename.changed) {
      assert.equal((await client.query('UPDATE supplier_info SET supplier_name=$1,updated_at=NOW() WHERE supplier_id=$2 AND supplier_name=$3',
        [NEW_SUPPLIER, supplierRename.supplierId, OLD_SUPPLIER])).rowCount, 1, 'Authorized supplier rename failed');
    }
    await client.query(`CREATE TABLE IF NOT EXISTS ${TRACKER}(
      original_sha256 text PRIMARY KEY CHECK(original_sha256 ~ '^[a-f0-9]{64}$'),
      updated_sha256 text NOT NULL UNIQUE CHECK(updated_sha256 ~ '^[a-f0-9]{64}$'),
      payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
      receipt_count integer NOT NULL,batch_count integer NOT NULL,metadata jsonb NOT NULL,
      imported_at timestamptz NOT NULL DEFAULT NOW())`);
    const inserted = await insertStock(client, prepared, apply);
    const ledgerIds = await insertFinances(client, prepared, apply);
    const defaultPurchasePricesInitialized = await synchronizeProducts(client);
    await verifyInsertedRows(client);
    const afterProducts = (await client.query('SELECT * FROM product WHERE product_id IN(SELECT product_id FROM workbook_items)')).rows;
    verifyPreservedProducts(before.product, afterProducts);
    const accountsBefore = before.supplier_accounts.filter(account => account.status === 1);
    const accountsAfter = (await client.query('SELECT * FROM supplier_accounts WHERE supplier_id IN(SELECT supplier_id FROM workbook_receipts) AND status=1 ORDER BY supplier_id')).rows;
    const perSupplierTotals = (await client.query(`SELECT supplier_id AS "supplierId",SUM(total_amount)::text AS "totalAmount",
      SUM(paid_amount)::text AS "paidAmount",SUM(due_amount)::text AS "dueAmount",COUNT(*)::int AS "receiptCount"
      FROM workbook_receipts GROUP BY supplier_id ORDER BY supplier_id`)).rows;
    for (const account of accountsAfter) {
      const old = accountsBefore.find(row => row.supplier_id === account.supplier_id);
      const delta = perSupplierTotals.find(row => row.supplierId === account.supplier_id);
      assert.equal(dbCents(account.current_balance), dbCents(old?.current_balance), 'Fully paid import changed an existing supplier balance');
      assert.equal(dbCents(account.total_debit), dbCents(old?.total_debit) + dbCents(delta.totalAmount), 'Supplier debit total differs');
      assert.equal(dbCents(account.total_credit), dbCents(old?.total_credit) + dbCents(delta.paidAmount), 'Supplier credit total differs');
      assert.equal(dbCents(account.total_return), dbCents(old?.total_return), 'Supplier return history changed');
      assert.equal(dbCents(account.opening_balance), dbCents(old?.opening_balance), 'Supplier opening balance changed');
    }
    const mappings = (await client.query(`SELECT r.source_stock_number AS "sourceStockNumber",r.bill_no AS "billNo",
      r.stock_id AS "stockId",r.supplier_id AS "supplierId",JSONB_AGG(JSONB_BUILD_OBJECT(
        'batchNumber',i.batch_number,'batchId',i.batch_id,'productId',i.product_id) ORDER BY i.item_idx) AS items
      FROM workbook_receipts r JOIN workbook_items i USING(receipt_idx)
      GROUP BY r.receipt_idx,r.source_stock_number,r.bill_no,r.stock_id,r.supplier_id ORDER BY r.receipt_idx`)).rows;
    const totals = (await client.query(`SELECT COUNT(*)::int AS "receiptCount",SUM(total_amount)::text AS "totalAmount",
      SUM(paid_amount)::text AS "paidAmount",SUM(due_amount)::text AS "dueAmount",MIN(creation_date)::text AS "firstArrival",
      MAX(creation_date)::text AS "lastArrival" FROM workbook_receipts`)).rows[0];
    const physical = (await client.query(`SELECT SUM(qty)::text AS "paidUnits",SUM(bonus)::text AS "freeBonusUnits",
      SUM(initial_quantity)::text AS "physicalUnits",COUNT(DISTINCT product_id)::int AS "productCount" FROM workbook_items`)).rows[0];
    const metadata = { source: prepared.source, stockIds: inserted.stockIds, batchIds: inserted.batchIds,
      stockReportIds: inserted.reportIds, supplierLedgerIds: ledgerIds, receipts: mappings,
      accountsBefore, accountsAfter, perSupplierTotals, supplierRename, defaultPurchasePricesInitialized,
      totals: { ...totals, ...physical }, backupDirectory: backupDirectory || null };
    assert.equal((await client.query(`INSERT INTO ${TRACKER}(original_sha256,updated_sha256,payload_sha256,receipt_count,batch_count,metadata)
      VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [prepared.source.originalSha256,prepared.source.updatedSha256,prepared.payloadSha256,
      prepared.receipts.length,inserted.batchIds.length,JSON.stringify(metadata)])).rowCount, 1, 'Import tracking was not saved');
    const report = { mode: apply ? 'apply' : 'rollback preview', applicationDataChanged: apply,
      ...metadata.totals, batchCount: inserted.batchIds.length, purchaseReports: inserted.reportIds.length,
      supplierLedgerEntries: ledgerIds.length, defaultPurchasePricesInitialized: defaultPurchasePricesInitialized.length,
      supplierRename, importedNetSupplierBalance: '0.00', existingSupplierBalancesPreserved: true,
      serialSequencesAdvanced: apply, backupDirectory: backupDirectory || null };
    if (apply) fs.writeFileSync(path.join(backupDirectory, 'import-report.json'), JSON.stringify({ ...report, commitStatus: 'ready-to-commit' }, null, 2), { flag: 'wx' });
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    committed = apply;
    inTransaction = false;
    if (apply) {
      try { fs.writeFileSync(path.join(backupDirectory, 'import-report.json'), JSON.stringify({ ...report, commitStatus: 'committed' }, null, 2)); }
      catch { report.backupReportUpdateFailed = true; }
    }
    return report;
  } catch (error) {
    if (inTransaction && !committed) await client.query('ROLLBACK').catch(() => {});
    if (backupDirectory) error.message += `; pre-import backup: ${backupDirectory}`;
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.every(arg => arg === '--apply' || arg === '--help'), 'Use only --apply or --help');
  if (args.includes('--help')) {
    console.log('node scripts/import-stock-workbook.cjs          # atomic rollback preview\nnode scripts/import-stock-workbook.cjs --apply  # backup, validate and commit');
    return;
  }
  const prepared = validatePreparedWorkbook(JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8')));
  verifySourceFiles(prepared.source);
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  assert.equal(process.env.DB_SCHEMA, 'medsense_app', 'Expected the verified application database schema');
  const { Client } = require('pg');
  const client = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } } : {}),
    connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    console.log(JSON.stringify(await importWorkbook(client, prepared, { apply: args.includes('--apply'), schema: process.env.DB_SCHEMA }), null, 2));
  } finally { await client.end(); }
}

module.exports = { validatePreparedWorkbook, verifySourceFiles, importWorkbook };
if (require.main === module) main().catch(error => {
  console.error(`Stock workbook import failed: ${error.message}`);
  process.exitCode = 1;
});
