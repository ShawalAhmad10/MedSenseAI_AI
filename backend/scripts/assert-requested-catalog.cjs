const assert = require('node:assert/strict');
const { products } = require('../data/requested-products.json');
const categories = require('../data/requested-categories.json');

// Called inside the replacement transaction. Every trial write is rolled back.
module.exports = async function assertCatalog(client) {
  const q = (sql, params) => client.query(sql, params);
  const actual = (await q(`SELECT p.*,b.brand_name,s.supplier_name FROM product p
    JOIN brand b ON b.brand_id=p.product_brand JOIN supplier_info s ON s.supplier_id=p.product_supplier`)).rows;
  assert.equal(actual.length, products.length);
  for (const expected of products) {
    const row = actual.find(p => p.product_title === expected.title);
    assert.ok(row, expected.title);
    assert.equal(row.brand_name, expected.brand);
    assert.equal(row.supplier_name, expected.supplier);
    assert.equal(row.product_category, expected.category);
    assert.equal(Number(row.product_price), expected.price);
    assert.equal(Number(row.product_pack_price), expected.packPrice);
    assert.equal(Number(row.product_pack_size), expected.packSize);
    assert.equal(row.product_purchase_price, null);
    assert.equal(row.product_status, 0);
  }
  assert.deepEqual((await q('SELECT category_name FROM medicine_categories WHERE status=1 ORDER BY display_order')).rows
    .map(row => row.category_name), categories);
  const piriton = actual.filter(p => ['Piriton', 'Piriton 120ml'].includes(p.product_title));
  assert.equal(piriton.length, 2);
  assert.equal(piriton[0].medicine_supply_key, piriton[1].medicine_supply_key);
  assert.equal(piriton[0].fifo_family_id, piriton[1].fifo_family_id);

  const source = actual[0];
  const otherSupplier = actual.find(p => p.product_supplier !== source.product_supplier).product_supplier;
  const results = [];
  async function trial(label, action, rejected = false) {
    await q('SAVEPOINT catalog_trial');
    let failure;
    try { await action(); } catch (error) { failure = error; }
    await q('ROLLBACK TO SAVEPOINT catalog_trial');
    await q('RELEASE SAVEPOINT catalog_trial');
    if (rejected) assert.equal(failure?.code, '23514', `${label}: ${failure?.message || 'unexpectedly accepted'}`);
    else if (failure) throw failure;
    results.push(label);
  }
  const clone = (supplier = source.product_supplier, brand = source.product_brand, title = source.product_title,
    family = null, description = source.product_pack_description) => q(`INSERT INTO product
      (product_title,product_generic_name,product_salt,product_category,product_brand,product_supplier,
       product_price,product_pack_size,product_pack_description,product_status,fifo_family_id)
      VALUES($1,$2,$3,$4,$5,$6,10,$7,$8,0,$9) RETURNING product_id`,
    [title, source.product_generic_name, source.product_salt, source.product_category, brand, supplier,
      source.product_pack_size, description, family]);
  await trial('Brand is mandatory', () => clone(source.product_supplier, null), true);
  await trial('Supplier is mandatory', () => clone(null), true);
  await trial('Same medicine cannot use another supplier', () => clone(otherSupplier), true);
  await trial('Description changes cannot bypass supplier assignment',
    () => clone(otherSupplier, source.product_brand, source.product_title, null, 'Changed description'), true);
  await trial('Renamed FIFO arrival keeps its supplier',
    () => clone(otherSupplier, source.product_brand, 'Renamed arrival', source.product_id), true);
  await trial('A supplier can supply multiple medicines',
    () => clone(source.product_supplier, source.product_brand, 'Different medicine verification'));
  await trial('New arrival can keep the medicine assigned supplier',
    () => clone(source.product_supplier, source.product_brand, 'Renamed arrival', source.product_id));
  await trial('Existing supplier assignment cannot be changed',
    () => q('UPDATE product SET product_supplier=$1 WHERE product_id=$2', [otherSupplier, source.product_id]), true);

  const receipt = async supplier => (await q(`INSERT INTO stock(supplier_id,creation_day,status)
    VALUES($1,CURRENT_DATE,1) RETURNING stock_id`, [supplier])).rows[0].stock_id;
  const receive = stockId => q(`INSERT INTO stock_history(stock_id,product_id,product_title,
    product_quantity,initial_quantity,remaining_quantity,product_price,sale_price,expiry_date,batch_status,status)
    VALUES($1,$2,$3,1,1,1,1,$4,CURRENT_DATE+365,'ACTIVE',1)`,
    [stockId, source.product_id, source.product_title, source.product_price]);
  await trial('Receipt rejects another supplier', async () => receive(await receipt(otherSupplier)), true);
  await trial('Receipt accepts assigned supplier', async () => receive(await receipt(source.product_supplier)));
  await trial('Receipt header cannot switch to another supplier', async () => {
    const id = await receipt(source.product_supplier);
    await receive(id);
    await q('UPDATE stock SET supplier_id=$1 WHERE stock_id=$2', [otherSupplier, id]);
  }, true);
  assert.equal((await q('SELECT count(*)::int n FROM stock_history')).rows[0].n, 0);
  return results;
};
