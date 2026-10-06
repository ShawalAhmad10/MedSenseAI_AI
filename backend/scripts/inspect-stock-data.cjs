const data = require('../data/stock-workbook-original.json');
const current = [...require('../data/requested-products.json').products,
  ...require('../data/additional-products-101-150.json').products];
const directory = require('../data/requested-business-directory.json');
const cells = row => Object.fromEntries(Object.entries(row.cells).map(([key,value]) => [key.replace(/\d+$/,''),value]));
const rows = data.find(sheet=>sheet.name==='Stock_Batch_Lines').rows.slice(1).map(cells);
const notes = data.find(sheet=>sheet.name==='Rules_Notes').rows.map(cells);
const mismatches = [];
for (const r of rows) {
  const product=current.find(p=>p.title===r.E && p.brand===r.F);
  if(!product) {mismatches.push({stock:r.A,title:r.E,issue:'Product/brand not in saved catalogue'});continue;}
  if(r.B!==product.supplier) mismatches.push({stock:r.A,title:r.E,issue:'Supplier spelling/assignment mismatch',file:r.B,saved:product.supplier});
  if(r.J!==product.packSize) mismatches.push({stock:r.A,title:r.E,issue:'Pack size mismatch',file:r.J,saved:product.packSize});
  if(r.K!==(r.H+r.I)*r.J) mismatches.push({stock:r.A,title:r.E,issue:'Quantity mismatch'});
}
const round=x=>Math.round(x*100)/100;
console.log(JSON.stringify({lines:rows.length,products:new Set(rows.map(r=>r.E+'|'+r.F)).size,
  uniqueBills:new Set(rows.map(r=>r.C)).size,uniqueBatches:new Set(rows.map(r=>r.G)).size,
  dates:[rows[0].D,rows.at(-1).D],suppliers:[...new Set(rows.map(r=>r.B))],
  paymentStatuses:rows.reduce((result,r)=>(result[r.X]=(result[r.X]||0)+1,result),{}),
  bonusLines:rows.filter(r=>r.I>0).length,
  grossChargesAllUnits:rows.filter(r=>Math.abs(r.R-r.K*r.N)<0.011).length,
  grossChargesPaidUnitsOnly:rows.filter(r=>Math.abs(r.R-r.H*r.J*r.N)<0.011).length,
  totals:{physicalUnits:rows.reduce((s,r)=>s+r.K,0),packQuantity:rows.reduce((s,r)=>s+r.H,0),
    bonusPacks:rows.reduce((s,r)=>s+r.I,0),gross:round(rows.reduce((s,r)=>s+r.R,0)),
    discount:round(rows.reduce((s,r)=>s+r.S,0)),total:round(rows.reduce((s,r)=>s+r.W,0)),
    paid:round(rows.reduce((s,r)=>s+r.Y,0)),due:round(rows.reduce((s,r)=>s+r.Z,0)),
    bonusChargedAtCost:round(rows.reduce((s,r)=>s+r.I*r.J*r.N,0))},
  notes, mismatchCount:mismatches.length, mismatchSample:mismatches.slice(0,10),
  mismatchTypes:[...new Set(mismatches.map(m=>m.issue))]},null,2));
