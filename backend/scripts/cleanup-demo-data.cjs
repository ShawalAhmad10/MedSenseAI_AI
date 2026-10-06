// Explicitly marked demo/test commerce data only. Default run rolls back.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const apply = process.argv.includes('--apply');
const replaceCatalog = process.argv.includes('--replace-old-catalog');
const schema = process.env.DB_SCHEMA;
if (schema !== 'medsense_app') throw new Error('Expected the verified account database schema');
const client = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }, connectionTimeoutMillis: 15000 });
const marker = `(^|[^a-z])(demo|test|qa|e2e)([^a-z]|$)`;
const report = {};
let storeBackupDirectory;
const q = (sql, params) => client.query(sql, params);
const remove = async (table, condition) => {
  report[table] = (await q(`DELETE FROM ${table} WHERE ${condition}`)).rowCount;
};
(async () => {
  try {
    await client.connect();
    await q('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await q('SET LOCAL search_path=medsense_app');
    await q("SET LOCAL lock_timeout='15s'");
    const tableRows = (await q(`SELECT table_name FROM information_schema.tables
      WHERE table_schema=$1 AND table_type='BASE TABLE'`, [schema])).rows;
    const existing = new Set(tableRows.map(row => row.table_name));
    const tables = ['brand','supplier_info','product','invoice','invoice_report','stock','stock_history','stock_history_open',
      'stock_history_legacy_pre_latest','stock_report','stock_return','stock_return_report','supplier_ledger','supplier_accounts',
      'customer','customer_accounts','customer_ledger','customer_refill_reminders','customer_prescriptions','pharmacist_consultations',
      'storefront_checkout_idempotency','storefront_funnel_events','notifications','invoice_return','invoice_return_report',
      'medicine_categories','medicine_supplier_bindings'].filter(t => existing.has(t)).sort();
    await q(`LOCK TABLE ${tables.join(',')} IN SHARE ROW EXCLUSIVE MODE`);
    await q(`CREATE TEMP TABLE demo_products ON COMMIT DROP AS SELECT product_id FROM product
      ${replaceCatalog ? '' : "WHERE UPPER(TRIM(COALESCE(product_category,'')))='DEMO ONLY' OR product_title ~* '^DEMO[[:space:]]'"}`);
    await q(`CREATE TEMP TABLE demo_customers ON COMMIT DROP AS SELECT customer_id FROM customer
      WHERE ${replaceCatalog ? 'false' : 'customer_name ~* $1'}`, replaceCatalog ? [] : [marker]);
    await q(`CREATE TEMP TABLE demo_orders ON COMMIT DROP AS SELECT invoice_id FROM invoice i WHERE
      ${replaceCatalog ? 'false' : "COALESCE(invoice_number,'') ~* $1 OR COALESCE(notes,'') ~* $1 OR COALESCE(customer_name,'') ~* $1"}
      OR customer_id IN (SELECT customer_id FROM demo_customers)
      OR EXISTS(SELECT 1 FROM invoice_report r JOIN demo_products p USING(product_id) WHERE r.invoice_id=i.invoice_id)`, replaceCatalog ? [] : [marker]);
    await q(`CREATE TEMP TABLE demo_batches ON COMMIT DROP AS SELECT batch_id FROM stock_history WHERE product_id IN (SELECT product_id FROM demo_products)`);
    await q(`CREATE TEMP TABLE demo_receipts ON COMMIT DROP AS SELECT stock_id FROM stock s
      WHERE EXISTS(SELECT 1 FROM stock_history h WHERE h.stock_id=s.stock_id)
      AND NOT EXISTS(SELECT 1 FROM stock_history h WHERE h.stock_id=s.stock_id AND h.product_id NOT IN(SELECT product_id FROM demo_products))`);
    await q(`CREATE TEMP TABLE demo_returns (return_id integer) ON COMMIT DROP`);
    if (existing.has('invoice_return')) await q(`INSERT INTO demo_returns SELECT return_id FROM invoice_return WHERE linked_invoice_id IN(SELECT invoice_id FROM demo_orders)`);
    const beforeIdentity = (await q(`SELECT md5(COALESCE(string_agg(to_jsonb(u)::text,'' ORDER BY id),'')) checksum FROM users u`)).rows[0].checksum;
    const retainedInvoices = (await q(`SELECT invoice_id,md5(to_jsonb(i)::text) checksum FROM invoice i WHERE invoice_id NOT IN(SELECT invoice_id FROM demo_orders)`)).rows;
    const retainedProducts = (await q(`SELECT product_id FROM product WHERE product_id NOT IN(SELECT product_id FROM demo_products)`)).rows;
    const retainedCustomers = (await q(`SELECT customer_id,md5(to_jsonb(c)::text) checksum FROM customer c
      WHERE customer_id NOT IN(SELECT customer_id FROM demo_customers) ORDER BY customer_id`)).rows;
    const selection = (await q(`SELECT (SELECT count(*) FROM demo_products)::int products,
      (SELECT count(*) FROM demo_orders)::int orders,(SELECT count(*) FROM demo_customers)::int demoCustomers,
      (SELECT count(*) FROM demo_batches)::int batches,(SELECT count(*) FROM demo_receipts)::int receipts`)).rows[0];
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'rollback-preview', selection }));
    if (apply) {
      const directory = path.resolve(__dirname, '../../database/cloud-migration-demo-cleanup-' + new Date().toISOString().replaceAll(/[:.]/g,'-'));
      fs.mkdirSync(directory, { recursive: true });
      const backup = { schema, createdAt: new Date().toISOString(), selection, tables: {} };
      for (const table of tables) backup.tables[table] = (await q(`SELECT to_jsonb(t) row FROM ${table} t`)).rows.map(row => row.row);
      fs.writeFileSync(path.join(directory, 'commerce-before.json'), JSON.stringify(backup));
      storeBackupDirectory = directory;
      console.log('Backup saved: ' + directory);
    }
    const orderRef = `UPPER(COALESCE(reference_type,'')) IN ('INVOICE','SALE','INVOICE_PAYMENT') AND reference_id IN(SELECT invoice_id FROM demo_orders)`;
    const returnRef = `UPPER(COALESCE(reference_type,'')) IN ('INVOICE_RETURN','RETURN') AND reference_id IN(SELECT return_id FROM demo_returns)`;
    await q(`CREATE TEMP TABLE removed_customer_ledger ON COMMIT DROP AS SELECT * FROM customer_ledger WHERE
      (${orderRef}) OR (${returnRef}) OR customer_id IN(SELECT customer_id FROM demo_customers)
      OR product_id::text IN(SELECT product_id::text FROM demo_products)`);
    await q(`UPDATE customer_ledger l SET balance=l.balance-COALESCE((SELECT SUM(d.debit_amount-d.credit_amount)
      FROM removed_customer_ledger d WHERE d.account_id=l.account_id AND (d.transaction_date,d.ledger_id)<=(l.transaction_date,l.ledger_id)),0)
      WHERE l.account_id IN(SELECT account_id FROM removed_customer_ledger) AND l.ledger_id NOT IN(SELECT ledger_id FROM removed_customer_ledger)`);
    await q(`UPDATE customer_accounts a SET total_debit=a.total_debit-d.debit,total_credit=a.total_credit-d.credit,
      current_balance=a.current_balance-d.debit+d.credit,updated_at=NOW() FROM
      (SELECT account_id,SUM(debit_amount) debit,SUM(credit_amount) credit FROM removed_customer_ledger WHERE status=1 GROUP BY account_id) d WHERE a.account_id=d.account_id`);
    await remove('customer_ledger', 'ledger_id IN(SELECT ledger_id FROM removed_customer_ledger)');
    await q(`CREATE TEMP TABLE removed_movements ON COMMIT DROP AS SELECT * FROM stock_report WHERE (${orderRef}) OR (${returnRef})`);
    // Undo only recorded movements of retained products in the approved mixed demo orders.
    await q(`UPDATE stock_history h SET remaining_quantity=h.remaining_quantity-d.delta,product_quantity=h.remaining_quantity-d.delta,
      batch_status=CASE WHEN h.remaining_quantity-d.delta>0 THEN 'ACTIVE' ELSE 'INACTIVE' END,updated_at=NOW()
      FROM (SELECT batch_id,SUM(quantity_change) delta FROM removed_movements WHERE product_id NOT IN(SELECT product_id FROM demo_products) GROUP BY batch_id) d
      WHERE h.batch_id=d.batch_id`);
    await q(`UPDATE stock_report r SET balance_after=r.balance_after-COALESCE((SELECT SUM(d.quantity_change) FROM removed_movements d
      WHERE d.batch_id=r.batch_id AND (d.transaction_date,d.ledger_id)<=(r.transaction_date,r.ledger_id)),0)
      WHERE r.batch_id IN(SELECT batch_id FROM removed_movements) AND r.ledger_id NOT IN(SELECT ledger_id FROM removed_movements)`);
    await remove('stock_report', `product_id IN(SELECT product_id FROM demo_products) OR batch_id IN(SELECT batch_id FROM demo_batches) OR ledger_id IN(SELECT ledger_id FROM removed_movements)`);
    await q(`CREATE TEMP TABLE demo_reminders ON COMMIT DROP AS WITH RECURSIVE doomed AS (
      SELECT reminder_id FROM customer_refill_reminders WHERE product_id IN(SELECT product_id FROM demo_products)
      OR source_invoice_id IN(SELECT invoice_id FROM demo_orders) OR customer_id IN(SELECT customer_id FROM demo_customers)
      UNION SELECT r.reminder_id FROM customer_refill_reminders r JOIN doomed d ON r.previous_reminder_id=d.reminder_id)
      SELECT reminder_id FROM doomed`);
    await remove('customer_refill_reminders', 'reminder_id IN(SELECT reminder_id FROM demo_reminders)');
    await remove('invoice_report', 'invoice_id IN(SELECT invoice_id FROM demo_orders)');
    if (existing.has('invoice_return_report')) await remove('invoice_return_report', 'return_id IN(SELECT return_id FROM demo_returns)');
    if (existing.has('invoice_return')) await remove('invoice_return', 'return_id IN(SELECT return_id FROM demo_returns)');
    await remove('storefront_checkout_idempotency', 'order_id IN(SELECT invoice_id FROM demo_orders) OR customer_id IN(SELECT customer_id FROM demo_customers)');
    await remove('storefront_funnel_events', `data_origin='synthetic_development' OR payload->>'order_id' IN(SELECT invoice_id::text FROM demo_orders)
      OR payload->>'customer_id' IN(SELECT customer_id::text FROM demo_customers)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(payload::jsonb->'product_ids','[]'::jsonb)) x WHERE x.value IN(SELECT product_id::text FROM demo_products))`);
    await remove('notifications', `metadata->>'orderId' IN(SELECT invoice_id::text FROM demo_orders) OR metadata->>'invoice_id' IN(SELECT invoice_id::text FROM demo_orders)
      OR metadata->>'order_id' IN(SELECT invoice_id::text FROM demo_orders)
      OR metadata->>'invoiceId' IN(SELECT invoice_id::text FROM demo_orders) OR metadata->>'productId' IN(SELECT product_id::text FROM demo_products)
      OR metadata->>'product_id' IN(SELECT product_id::text FROM demo_products)`);
    await remove('invoice', 'invoice_id IN(SELECT invoice_id FROM demo_orders)');
    await q(`CREATE TEMP TABLE removed_supplier_ledger ON COMMIT DROP AS SELECT * FROM supplier_ledger WHERE
      product_id IN(SELECT product_id FROM demo_products) OR stock_id IN(SELECT stock_id FROM demo_receipts)`);
    await q(`UPDATE supplier_ledger l SET balance=l.balance-COALESCE((SELECT SUM(d.debit_amount-d.credit_amount) FROM removed_supplier_ledger d
      WHERE d.supplier_account_id=l.supplier_account_id AND (d.time_created,d.ledger_number)<=(l.time_created,l.ledger_number)),0)
      WHERE l.supplier_account_id IN(SELECT supplier_account_id FROM removed_supplier_ledger) AND l.ledger_number NOT IN(SELECT ledger_number FROM removed_supplier_ledger)`);
    await q(`UPDATE supplier_accounts a SET total_debit=a.total_debit-d.debit,total_credit=a.total_credit-d.credit,
      current_balance=a.current_balance-d.debit+d.credit,updated_at=NOW() FROM
      (SELECT supplier_account_id,SUM(debit_amount) debit,SUM(credit_amount) credit FROM removed_supplier_ledger WHERE status=1 GROUP BY supplier_account_id) d WHERE a.supplier_account_id=d.supplier_account_id`);
    await remove('supplier_ledger', 'ledger_number IN(SELECT ledger_number FROM removed_supplier_ledger)');
    await remove('stock_return_report', 'product_id IN(SELECT product_id FROM demo_products)');
    await remove('stock_return', 'stock_id IN(SELECT stock_id FROM demo_receipts) AND NOT EXISTS(SELECT 1 FROM stock_return_report r WHERE r.return_id=stock_return.return_id)');
    for (const table of ['stock_history_open','stock_history_legacy_pre_latest','stock_history']) {
      if (existing.has(table)) await remove(table, 'product_id IN(SELECT product_id FROM demo_products)');
    }
    await remove('stock', 'stock_id IN(SELECT stock_id FROM demo_receipts)');
    // Refuse rather than remove a demo identity with verified subscription history.
    assert.equal((await q(`SELECT count(*)::int n FROM customer_subscriptions WHERE customer_id IN(SELECT customer_id FROM demo_customers)`)).rows[0].n,0);
    await remove('pharmacist_consultations', `customer_id IN(SELECT customer_id FROM demo_customers) OR EXISTS(
      SELECT 1 FROM jsonb_array_elements_text(jsonb_path_query_array(cart_snapshot::jsonb,'$.**.product_id')) x
      WHERE x.value IN(SELECT product_id::text FROM demo_products)) OR EXISTS(
      SELECT 1 FROM jsonb_array_elements_text(jsonb_path_query_array(cart_snapshot::jsonb,'$.**.productId')) x
      WHERE x.value IN(SELECT product_id::text FROM demo_products))`);
    await remove('customer_prescriptions', 'customer_id IN(SELECT customer_id FROM demo_customers)');
    await remove('customer_accounts', 'customer_id IN(SELECT customer_id FROM demo_customers)');
    await remove('customer', 'customer_id IN(SELECT customer_id FROM demo_customers)');
    await remove('product', 'product_id IN(SELECT product_id FROM demo_products)');
    await q(`UPDATE product p SET product_status=CASE WHEN NOT archived AND NOT manually_inactive AND EXISTS(
      SELECT 1 FROM stock_history h WHERE h.product_id=p.product_id AND h.status=1 AND h.remaining_quantity>0
      AND h.batch_status='ACTIVE' AND (h.expiry_date IS NULL OR h.expiry_date>=CURRENT_DATE)) THEN 1 ELSE 0 END
      WHERE product_id IN(SELECT product_id FROM removed_movements)`);
    assert.equal((await q(`SELECT md5(COALESCE(string_agg(to_jsonb(u)::text,'' ORDER BY id),'')) checksum FROM users u`)).rows[0].checksum,beforeIdentity);
    assert.deepEqual((await q(`SELECT invoice_id,md5(to_jsonb(i)::text) checksum FROM invoice i ORDER BY invoice_id`)).rows,
      retainedInvoices.sort((a,b)=>a.invoice_id-b.invoice_id));
    assert.deepEqual((await q('SELECT product_id FROM product ORDER BY product_id')).rows,retainedProducts.sort((a,b)=>a.product_id-b.product_id));
    assert.deepEqual((await q('SELECT customer_id,md5(to_jsonb(c)::text) checksum FROM customer c ORDER BY customer_id')).rows, retainedCustomers);
    assert.equal((await q('SELECT count(*)::int n FROM stock_history WHERE remaining_quantity<0')).rows[0].n,0);
    const catalogReport=replaceCatalog ? await require('./import-requested-catalog.cjs')(client, {
      deleteOldSupplierFinances: process.argv.includes('--delete-old-supplier-finances')
    }) : null;
    assert.equal((await q(`SELECT md5(COALESCE(string_agg(to_jsonb(u)::text,'' ORDER BY id),'')) checksum FROM users u`)).rows[0].checksum,beforeIdentity);
    await q(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ committed: apply, removed: report, remainingProducts: retainedProducts.length, remainingOrders: retainedInvoices.length,
      checks: 'Retained invoices, login accounts and nonnegative stock verified',catalogReport }));
    if (apply) fs.writeFileSync(path.join(storeBackupDirectory,'cleanup-report.json'),JSON.stringify({ selection, removed: report, catalogReport },null,2));
  } catch (error) { await q('ROLLBACK').catch(() => {}); throw error; }
  finally { await client.end(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
