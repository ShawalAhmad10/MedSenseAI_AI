const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

test('analytics routes require pharmacist authentication', () => {
  const source = read(
    'backend/src/routes/analyticsRoutes.js'
  );

  assert.match(
    source,
    /authenticateToken/
  );

  assert.match(
    source,
    /router\.use\(authenticateToken\)/
  );
});

test('analytics lifecycle contract excludes only cancelled and refunded', () => {
  const source = read(
    'backend/src/controllers/analyticsController.js'
  );

  assert.match(
    source,
    /cancelled/
  );

  assert.match(
    source,
    /refunded/
  );

  assert.doesNotMatch(
    source,
    /NOT IN\s*\([^)]*returned/i
  );
});

test('analytics no longer invents 100 percent change from zero baseline', () => {
  const source = read(
    'backend/src/controllers/analyticsController.js'
  );

  assert.doesNotMatch(
    source,
    /c === 0 \? 0 : 100/
  );

  assert.match(
    source,
    /c === 0 \? 0 : null/
  );
});

test('top medicine UI prefers Product Recorded Sales field', () => {
  const source = read(
    'medsense_ai/src/components/analytics/MedicineDemandChart.jsx'
  );

  assert.match(
    source,
    /data\.recordedSales \?\? data\.revenue/
  );
});

test('active Analytics page does not import legacy mock analytics sources', () => {
  const source = read(
    'medsense_ai/src/pages/dashboard/Analytics.jsx'
  );

  assert.doesNotMatch(
    source,
    /analyticsService/
  );

  assert.doesNotMatch(
    source,
    /analyticsData/
  );

  assert.match(
    source,
    /No mock values are being shown/
  );

  assert.match(
    source,
    /\/analytics\/summary/
  );

  assert.match(
    source,
    /\/analytics\/trend/
  );

  assert.match(
    source,
    /\/analytics\/top-medicines/
  );
});