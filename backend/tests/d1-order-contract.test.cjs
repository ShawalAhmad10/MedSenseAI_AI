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

// AUTHENTICATED_ORDER_IDENTITY_GUARD_V1
test('authenticated storefront order is bound to verified customer identity', () => {
  const { enforceAuthenticatedCustomerOrderIdentity } =
    require('../src/middleware/customerAuth');

  const req = {
    customerUser: { id: 42 },
    body: { customer_id: 42 }
  };

  let nextCalled = false;
  const res = {};

  enforceAuthenticatedCustomerOrderIdentity(
    req,
    res,
    () => { nextCalled = true; }
  );

  assert.equal(nextCalled, true);
  assert.equal(req.body.customer_id, 42);
});

test('authenticated storefront order fills missing body customer identity from JWT', () => {
  const { enforceAuthenticatedCustomerOrderIdentity } =
    require('../src/middleware/customerAuth');

  const req = {
    customerUser: { id: 42 },
    body: {}
  };

  let nextCalled = false;

  enforceAuthenticatedCustomerOrderIdentity(
    req,
    {},
    () => { nextCalled = true; }
  );

  assert.equal(nextCalled, true);
  assert.equal(req.body.customer_id, 42);
});

test('authenticated storefront order rejects forged customer identity', () => {
  const { enforceAuthenticatedCustomerOrderIdentity } =
    require('../src/middleware/customerAuth');

  const req = {
    customerUser: { id: 42 },
    body: { customer_id: 99 }
  };

  let nextCalled = false;
  const res = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };

  enforceAuthenticatedCustomerOrderIdentity(
    req,
    res,
    () => { nextCalled = true; }
  );

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'CUSTOMER_IDENTITY_MISMATCH');
});

test('anonymous storefront order compatibility remains unchanged', () => {
  const { enforceAuthenticatedCustomerOrderIdentity } =
    require('../src/middleware/customerAuth');

  const req = {
    customerUser: null,
    body: { customer_id: 99 }
  };

  let nextCalled = false;

  enforceAuthenticatedCustomerOrderIdentity(
    req,
    {},
    () => { nextCalled = true; }
  );

  assert.equal(nextCalled, true);
  assert.equal(req.body.customer_id, 99);
});

test('order POST applies optional JWT then identity guard before existing controller', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const routeSource = fs.readFileSync(
    path.join(__dirname, '../src/routes/orderRoutes.js'),
    'utf8'
  );

  assert.match(
    routeSource,
    /router\.post\('\/'\s*,\s*optionalCustomerToken\s*,\s*enforceAuthenticatedCustomerOrderIdentity\s*,\s*orderController\.createOrder\)/
  );
});

// STOCK_INTEGRITY_REGRESSION_V1
test('final stock allocation uses row locks before deducting stock', () => {
  const createOrderStart =
    source.indexOf('exports.createOrder = async (req, res) => {');

  const nextExport =
    source.indexOf('exports.', createOrderStart + 10);

  const scope =
    nextExport > createOrderStart
      ? source.slice(createOrderStart, nextExport)
      : source.slice(createOrderStart);

  const lock = scope.indexOf('FOR UPDATE');
  const stockUpdate = scope.indexOf(
    'SET remaining_quantity = remaining_quantity - :qty'
  );

  assert.ok(lock >= 0);
  assert.ok(stockUpdate >= 0);
  assert.ok(
    lock < stockUpdate,
    'Stock rows must be locked before stock deduction',
  );
});

test('incomplete batch allocation fails before stock deduction', () => {
  const createOrderStart =
    source.indexOf('exports.createOrder = async (req, res) => {');

  const nextExport =
    source.indexOf('exports.', createOrderStart + 10);

  const scope =
    nextExport > createOrderStart
      ? source.slice(createOrderStart, nextExport)
      : source.slice(createOrderStart);

  const allocationFailure =
    scope.indexOf('STOCK_ALLOCATION_FAILED: product ');

  const stockUpdate =
    scope.indexOf(
      'SET remaining_quantity = remaining_quantity - :qty'
    );

  assert.ok(allocationFailure >= 0);
  assert.ok(stockUpdate >= 0);
  assert.ok(
    allocationFailure < stockUpdate,
    'Incomplete allocation must fail before that allocation mutates stock',
  );
});

test('createOrder keeps stock allocation inside transaction rollback boundary', () => {
  const createOrderStart =
    source.indexOf('exports.createOrder = async (req, res) => {');

  const nextExport =
    source.indexOf('exports.', createOrderStart + 10);

  const scope =
    nextExport > createOrderStart
      ? source.slice(createOrderStart, nextExport)
      : source.slice(createOrderStart);

  const transactionStart =
    scope.indexOf('const transaction = await sequelize.transaction()');

  const allocationFailure =
    scope.indexOf('STOCK_ALLOCATION_FAILED: product ');

  const commit =
    scope.indexOf('await transaction.commit()');

  const rollbackAfterFailure =
    scope.indexOf('await transaction.rollback()', allocationFailure);

  assert.ok(transactionStart >= 0);
  assert.ok(allocationFailure > transactionStart);
  assert.ok(commit > allocationFailure);
  assert.ok(
    rollbackAfterFailure > allocationFailure,
    'Allocation failure must remain covered by a transaction rollback path',
  );
});

