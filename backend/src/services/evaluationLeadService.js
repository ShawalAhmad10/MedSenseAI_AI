const crypto=require('node:crypto'),path=require('node:path'),{spawn}=require('node:child_process');
const pending=new Map();
function fingerprint(snapshot){return crypto.createHash('sha256').update(JSON.stringify({customer:snapshot.customer,orders:snapshot.orders})).digest('hex');}
function runModel(input){return new Promise((resolve,reject)=>{
 const python=path.resolve(__dirname,'../../../ai_service/.venv-lead-3139/Scripts/python.exe');
 const script=path.resolve(__dirname,'../../scripts/score-evaluation-activity.py');
 const child=spawn(python,[script],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 const timer=setTimeout(()=>{child.kill();reject(new Error('Evaluation lead model timed out'));},45000);
 child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>5_000_000){child.kill();reject(new Error('Evaluation model output exceeded its limit'));}});
 child.stderr.on('data',chunk=>{stderr+=chunk;});
 child.on('error',error=>{clearTimeout(timer);reject(error);});
 child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('Canonical evaluation scoring failed: '+stderr.slice(-1200)));
  try{resolve(JSON.parse(stdout));}catch{reject(new Error('Evaluation model returned invalid JSON'));}});
 child.stdin.on('error',error=>reject(error));child.stdin.end(JSON.stringify(input));
});}
async function score(snapshot,modelRunner=runModel){
 const e=snapshot.evaluation;
 if(!e||e.source_fingerprint!==fingerprint(snapshot))return null;
 if(e.dataset?.manifest?.data_origin!=='synthetic_development')throw new Error('Evaluation activity must be labelled synthetic');
 const key=e.dataset.manifest.generation_config_hash;
 if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Evaluation dataset provenance hash is invalid');
 if(!pending.has(key))pending.set(key,modelRunner({dataset:e.dataset,observation:new Date(e.observation_time).toISOString()}).finally(()=>pending.delete(key)));
 const result=await pending.get(key);
 const row=result.scores.find(row=>row.customer_id===snapshot.customer.customer_id);
 if(!row)throw new Error('Evaluation model omitted a customer');
 const scoring=row.scoring;
 if(scoring.status==='scored'&&(!Number.isFinite(scoring.model_probability)||scoring.model_probability<0||scoring.model_probability>1||
  Math.abs(scoring.lead_score-scoring.model_probability*100)>1e-9))throw new Error('Evaluation model returned an invalid score');
 return {httpStatus:200,result:{...scoring,evaluation_data_origin:'synthetic_development',
  evaluation_notice:'Evaluation dataset: these orders and browsing/cart activities are simulated. Scores are calculated by the existing model.'}};
}
module.exports={fingerprint,runModel,score};
