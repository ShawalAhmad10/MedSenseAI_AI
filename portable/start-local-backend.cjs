const path = require('node:path');
const { execFileSync } = require('node:child_process');
const backend = path.join(__dirname, '..', 'backend');
process.chdir(backend);
require(path.join(backend, 'node_modules', 'dotenv')).config({
  path: path.join(__dirname, 'backend.env.reference'), override: true
});
process.env.DB_SSL = 'false';
process.env.DB_SCHEMA = 'public';
execFileSync(process.execPath, ['src/db/migrate-product-prices.js'], {
  cwd: backend, env: process.env, stdio: 'inherit'
});
require(path.join(backend, 'src', 'server.js'));
