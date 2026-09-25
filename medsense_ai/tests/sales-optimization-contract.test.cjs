const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

test(
  'active Sales Optimization page uses the four real sales APIs',
  () => {
    const source = read(
      'src/pages/dashboard/SalesOptimization.jsx'
    );

    assert.match(source, /\/sales\/overview/);
    assert.match(source, /\/sales\/products/);
    assert.match(source, /\/sales\/slow-movers/);
    assert.match(source, /\/sales\/recommendations/);
  }
);

test(
  'overview uses governed Recorded Sales contract',
  () => {
    const source = read(
      'src/pages/dashboard/SalesOptimization.jsx'
    );

    assert.match(
      source,
      /overview\?\.recordedSales/
    );

    assert.match(
      source,
      /overview\?\.averageInvoiceValue/
    );

    assert.match(
      source,
      /Recorded Sales/
    );

    assert.doesNotMatch(
      source,
      /overview\?\.revenue/
    );

    assert.doesNotMatch(
      source,
      /overview\?\.avgOrderValue/
    );
  }
);

test(
  'product UI uses authoritative medicine fields and Product Recorded Sales',
  () => {
    const source = read(
      'src/pages/dashboard/SalesOptimization.jsx'
    );

    assert.match(
      source,
      /medicineName/
    );

    assert.match(
      source,
      /p\.recordedSales/
    );

    assert.match(
      source,
      /Product Recorded Sales/
    );

    assert.doesNotMatch(
      source,
      /p\.totalRevenue/
    );

    assert.doesNotMatch(
      source,
      /p\.productName/
    );

    assert.doesNotMatch(
      source,
      /s\.productName/
    );
  }
);

test(
  'top medicine chart represents observed units sold',
  () => {
    const source = read(
      'src/pages/dashboard/SalesOptimization.jsx'
    );

    assert.match(
      source,
      /Top Medicines by Units Sold/
    );

    assert.match(
      source,
      /dataKey="totalQty"/
    );

    assert.match(
      source,
      /Units Sold/
    );
  }
);

test(
  'never-sold products do not receive invented days-since-sale',
  () => {
    const source = read(
      'src/pages/dashboard/SalesOptimization.jsx'
    );

    assert.match(
      source,
      /s\.neverSold\s*\?\s*'Never sold'/
    );
  }
);

test(
  'sales API failure is explicit instead of silently becoming zero data',
  () => {
    const source = read(
      'src/pages/dashboard/SalesOptimization.jsx'
    );

    assert.match(
      source,
      /loadError/
    );

    assert.match(
      source,
      /Sales Optimization data could not be loaded/
    );

    assert.doesNotMatch(
      source,
      /\.catch\(\(\)\s*=>\s*\[\]\)/
    );

    assert.doesNotMatch(
      source,
      /\.catch\(\(\)\s*=>\s*null\)/
    );
  }
);

test(
  'active page does not use legacy mock Sales Optimization sources',
  () => {
    const source = read(
      'src/pages/dashboard/SalesOptimization.jsx'
    );

    assert.doesNotMatch(
      source,
      /salesData/
    );

    assert.doesNotMatch(
      source,
      /AIRecommendationsPanel/
    );

    assert.doesNotMatch(
      source,
      /Math\.random/
    );

    assert.doesNotMatch(
      source,
      /forecast|projected uplift/i
    );
  }
);

test(
  'active page contains no fake commercial action confirmation',
  () => {
    const source = read(
      'src/pages/dashboard/SalesOptimization.jsx'
    );

    assert.doesNotMatch(
      source,
      /discount applied|promotion created|reorder initiated/i
    );
  }
);

test(
  'response extraction is syntactically explicit and array shaped',
  () => {
    const source = read(
      'src/pages/dashboard/SalesOptimization.jsx'
    );

    assert.match(
      source,
      /setOverview\(ov\.data\?\.data \|\| null\)/
    );

    assert.match(
      source,
      /setProducts\(Array\.isArray\(pr\.data\?\.data\) \? pr\.data\.data : \[\]\)/
    );

    assert.match(
      source,
      /setSlowMovers\(Array\.isArray\(sm\.data\?\.data\) \? sm\.data\.data : \[\]\)/
    );

    assert.match(
      source,
      /setRecs\(Array\.isArray\(rc\.data\?\.data\) \? rc\.data\.data : \[\]\)/
    );
  }
); // response extraction is syntactically explicit

test(
  'governed KPI value fallbacks remain valid',
  () => {
    const source = read(
      'src/pages/dashboard/SalesOptimization.jsx'
    );

    assert.match(
      source,
      /overview\?\.recordedSales\?\.value \|\| 0/
    );

    assert.match(
      source,
      /overview\?\.orders\?\.value \|\| 0/
    );

    assert.match(
      source,
      /overview\?\.averageInvoiceValue\?\.value \|\| 0/
    );

    assert.doesNotMatch(
      source,
      /overview\?\.[A-Za-z]+\?\.value \? 0/
    );
  }
); // governed KPI value fallbacks remain valid

test(
  'recommendation priority fallback remains syntactically valid',
  () => {
    const source = read(
      'src/pages/dashboard/SalesOptimization.jsx'
    );

    assert.match(
      source,
      /priorityColor\[r\.priority\] \|\| '#94a3b8'/
    );

    assert.doesNotMatch(
      source,
      /priorityColor\[r\.priority\] \? '#94a3b8'/
    );
  }
); // recommendation priority fallback remains syntactically valid
