import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'services', 'api.js'),
  'utf8'
);

test('explicit Authorization header takes precedence over remembered pharmacist auth', () => {
  assert.match(
    apiSource,
    /if\s*\(\s*userData\?\.token\s*&&\s*!config\.headers\.Authorization\s*\)/
  );

  assert.match(
    apiSource,
    /config\.headers\.Authorization\s*=\s*`Bearer \$\{userData\.token\}`/
  );
});