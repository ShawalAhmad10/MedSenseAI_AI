const fs=require('node:fs');const path=require('node:path');const {Client}=require('pg');require('dotenv').config({path:path.resolve(__dirname,'../.env')});
(async()=>{if(process.env.DB_SCHEMA!=='medsense_app')throw Error('Expected migrated application schema');const c=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:{rejectUnauthorized:process.env.DB_SSL_REJECT_UNAUTHORIZED!=='false'},connectionTimeoutMillis:15000});const directory=path.resolve(__dirname,'../../database/cloud-migration-2026-10-02T10-53-55-875Z');try{await c.connect();await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(44201,17001)');const before=(await c.query("SELECT count(*)::text AS count,md5(COALESCE(string_agg(to_jsonb(i)::text,E'\\n' ORDER BY invoice_id),'')) AS checksum FROM public.invoice i")).rows[0];const original=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))).cloudInvoices;if(JSON.stringify(before)!==JSON.stringify(original))throw Error('Original cloud invoice data changed; inspect before importing');await c.query('SET LOCAL search_path=medsense_app');const ddl=fs.readFileSync(path.resolve(__dirname,'../migrations/20261002_legacy_cloud_orders.sql'),'utf8').replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');await c.query(ddl);
const inserted=await c.query(`INSERT INTO medsense_app.invoice (
 invoice_number,customer_id,customer_name,customer_phone,customer_email,branch_name,
 total_amount,discount,delivery_fee,paid_amount,due_amount,payment_status,payment_method,
 delivery_status,delivery_address,builty_no,notes,card_holder_name,card_last_four,card_expiry,
 billing_address,wallet_account_name,wallet_account_number,wallet_cnic,created_by,status,
 invoice_date,created_at,updated_at,legacy_source_schema,legacy_source_invoice_id,
 legacy_source_invoice_number,legacy_source_record)
 SELECT CASE WHEN EXISTS (SELECT 1 FROM medsense_app.invoice a WHERE a.invoice_number=i.invoice_number)
 THEN 'CLOUD-'||i.invoice_id||'-'||i.invoice_number ELSE i.invoice_number END,
 NULL,i.customer_name,i.customer_phone,i.customer_email,i.branch_name,
 i.total_amount,i.discount,i.delivery_fee,i.paid_amount,i.due_amount,i.payment_status,i.payment_method,
 i.delivery_status,i.delivery_address,i.builty_no,i.notes,i.card_holder_name,i.card_last_four,i.card_expiry,
 i.billing_address,i.wallet_account_name,i.wallet_account_number,i.wallet_cnic,'cloud-import',i.status,
 i.invoice_date,i.created_at,i.updated_at,'public',i.invoice_id,i.invoice_number,to_jsonb(i)
 FROM public.invoice i WHERE NOT EXISTS (
 SELECT 1 FROM medsense_app.invoice a WHERE a.legacy_source_schema='public' AND a.legacy_source_invoice_id=i.invoice_id)
 ORDER BY i.invoice_id RETURNING invoice_id`);
const verification=(await c.query(`SELECT (SELECT count(*) FROM medsense_app.invoice) total,
(SELECT count(*) FROM medsense_app.invoice WHERE status=1) visible,
(SELECT count(*) FROM medsense_app.invoice WHERE legacy_source_schema='public') imported,
(SELECT count(*) FROM public.invoice) originals,
(SELECT count(*) FROM medsense_app.invoice a JOIN public.invoice b ON a.legacy_source_invoice_id=b.invoice_id
 WHERE a.legacy_source_schema='public' AND (a.legacy_source_record<>to_jsonb(b) OR a.customer_id IS NOT NULL)) bad_mappings`)).rows[0];if(Number(verification.imported)!==Number(before.count)||Number(verification.bad_mappings)!==0)throw Error('Legacy import verification failed');await c.query('COMMIT');const report={inserted:inserted.rowCount,...verification,preservedOriginal:before,verifiedAt:new Date().toISOString()};fs.writeFileSync(path.join(directory,'legacy-orders-import.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}finally{await c.end();}})().catch(error=>{console.error(error.message);process.exitCode=1;});
