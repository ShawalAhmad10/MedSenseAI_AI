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

const page =
  fs.readFileSync(
    path.join(
      root,
      'src/pages/dashboard/LeadScoring.jsx'
    ),
    'utf8'
  );

test('active Lead page uses real authenticated API', () => {
  assert.match(
    page,
    /api\.get\('\/leads\?limit=100'\)/
  );

  assert.match(
    page,
    /api\.post\('\/leads\/recalculate\?limit=100'\)/
  );
});

test('active Lead page has explicit insufficient and model unavailable states', () => {
  assert.match(
    page,
    /insufficient_data/
  );

  assert.match(
    page,
    /model_unavailable/
  );

  assert.match(
    page,
    /Lead scoring data is currently unavailable/
  );
});

test('active Lead page preserves synthetic-development disclosure', () => {
  assert.match(
    page,
    /synthetic_development_notice/
  );

  assert.match(
    page,
    /firstNotice/
  );
});

test('active Lead page does not implement Hot Warm Cold business tiers', () => {
  assert.doesNotMatch(
    page,
    /\bHot\b/
  );

  assert.doesNotMatch(
    page,
    /\bWarm\b/
  );

  assert.doesNotMatch(
    page,
    /\bCold\b/
  );

  assert.doesNotMatch(
    page,
    /CustomerProfileDrawer/
  );
});

test('Lead score remains nullable instead of inventing a fallback', () => {
  assert.match(
    page,
    /lead_score !== null/
  );

  assert.match(
    page,
    /lead_score !== undefined/
  );

  assert.match(
    page,
    /\? rawScore\s*:\s*null/
  );
});