const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = require('../data/requested-business-directory.json');
const categories = require('../data/requested-categories.json');
const attachment = 'C:/Users/Amna Rana/.codex/attachments/ae259f2d-687c-4a65-9e8a-d0e3a56c7c56/Pasted text.txt';
const categoryMappings = {
  'Vitamin / Supplement': 'Vitamins',
  'Vitamins / Neuropathy': 'Vitamins',
  Rehydration: 'Gastrointestinal',
  Laxative: 'Gastrointestinal',
  Dermatological: 'Personal Care',
};
const useOther = process.argv.includes('--other-category');
const skipUnmatched = process.argv.includes('--skip-unmatched');
const number = value => Number(value.replace(/[,\s%]/g, ''));
const rows = fs.readFileSync(attachment, 'utf8').split(/\r?\n/)
  .filter(line => /^\|\s*\d+\s*\|/.test(line)).map(line => {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    assert.equal(cells.length, 13);
    const [rowNumber,title,salt,originalCategory,brand,sourceSupplier,packPrice,packLabel,price,minThreshold,discount,rx,packDescription] = cells;
    const supplier = sourceSupplier === 'ShahAlmad' ? 'Shawal Ahmad' : sourceSupplier;
    const packSize = /^\d+(?:\.\d+)?\s*(?:ml|g|mg|mcg|kg|l)\b/i.test(packLabel)
      ? 1 : Number(packLabel.match(/^\d+/)?.[0]);
    assert.ok(directory.brands.includes(brand), `Unknown brand: ${brand}`);
    assert.ok(directory.suppliers.includes(supplier), `Unknown supplier: ${supplier}`);
    assert.ok(title && title.length <= 255 && salt.length <= 255);
    assert.ok(number(packPrice) > 0 && number(price) > 0 && Number.isSafeInteger(packSize) && packSize > 0);
    assert.ok(Math.abs(number(packPrice) / packSize - number(price)) <= 0.011, `Pack/unit prices: ${title}`);
    assert.ok(Number.isSafeInteger(number(minThreshold)) && number(minThreshold) >= 0);
    assert.ok(Number.isFinite(number(discount)) && number(discount) >= 0 && number(discount) < 100);
    assert.ok(['Yes','No'].includes(rx));
    let category = categoryMappings[originalCategory] || originalCategory;
    if (!categories.includes(category) && useOther) category = 'Other';
    return { number: Number(rowNumber), title, salt, originalCategory, category, brand, supplier,
      packPrice: number(packPrice), packLabel, packSize, price: number(price),
      minThreshold: number(minThreshold), discount: number(discount), requiresRx: rx === 'Yes', packDescription };
  });
assert.equal(rows.length, 50);
assert.equal(new Set(rows.map(row => row.number)).size, 50);
assert.equal(new Set(rows.map(row => row.title.toLowerCase())).size, 50);
const unmatched = rows.filter(row => !categories.includes(row.category));
const products = skipUnmatched ? rows.filter(row => categories.includes(row.category)) : rows;
const skipped = skipUnmatched ? unmatched : [];
fs.writeFileSync(path.resolve(__dirname, '../data/additional-products-101-150.json'),
  JSON.stringify({ products, skipped }, null, 2));
console.log(JSON.stringify({ provided: rows.length, prepared: products.length, skipped: skipped.length,
  categoryMappings, unresolved: products.filter(row => !categories.includes(row.category))
    .map(({ title, originalCategory }) => ({ title, originalCategory })) }));
