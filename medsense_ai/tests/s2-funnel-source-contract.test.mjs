import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here =
  path.dirname(
    fileURLToPath(import.meta.url)
  );

const root =
  path.resolve(here, '..');

const source =
  fs.readFileSync(
    path.join(
      root,
      'src/services/storefrontFunnelService.js'
    ),
    'utf8'
  );

test('funnel telemetry uses same-origin backend API', () => {
  assert.match(
    source,
    /['"]\/api\/funnel\/events['"]/
  );

  assert.doesNotMatch(
    source,
    /localhost:5005\/api\/funnel\/events/
  );
});

test('customer identity supports both session and remembered authentication', () => {
  assert.match(
    source,
    /sessionStorage\.getItem\(CUSTOMER_AUTH_KEY\)/
  );

  assert.match(
    source,
    /localStorage\.getItem\(CUSTOMER_AUTH_KEY\)/
  );
});

test('telemetry sends stable event identity fields', () => {
  assert.match(
    source,
    /event_id:\s*envelope\.event_id/
  );

  assert.match(
    source,
    /occurred_at:\s*envelope\.occurred_at/
  );

  assert.match(
    source,
    /eventKey/
  );
});

test('stale pending once-event can recover', () => {
  assert.match(
    source,
    /Date\.now\(\) - pendingAt < 30000/
  );

  assert.match(
    source,
    /pendingAtKey/
  );
});

test('cart removals send authoritative positive quantity telemetry', () => {
  assert.match(
    source,
    /eventName === 'cart_item_added' \|\|\s*eventName === 'cart_item_removed'/
  );
});