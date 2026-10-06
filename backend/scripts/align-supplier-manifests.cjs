const fs = require('node:fs');
const path = require('node:path');
const directoryFile = path.resolve(__dirname,'../data/requested-business-directory.json');
const directory = JSON.parse(fs.readFileSync(directoryFile,'utf8'));
directory.suppliers = directory.suppliers.map(name => name === 'ShahAlmad' ? 'Shawal Ahmad' : name);
fs.writeFileSync(directoryFile,JSON.stringify(directory,null,2));
for (const file of ['requested-products.json','additional-products-101-150.json']) {
  const location = path.resolve(__dirname,'../data',file);
  const payload = JSON.parse(fs.readFileSync(location,'utf8'));
  for (const row of payload.products) if (row.supplier === 'ShahAlmad') row.supplier = 'Shawal Ahmad';
  fs.writeFileSync(location,JSON.stringify(payload,null,2));
}
console.log('Approved supplier name aligned in the saved catalog manifests.');
