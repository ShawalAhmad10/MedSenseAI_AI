// Read-only runtime check. Never logs tokens, customer identities or provider keys.
require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { sequelize } = require('../src/config/database');
const { Pharmacist } = require('../src/models');
(async () => {
  sequelize.options.logging = false;
  try {
    const staff = (await Pharmacist.findAll()).find(row => row.isActive &&
      (row.role === 'admin' || (row.isEmailVerified && row.isApproved)));
    assert.ok(staff, 'An approved staff account is needed for verification');
    const token = jwt.sign({ id: staff.id, role: staff.role }, process.env.JWT_SECRET, { expiresIn: '5m' });
    for (const [method, route] of [['GET', '/leads'], ['POST', '/leads/recalculate']]) {
    const started = performance.now();
    const response = await fetch(`http://127.0.0.1:5005/api${route}?limit=100`, {
      method,
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120000)
    });
    const body = await response.json();
    console.log(JSON.stringify({ method, status: response.status, elapsedMs: Math.round(performance.now() - started),
      leadCount: body.data?.leads?.length ?? null, code: body.code ?? null,
      scoringStatuses: [...new Set((body.data?.leads || []).map(row => row.scoring?.status))] }));
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.data.leads));
    }
  } finally { await sequelize.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
