const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const Customer = require('../src/models/Customer');
const controller = require('../src/controllers/customerAuthController');
const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(body) { this.body = body; return this; } });

test('profile save binds verified customer identity and updates only permitted fields', async () => {
  const original = Customer.findByPk;
  let saved = false;
  const customer = { customer_id: 7, customer_name: 'Old name', email: 'owner@example.test', phone: '03000000000',
    customer_city: 'Lahore', address: 'Old address', status: 1, save: async () => { saved = true; } };
  Customer.findByPk = async id => { assert.equal(id, 7); return customer; };
  try {
    const res = response();
    await controller.updateProfile({ user: { id: 7 }, body: { customer_id: 99, status: 0, password: 'ignored',
      name: ' Updated name ', phone: ' 03111111111 ', city: ' Karachi ', address: ' Updated address ' } }, res);
    assert.equal(res.statusCode, 200); assert.equal(saved, true);
    assert.equal(customer.customer_name, 'Updated name'); assert.equal(customer.phone, '03111111111');
    assert.equal(customer.customer_contact, customer.phone); assert.equal(customer.customer_city, 'Karachi');
    assert.equal(customer.status, 1); assert.equal(customer.password, undefined); assert.equal(res.body.data.id, 7);
  } finally { Customer.findByPk = original; }
});
test('invalid profile fields return validation errors before touching customer records', async () => {
  const original = Customer.findByPk;
  Customer.findByPk = async () => { throw new Error('Invalid profile must not load a record'); };
  try {
    for (const body of [{ name: ' ' }, { phone: {} }, { city: null }, { address: '' }]) {
      const res = response(); await controller.updateProfile({ user: { id: 7 }, body }, res);
      assert.equal(res.statusCode, 400); assert.equal(res.body.success, false);
    }
  } finally { Customer.findByPk = original; }
});
test('customer account read ignores arbitrary supplied customer identifiers', async () => {
  const accountController = require('../src/controllers/customerController');
  const routes = require('../src/routes/customerAuthRoutes');
  const route = routes.stack.find(layer => layer.route?.path === '/account').route;
  assert.equal(route.stack.length, 2);
  const original = accountController.getCustomerDetails;
  accountController.getCustomerDetails = async req => { assert.equal(req.params.customerId, 7); };
  try { await route.stack[1].handle({ user: { id: 7 }, params: { customerId: 99 }, query: { customerId: 99 } }, response()); }
  finally { accountController.getCustomerDetails = original; }
});
