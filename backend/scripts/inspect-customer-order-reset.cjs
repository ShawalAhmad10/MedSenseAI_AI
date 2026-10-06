const path=require('node:path');require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const {sequelize}=require('../src/config/database');sequelize.options.logging=false;
async function main(){
 const q=s=>sequelize.query(s,{type:sequelize.QueryTypes.SELECT});
 const result={customers:await q('SELECT customer_id,customer_name,email,phone,customer_city,address FROM customer'),
 tables:await q("SELECT table_name FROM information_schema.tables WHERE table_schema='medsense_app' ORDER BY table_name"),
 foreignKeys:await q("SELECT conrelid::regclass::text source,confrelid::regclass::text target,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE contype='f' AND connamespace='medsense_app'::regnamespace"),
 columns:await q("SELECT table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='medsense_app' AND (table_name LIKE '%consult%' OR table_name LIKE '%invoice%' OR table_name LIKE '%checkout%' OR table_name LIKE '%customer%' OR table_name='stock_report') ORDER BY table_name,ordinal_position"),
 orders:await q('SELECT count(*) count,sum(total_amount) total FROM invoice'),products:await q('SELECT product_id,product_title,product_salt FROM product ORDER BY product_id')};
 require('node:fs').writeFileSync(path.resolve(__dirname,'../data/customer-order-schema.json'),JSON.stringify(result,null,2));
 for(const t of ['customer_subscriptions','customer_prescriptions','customer_refill_reminders','pharmacist_consultations','invoice_report','storefront_funnel_events']) console.log(t,await q(`SELECT count(*) FROM ${t}`));
 console.log(JSON.stringify({orders:result.orders,consultColumns:result.columns.filter(x=>x.table_name==='pharmacist_consultations').map(x=>x.column_name)}));
}main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>sequelize.close());
