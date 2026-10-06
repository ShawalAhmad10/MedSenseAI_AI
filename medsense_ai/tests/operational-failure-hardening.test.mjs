import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';


const lead =
  fs.readFileSync(
    'src/pages/dashboard/LeadScoring.jsx',
    'utf8'
  );


test(
  'lead API failure clears stale score rows instead of presenting them as current',
  () => {
    const catchStart =
      lead.indexOf(
        '} catch (err) {'
      );

    assert.ok(
      catchStart >= 0
    );

    const finallyStart =
      lead.indexOf(
        '} finally {',
        catchStart
      );

    assert.ok(
      finallyStart > catchStart
    );

    const scope =
      lead.slice(
        catchStart,
        finallyStart
      );

    assert.match(
      scope,
      /setLeads\(\[\]\)/
    );

    assert.match(
      scope,
      /setLastRefresh\(null\)/
    );

    assert.match(
      scope,
      /Lead scoring data is currently unavailable/
    );
  }
);
