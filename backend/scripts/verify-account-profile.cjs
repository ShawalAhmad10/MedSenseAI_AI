const assert = require('node:assert/strict');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { sequelize } = require('../src/config/database');
const Customer = require('../src/models/Customer');
const controller = require('../src/controllers/customerAuthController');
(async () => {
  sequelize.options.logging = false;
  try {
    const customers = await Customer.findAll();
    const customer = customers.find(row => row.is_active && row.status !== 0);
    assert.ok(customer, 'No active customer available for verification');
    const token = jwt.sign({ id: customer.customer_id, type: 'customer' }, process.env.JWT_SECRET, { expiresIn: '2m' });
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const account = await fetch('http://127.0.0.1:5005/api/customer/auth/account?customerId=9999999', { headers });
    assert.equal(account.status, 200);
    assert.equal((await account.json()).data.customer.id, customer.customer_id);
    const anonymous = await fetch('http://127.0.0.1:5005/api/customer/auth/account'); assert.equal(anonymous.status, 401);
    const invalid = await fetch('http://127.0.0.1:5005/api/customer/auth/profile', { method: 'PUT', headers, body: JSON.stringify({ city: null }) });
    assert.equal(invalid.status, 400);
    const transaction = await sequelize.transaction();
    const findByPk = Customer.findByPk;
    try {
      const record = await findByPk.call(Customer, customer.customer_id, { transaction });
      const save = record.save;
      record.save = options => save.call(record, { ...options, transaction });
      Customer.findByPk = async id => { assert.equal(id, customer.customer_id); return record; };
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
      await controller.updateProfile({ user: { id: customer.customer_id }, body: {
        name: 'Rollback verification', phone: '03000000000', city: 'Verification city', address: 'Verification address', customer_id: 9999999,
      } }, res);
      assert.equal(res.statusCode, 200);
      const stored = await findByPk.call(Customer, customer.customer_id, { transaction });
      assert.equal(stored.customer_name, 'Rollback verification');
      assert.equal(stored.customer_city, 'Verification city');
      assert.equal(stored.customer_contact, '03000000000');
    } finally { Customer.findByPk = findByPk; await transaction.rollback(); }
    console.log('PASS: running account API, customer ownership, unauthenticated rejection, inline validation and real database profile save.');
    console.log('Profile verification changes rolled back; existing customer details preserved.');
  } finally { await sequelize.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