// ORDER_READ_PRIVACY_V1
test('customer reads require verified JWT before staff wall', () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, '../src/routes/orderRoutes.js'),
    'utf8'
  );

  const list = routeSource.indexOf("'/my-orders'");
  const detail = routeSource.indexOf("'/my-orders/:id'");
  const wall = routeSource.indexOf('router.use(authenticate);');

  assert.ok(list >= 0 && list < wall);
  assert.ok(detail >= 0 && detail < wall);
  assert.match(routeSource, /verifyCustomerToken/);
  assert.match(routeSource, /bindAuthenticatedCustomerOrderRead/);
});

test('staff reads preserve existing URLs behind auth and role wall', () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, '../src/routes/orderRoutes.js'),
    'utf8'
  );

  const authWall = routeSource.indexOf('router.use(authenticate);');
  const roleWall = routeSource.indexOf('router.use(requireOrderStaffRole);');

  const list = routeSource.indexOf(
    "router.get('/', orderController.getAllOrders);",
    roleWall
  );

  const stats = routeSource.indexOf(
    "router.get('/stats', orderController.getOrderStats);",
    roleWall
  );

  const detail = routeSource.indexOf(
    "router.get('/:id', orderController.getOrderById);",
    roleWall
  );

  assert.ok(authWall >= 0);
  assert.ok(roleWall > authWall);
  assert.ok(list > roleWall);
  assert.ok(stats > roleWall);
  assert.ok(detail > roleWall);
  assert.match(routeSource, /\['pharmacist', 'admin'\]/);
});

test('customer list is bound to server verified customer identity', () => {
  assert.match(source, /req\.customerOrderCustomerId/);
  assert.match(source, /const effectiveCustomerId =/);
  assert.match(
    source,
    /replacements\.customer_id = parseInt\(effectiveCustomerId\)/
  );
});

test('customer detail ownership is enforced in invoice SQL', () => {
  assert.match(source, /enforceCustomerOwnership/);
  assert.match(source, /AND i\.customer_id = :customer_id/);
  assert.match(source, /customer_id: authenticatedCustomerId/);

  const itemStart = source.indexOf('const itemsQuery = `');
  const itemEnd = source.indexOf('res.json({', itemStart);
  const itemScope = source.slice(itemStart, itemEnd);

  assert.match(itemScope, /replacements: \{ id \}/);
});

test('storefront customer reads send JWT to owned order routes', () => {
  const storefrontSource = fs.readFileSync(
    path.join(
      __dirname,
      '../../medsense_ai/src/services/storefrontOrderService.js'
    ),
    'utf8'
  );

  assert.match(
    storefrontSource,
    /API_URL}\/my-orders\?limit=100/
  );

  assert.match(
    storefrontSource,
    /API_URL}\/my-orders\/\$\{orderId\}/
  );

  const headers = storefrontSource.match(/Authorization:/g) || [];
  assert.ok(headers.length >= 3);
});

test('DDI and createOrder remain before staff read wall', () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, '../src/routes/orderRoutes.js'),
    'utf8'
  );

  const ddi = routeSource.indexOf("router.post('/ddi-check'");
  const create = routeSource.indexOf("router.post('/', optionalCustomerToken");
  const wall = routeSource.indexOf('router.use(authenticate);');

  assert.ok(ddi >= 0 && ddi < wall);
  assert.ok(create >= 0 && create < wall);
});

// ORDER_SORT_SAFETY_V1
test('order list uses an explicit sort column allowlist before SQL interpolation', () => {
  const start = source.indexOf(
    'exports.getAllOrders = async (req, res) => {'
  );

  const end = source.indexOf(
    'exports.getOrderById = async (req, res) => {'
  );

  const scope = source.slice(start, end);

  assert.match(
    scope,
    /const validSortColumns = \[/
  );

  for (const column of [
    'created_at',
    'invoice_date',
    'invoice_id',
    'total_amount',
    'customer_name'
  ]) {
    assert.match(scope, new RegExp(`'${column}'`));
  }

  assert.match(
    scope,
    /validSortColumns\.includes\(sortBy\)/
  );

  assert.match(
    scope,
    /: 'created_at'/
  );
});

test('order sort direction is normalized to ASC or DESC only', () => {
  const start = source.indexOf(
    'exports.getAllOrders = async (req, res) => {'
  );

  const end = source.indexOf(
    'exports.getOrderById = async (req, res) => {'
  );

  const scope = source.slice(start, end);

  assert.match(
    scope,
    /String\(sortDir\)\.toUpperCase\(\) === 'ASC'/
  );

  assert.match(scope, /\? 'ASC'/);
  assert.match(scope, /: 'DESC'/);
});

test('raw request sort values are never interpolated into order SQL', () => {
  const start = source.indexOf(
    'exports.getAllOrders = async (req, res) => {'
  );

  const end = source.indexOf(
    'exports.getOrderById = async (req, res) => {'
  );

  const scope = source.slice(start, end);

  assert.doesNotMatch(
    scope,
    /ORDER BY i\.\$\{sortBy\} \$\{sortDir\}/
  );

  assert.match(
    scope,
    /ORDER BY i\.\$\{sortColumn\} \$\{sortDirection\}/
  );
});
