// Fail before starting services if they would use different pharmacy databases.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dotenv = require('../backend/node_modules/dotenv');
const project = path.resolve(__dirname,'..');
try {
  const backend = dotenv.parse(fs.readFileSync(path.join(project,'backend/.env')));
  const ai = dotenv.parse(fs.readFileSync(path.join(project,'ai_service/.env')));
  for (const key of ['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD']) assert.ok(backend[key],`${key} is missing`);
  const url = new URL(ai.MEDSENSE_DATABASE_URL);
  const normalizedHost = host => ['localhost','127.0.0.1','::1'].includes(host) ? 'loopback' : host;
  assert.equal(normalizedHost(url.hostname),normalizedHost(backend.DB_HOST),'Backend and AI database hosts differ');
  assert.equal(url.port || '5432',backend.DB_PORT || '5432','Backend and AI database ports differ');
  assert.equal(decodeURIComponent(url.pathname.slice(1)),backend.DB_NAME,'Backend and AI database names differ');
  assert.equal(decodeURIComponent(url.username),backend.DB_USER,'Backend and AI database users differ');
  assert.equal(decodeURIComponent(url.password),backend.DB_PASSWORD,'Backend and AI database credentials differ');
  const options = url.searchParams.get('options') || '';
  const schema = options.match(/search_path\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1] || 'public';
  assert.equal(schema,backend.DB_SCHEMA || 'public','Backend and AI database schemas differ');
  console.log(`Database settings agree: ${backend.DB_NAME} / ${schema}`);
} catch (error) {
  // Assertion messages only: never print environment values, URLs or credentials.
  console.error('Database settings check failed: '+(error.generatedMessage ? 'Backend and AI configuration differs' : error.message.split('\n')[0]));
  process.exitCode=1;
}
