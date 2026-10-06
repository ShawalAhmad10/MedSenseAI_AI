const test=require('node:test'),assert=require('node:assert/strict');const {score,fingerprint}=require('../src/services/evaluationLeadService');
const snapshot=()=>({customer:{customer_id:8,created_at:'2026-07-01T06:00:00.000Z'},orders:[{order_id:1,customer_id:8,created_at:'2026-07-01T07:00:00.000Z'}]});
function evaluation(){const s=snapshot();s.evaluation={source_fingerprint:fingerprint(s),observation_time:'2026-10-03T00:00:00.000Z',
 dataset:{manifest:{data_origin:'synthetic_development',generation_config_hash:'a'.repeat(64)}}};return s;}
test('real customers do not use simulated evaluation scoring',async()=>assert.equal(await score(snapshot(),()=>assert.fail('No evaluation runner')),null));
test('changed orders invalidate simulated activity instead of producing a stale score',async()=>{
 const s=evaluation();s.orders.push({order_id:2,customer_id:8,created_at:'2026-07-02T07:00:00.000Z'});
 assert.equal(await score(s,()=>assert.fail('Stale activity must not be scored')),null);
});
test('evaluation data cannot be relabelled as real',async()=>{
 const s=evaluation();s.evaluation.dataset.manifest.data_origin='partner_real';await assert.rejects(score(s),/labelled synthetic/);
});
test('evaluation returns actual model output with visible provenance',async()=>{
 const s=evaluation();const result=await score(s,async input=>{assert.equal(input.observation,s.evaluation.observation_time);
  return {scores:[{customer_id:8,scoring:{status:'scored',model_probability:0.72,lead_score:72}}]};});
 assert.equal(result.result.lead_score,72);assert.equal(result.result.evaluation_data_origin,'synthetic_development');assert.match(result.result.evaluation_notice,/simulated/);
});
test('inconsistent model probability and score are rejected',async()=>{
 await assert.rejects(score(evaluation(),async()=>({scores:[{customer_id:8,scoring:{status:'scored',model_probability:0.72,lead_score:99}}]})),/invalid score/);
});
test('simultaneous evaluation requests share only in-flight inference',async()=>{
 let requests=0;const runner=async()=>{requests++;await new Promise(r=>setTimeout(r,5));return {scores:[{customer_id:8,scoring:{status:'scored',model_probability:0.5,lead_score:50}}]};};
 await Promise.all([score(evaluation(),runner),score(evaluation(),runner)]);assert.equal(requests,1);
 await score(evaluation(),runner);assert.equal(requests,2,'Refresh executes the existing model again');
});
