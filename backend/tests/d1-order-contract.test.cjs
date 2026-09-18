const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'controllers', 'orderController.js'),
  'utf8',
);

test('final order reloads authoritative product identity and stock before DDI', () => {
  const createOrderStart = source.indexOf('exports.createOrder = async (req, res) => {');
  const invoiceMutation = source.indexOf('INSERT INTO invoice (', createOrderStart);

  assert.ok(createOrderStart >= 0);
  assert.ok(invoiceMutation > createOrderStart);

  const createOrderSafetyScope = source.slice(
    createOrderStart,
    invoiceMutation,
  );

  const productReload = createOrderSafetyScope.indexOf(
    'SELECT product_id, product_title, product_price'
  );

  const stockReload = createOrderSafetyScope.indexOf(
    'SELECT COALESCE(SUM(remaining_quantity)'
  );

  const ddiGate = createOrderSafetyScope.indexOf(
    'ddi = await ddiService.checkCart('
  );

  assert.ok(productReload >= 0);
  assert.ok(stockReload >= 0);
  assert.ok(ddiGate >= 0);

  assert.ok(
    productReload < ddiGate,
    'Authoritative product reload must occur before createOrder DDI gate',
  );

  assert.ok(
    stockReload < ddiGate,
    'Authoritative stock validation must occur before createOrder DDI gate',
  );
});

test('final order DDI gate executes before invoice mutation', () => {
  const ddiGate = source.indexOf('ddi = await ddiService.checkCart(');
  const invoiceInsert = source.indexOf('INSERT INTO invoice (');

  assert.ok(ddiGate >= 0);
  assert.ok(invoiceInsert >= 0);
  assert.ok(ddiGate < invoiceInsert);
});

test('blocked DDI paths rollback before mutation', () => {
  const gateStart = source.indexOf('let ddi;');
  const invoiceInsert = source.indexOf('INSERT INTO invoice (');
  const gateSource = source.slice(gateStart, invoiceInsert);

  assert.match(gateSource, /DDI_SERVICE_UNAVAILABLE/);
  assert.match(gateSource, /DDI_UPSTREAM_ERROR/);
  assert.match(gateSource, /DDI_REVIEW_REQUIRED/);

  const rollbacks = gateSource.match(/await transaction\.rollback\(\)/g) || [];
  assert.ok(rollbacks.length >= 4);
});

test('client selling price is not authoritative', () => {
  assert.match(source, /Client selling price is ignored/);
  assert.match(source, /Number\(product\.product_price \|\| 0\)/);
});

test('duplicate product lines are collapsed for DDI identity evaluation', () => {
  assert.match(source, /const ddiProductsById = new Map\(\)/);
  assert.match(source, /ddiProductsById\.set\(Number\(item\.product_id\)/);
  assert.match(source, /Array\.from\(ddiProductsById\.values\(\)\)/);
});

test('invalid order item and unavailable stock fail before invoice insert', () => {
  const invoiceInsert = source.indexOf('INSERT INTO invoice (');
  const invalidItem = source.indexOf("code: 'INVALID_ORDER_ITEM'");
  const unavailableProduct = source.indexOf("code: 'PRODUCT_NOT_AVAILABLE'");
  const insufficientStock = source.indexOf("code: 'INSUFFICIENT_STOCK'");

  assert.ok(invalidItem >= 0 && invalidItem < invoiceInsert);
  assert.ok(unavailableProduct >= 0 && unavailableProduct < invoiceInsert);
  assert.ok(insufficientStock >= 0 && insufficientStock < invoiceInsert);
});