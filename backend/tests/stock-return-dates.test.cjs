const test=require('node:test'),assert=require('node:assert/strict');
const {validateReturnDate,returnTimestamp}=require('../src/services/stockReturnDateService');
test('returns on or before any selected stock arrival are rejected',()=>{
  for(const day of ['2026-07-01','2026-07-05'])assert.throws(()=>validateReturnDate(day,['2026-07-05'],'2026-10-03'),e=>e.status===400);
  assert.throws(()=>validateReturnDate('2026-07-07',['2026-07-01','2026-07-08'],'2026-10-03'),/after/);
});
test('calendar errors, missing arrivals and future return dates are rejected',()=>{
  for(const day of ['2026-02-30','2026-13-01','invalid','2026-10-04'])assert.throws(()=>validateReturnDate(day,['2026-07-01'],'2026-10-03'));
  assert.throws(()=>validateReturnDate('2026-07-02',[],'2026-10-03'));
});
test('the next day is valid and timestamp retains the Pakistan return day',()=>{
  assert.equal(validateReturnDate('2026-07-06',['2026-07-05'],'2026-10-03'),'2026-07-06');
  assert.equal(returnTimestamp('2026-07-06').toISOString(),'2026-07-06T07:00:00.000Z');
});
