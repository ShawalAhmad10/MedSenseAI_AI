const path = require('node:path');
const { execFileSync } = require('node:child_process');
const backend = path.join(__dirname, '..', 'backend');
process.chdir(backend);
require('./check-database-settings.cjs');
if (process.exitCode) process.exit(process.exitCode);
require(path.join(backend, 'node_modules', 'dotenv')).config({ path: path.join(backend, '.env'), override: true });
execFileSync(process.execPath, ['src/db/migrate-product-prices.js'], {
  cwd: backend, env: process.env, stdio: 'inherit'
});
require(path.join(backend, 'src', 'server.js'));
