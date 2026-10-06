const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { sequelize } = require('../src/config/database');
const service = require('../src/services/leadScoringService');
const created_at = '2026-09-01T00:00:00.000Z';

test('list loads two snapshots queries, bounds AI concurrency, shares only running work and preserves order', async t => {
  const query = sequelize.query, post = axios.post;
  t.after(() => { sequelize.query = query; axios.post = post; });
  let queries = 0, requests = 0, active = 0, peak = 0;
  sequelize.query = async (sql, options) => {
    queries++;
    if (sql.includes('FROM customer')) {
      assert.equal(options.replacements.limit, 100);
      return [1, 2, 3, 4, 5].map(customer_id => ({ customer_id, created_at }));
    }
    assert.match(sql, /NOT IN \('cancelled', 'refunded'\)/);
    assert.deepEqual(options.replacements.customer_ids, [1, 2, 3, 4, 5]);
    return [1, 2, 4].map(customer_id => ({ order_id: customer_id + 10, customer_id, created_at }));
  };
  axios.post = async (url, payload) => {
    requests++; active++; peak = Math.max(peak, active);
    const id = payload.customer.customer_id;
    assert.ok(payload.orders.every(row => row.customer_id === id));
    await new Promise(resolve => setTimeout(resolve, id === 1 ? 20 : 2));
    active--;
    return { status: 200, data: { customer_id: id } };
  };
  const first = service.scoreCustomers(100);
  const duplicate = service.scoreCustomers('100');
  assert.equal(first, duplicate);
  const results = await first;
  assert.equal(queries, 2);
  assert.equal(requests, 5);
  assert.equal(peak, 3);
  assert.deepEqual(results.map(row => row.upstream.result.customer_id), [1, 2, 3, 4, 5]);
  assert.equal(results[2].snapshot.orders.length, 0);
  await service.scoreCustomers(100);
  assert.equal(queries, 4, 'refresh re-reads current data');
  assert.equal(requests, 10);
});

test('bad authoritative invoice identity fails before any AI scoring', async t => {
  const query = sequelize.query, post = axios.post;
  t.after(() => { sequelize.query = query; axios.post = post; });
  let scored = false;
  sequelize.query = async sql => sql.includes('FROM customer')
    ? [{ customer_id: 1, created_at }]
    : [{ customer_id: 2, order_id: 12, created_at }];
  axios.post = async () => { scored = true; };
  await assert.rejects(service.scoreCustomers(100), { code: 'LEAD_INVALID_ORDER_SNAPSHOT' });
  assert.equal(scored, false);
});

test('a failed request is removed from pending work so retry can recover', async t => {
  const query = sequelize.query, post = axios.post;
  t.after(() => { sequelize.query = query; axios.post = post; });
  sequelize.query = async sql => sql.includes('FROM customer') ? [{ customer_id: 1, created_at }] : [];
  axios.post = async () => { throw new Error('AI unavailable'); };
  await assert.rejects(service.scoreCustomers(100), /AI unavailable/);
  axios.post = async () => ({ status: 200, data: { status: 'insufficient_data' } });
  assert.equal((await service.scoreCustomers(100))[0].upstream.httpStatus, 200);
});

test('empty or invalid lists never call AI', async t => {
  const query = sequelize.query, post = axios.post;
  t.after(() => { sequelize.query = query; axios.post = post; });
  let queries = 0;
  sequelize.query = async () => { queries++; return []; };
  axios.post = async () => { assert.fail('AI should not be called'); };
  await assert.rejects(service.scoreCustomers(101), { code: 'LEAD_INVALID_LIMIT' });
  assert.equal(queries, 0);
  assert.deepEqual(await service.scoreCustomers(100), []);
  assert.equal(queries, 1);
});
