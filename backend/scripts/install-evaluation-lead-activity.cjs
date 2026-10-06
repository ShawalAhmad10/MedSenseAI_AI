const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});const {sequelize}=require('../src/config/database');sequelize.options.logging=false;
const {fingerprint,runModel}=require('../src/services/evaluationLeadService');const apply=process.argv.includes('--apply');
const q=(sql,replacements={},transaction)=>sequelize.query(sql,{replacements,transaction,type:sequelize.QueryTypes.SELECT});
async function main(){
 const customers=await q('SELECT customer_id AS id,created_at FROM customer ORDER BY customer_id');assert.equal(customers.length,3);
 // Historical orders must never become future facts just because the import uses a midday timestamp.
 if(apply)await sequelize.transaction(async transaction=>{
  await q("UPDATE invoice SET created_at=LEAST(created_at,NOW()-INTERVAL '10 minutes'),updated_at=LEAST(updated_at,NOW()-INTERVAL '10 minutes') RETURNING invoice_id",{},transaction);
  await q('UPDATE invoice_report r SET created_at=i.created_at,updated_at=i.created_at FROM invoice i WHERE i.invoice_id=r.invoice_id RETURNING item_id',{},transaction);
  await q("UPDATE stock_report r SET reference_id=i.invoice_id,transaction_date=i.created_at,created_at=i.created_at FROM invoice i WHERE r.reference_type='INVOICE' AND r.reference_number=i.invoice_number RETURNING ledger_id",{},transaction);
  await q("UPDATE customer_ledger l SET transaction_date=i.created_at,created_at=i.created_at,updated_at=i.created_at FROM invoice i WHERE l.reference_id=i.invoice_id AND l.reference_type IN ('INVOICE','PAYMENT','ORDER_DELIVERED') RETURNING ledger_id",{},transaction);
 });
 const orders=await q(`SELECT i.invoice_id AS id,i.customer_id,i.created_at,json_agg(json_build_object('item_id',r.item_id,'product_id',r.product_id,'quantity',r.quantity,'total_minor',round(r.total_price::numeric*100)::bigint) ORDER BY r.item_id) items
  FROM invoice i JOIN invoice_report r USING(invoice_id) WHERE i.status=1 AND i.notes LIKE 'Evaluation history (generated):%'
  GROUP BY i.invoice_id ORDER BY i.created_at,i.invoice_id`);
 if(apply)assert.equal(orders.length,50);
 const products=await q(`SELECT product_id AS id,(min(creation_day)::text||'T00:00:00.000Z') available_at FROM stock_history GROUP BY product_id ORDER BY product_id`);
 const source={customers:customers.map(c=>({...c,created_at:new Date(c.created_at).toISOString()})),orders:orders.map(o=>({...o,created_at:new Date(o.created_at).toISOString()})),products,
  observation:new Date().toISOString()};
 const result=await runModel(source);assert.equal(result.scores.length,3);
 assert.ok(result.scores.every(s=>s.scoring.status==='scored'),JSON.stringify(result.scores.map(s=>s.scoring)));
 const dataset=result.dataset;
 const sources=customers.map(c=>({customer_id:c.id,fingerprint:fingerprint({customer:{customer_id:c.id,created_at:new Date(c.created_at).toISOString()},
  orders:orders.filter(o=>o.customer_id===c.id).map(o=>({order_id:o.id,customer_id:c.id,created_at:new Date(o.created_at).toISOString()}))})}));
 if(apply){
  await sequelize.transaction(async transaction=>{
   await q(fs.readFileSync(path.resolve(__dirname,'../migrations/20261003_evaluation_lead_activity.sql'),'utf8'),{},transaction);
   await q(`INSERT INTO evaluation_lead_activity(customer_id,source_fingerprint,dataset,observation_time)
    SELECT x.customer_id,x.fingerprint,CAST(:dataset AS jsonb),:observation FROM jsonb_to_recordset(CAST(:sources AS jsonb)) x(customer_id int,fingerprint text)
    ON CONFLICT(customer_id) DO UPDATE SET source_fingerprint=EXCLUDED.source_fingerprint,dataset=EXCLUDED.dataset,observation_time=EXCLUDED.observation_time RETURNING customer_id`,
    {dataset:JSON.stringify(dataset),sources:JSON.stringify(sources),observation:source.observation},transaction);
  });
 }
 const artifact={source,validation:'PASS',scores:result.scores,dataset,sourceFingerprints:sources};
 fs.writeFileSync(path.resolve(__dirname,'../data/evaluation-lead-'+(apply?'activity':'preview')+'.json'),JSON.stringify(artifact,null,2));
 console.log(JSON.stringify({mode:apply?'APPLIED':'PREVIEW',origin:dataset.manifest.data_origin,orders:orders.length,activityEvents:result.event_count,
  scores:result.scores.map(s=>({customer:s.customer_id,status:s.scoring.status,score:s.scoring.lead_score,probability:s.scoring.model_probability})),model:result.scores[0].scoring.model_version}));
}
main().catch(e=>{console.error('Evaluation lead activity failed:',e.message);process.exitCode=1}).finally(()=>sequelize.close());
