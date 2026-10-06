const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const dotenv = require('dotenv');
const backend = path.resolve(__dirname, '..');
const parse = file => dotenv.parse(fs.readFileSync(file));
const connect = env => new Client({ host:env.DB_HOST, port:Number(env.DB_PORT||5432), database:env.DB_NAME,user:env.DB_USER,password:env.DB_PASSWORD,ssl:env.DB_SSL==='true'?{rejectUnauthorized:env.DB_SSL_REJECT_UNAUTHORIZED!=='false'}:false,connectionTimeoutMillis:15000 });
(async()=>{
 for (const [label,file] of [['local',path.join(backend,'../portable/backend.env.reference')],['cloud',path.join(backend,'.env')]]) {
  const env=parse(file); const client=connect(env);
  try { await client.connect();
   const schemas=await client.query("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname");
   const counts=await client.query('SELECT (SELECT count(*) FROM public.product) products,(SELECT count(*) FROM public.users) users,(SELECT count(*) FROM public.invoice) invoices,(SELECT count(*) FROM public.stock_history) batches');
   const columns=await client.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('invoice','product','users') AND (column_name LIKE '%id' OR column_name IN ('invoice_total','invoice_net_total')) ORDER BY table_name,ordinal_position");
   const size=await client.query('SELECT pg_size_pretty(pg_database_size(current_database())) size');
   console.log(JSON.stringify({label,schemas:schemas.rows,counts:counts.rows[0],columns:columns.rows,size:size.rows[0]}));
  } finally { await client.end(); }
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
