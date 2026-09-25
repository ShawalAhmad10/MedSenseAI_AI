import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here =
  path.dirname(
    fileURLToPath(
      import.meta.url
    )
  );

const root =
  path.resolve(
    here,
    '..'
  );

const page =
  fs.readFileSync(
    path.join(
      root,
      'src/pages/dashboard/AIAssistant.jsx'
    ),
    'utf8'
  );

const service =
  fs.readFileSync(
    path.join(
      root,
      'src/services/pharmacistAssistantService.js'
    ),
    'utf8'
  );

const api =
  fs.readFileSync(
    path.join(
      root,
      'src/services/api.js'
    ),
    'utf8'
  );

test(
  'assistant uses real authenticated API',
  () => {
    assert.match(
      service,
      /api\.post\(\s*['"]\/assistant\/ask['"]/
    );

    assert.match(
      api,
      /Authorization\s*=\s*`Bearer \$\{userData\.token\}`/
    );
  }
);

test(
  'assistant active page has no previous mock pharmacy facts',
  () => {
    assert.doesNotMatch(
      page,
      /getMockContent|THINKING_DELAYS/
    );

    assert.doesNotMatch(
      page,
      /Amna Rana|Zainab Ali/
    );

    assert.doesNotMatch(
      page,
      /Panadol['"],\s*stock:\s*120/
    );

    assert.doesNotMatch(
      page,
      /Amoxicillin['"],\s*stock:\s*15/
    );
  }
);

test(
  'assistant exposes evidence provenance and timestamp',
  () => {
    assert.match(
      service,
      /evidence/
    );

    assert.match(
      service,
      /data_as_of/
    );

    assert.match(
      page,
      /Read-only grounded data/
    );
  }
);

test(
  'assistant frontend enforces backend message bound',
  () => {
    assert.match(
      page,
      /maxLength=\{500\}/
    );

    assert.match(
      service,
      /cleanMessage\.length > 500/
    );
  }
);