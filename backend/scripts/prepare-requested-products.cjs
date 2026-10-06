const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = require('../data/requested-business-directory.json');
const aliases = {
  GSK:'GSK Pakistan',Abbott:'Abbott Laboratories Pakistan',Hilton:'Hilton Pharma',Searle:'Searle Pakistan',
  Sami:'Sami Pharmaceuticals',Ferozsons:'Ferozsons Laboratories','Don Valley':'Don Valley Pharmaceuticals',Brookes:'Brookes Pharma'
};
const files = [
  'C:/Users/Amna Rana/.codex/attachments/ad03cfa3-164d-49c2-a4ff-2d0ab946b077/Pasted text.txt',
  'C:/Users/Amna Rana/.codex/attachments/f3594810-f059-483e-a720-55406c8dd42a/Pasted text.txt'
];
const rows = files.flatMap(file=>fs.readFileSync(file,'utf8').split(/\r?\n/).filter(line=>/^\|\s*\d+\s*\|/.test(line)).map(line=>{
  const cells = line.split('|').slice(1,-1).map(c=>c.trim());
  assert.equal(cells.length,13);
  const [number,title,salt,category,sourceBrand,sourceSupplier,packPrice,packLabel,price,minThreshold,discount,rx,packDescription]=cells;
  const supplier=sourceSupplier==='ShahAlmad'?'Shawal Ahmad':sourceSupplier;
  const numeric=value=>Number(value.replace(/[,\s%]/g,''));
  const packSize=/^\d+\s*(?:ml|inhaler|prefilled pen)\b/i.test(packLabel)?1:Number(packLabel.match(/^\d+/)?.[0]);
  assert.ok(directory.suppliers.includes(supplier),'Unknown supplier');
  assert.ok(numeric(packPrice)>0 && numeric(price)>0 && packSize>0);
  assert.ok(Math.abs(numeric(packPrice)/packSize-numeric(price))<=0.011,'Sale pack and unit price disagree');
  return {number:Number(number),title,salt,category,brand:aliases[sourceBrand]||sourceBrand,sourceBrand,supplier,
    packPrice:numeric(packPrice),packLabel,packSize,price:numeric(price),minThreshold:numeric(minThreshold),
    discount:numeric(discount),requiresRx:rx==='Yes',packDescription};
}));
assert.equal(rows.length,100);
assert.equal(new Set(rows.map(row=>row.number)).size,100);
const products=rows.filter(row=>directory.brands.includes(row.brand)).map(row=>({
  ...row,
  category:row.category==='Laxative'?'Gastrointestinal':row.category,
  supplier:['Piriton','Piriton 120ml'].includes(row.title)?'Iman Fatima':row.supplier
}));
const skipped=rows.filter(row=>!directory.brands.includes(row.brand)).map(row=>({number:row.number,title:row.title,brand:row.brand}));
fs.writeFileSync(path.resolve(__dirname,'../data/requested-products.json'),JSON.stringify({products,skipped},null,2));
console.log(JSON.stringify({provided:rows.length,approvedBrandProducts:products.length,skipped:skipped.length,
  skippedBrands:[...new Set(skipped.map(row=>row.brand))],categoryMismatches:[...new Set(products.map(row=>row.category).filter(c=>!require('../data/requested-categories.json').includes(c)))]}));
