import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';


function walk(directory) {
  const results = [];

  for (
    const entry
    of fs.readdirSync(
      directory,
      {
        withFileTypes: true
      }
    )
  ) {
    const full =
      path.join(
        directory,
        entry.name
      );

    if (entry.isDirectory()) {
      results.push(...walk(full));
      continue;
    }

    if (
      /\.(?:js|jsx|ts|tsx)$/
        .test(entry.name)
    ) {
      results.push(full);
    }
  }

  return results;
}


test(
  'browser source has no Node localhost:5005 binding',
  () => {
    const offenders = [];

    for (
      const file
      of walk('src')
    ) {
      const source =
        fs.readFileSync(
          file,
          'utf8'
        );

      if (
        source.includes(
          'http://localhost:5005'
        ) ||
        source.includes(
          'http://127.0.0.1:5005'
        )
      ) {
        offenders.push(file);
      }
    }

    assert.deepEqual(
      offenders,
      []
    );
  }
);


test(
  'canonical API client uses same-origin /api',
  () => {
    const source =
      fs.readFileSync(
        'src/services/api.js',
        'utf8'
      );

    assert.match(
      source,
      /baseURL:\s*['"]\/api['"]/
    );
  }
);


test(
  'dashboard product APIs remain on correct same-origin routes',
  () => {
    const product =
      fs.readFileSync(
        'src/services/productService.js',
        'utf8'
      );

    const brand =
      fs.readFileSync(
        'src/services/brandService.js',
        'utf8'
      );

    const supplier =
      fs.readFileSync(
        'src/services/supplierService.js',
        'utf8'
      );

    assert.match(
      product,
      /['"]\/api\/products['"]/
    );

    assert.match(
      brand,
      /['"]\/api\/brand['"]/
    );

    assert.match(
      supplier,
      /['"]\/api\/suppliers['"]/
    );
  }
);


test(
  'configurable services default to same-origin /api',
  () => {
    for (
      const file
      of [
        'src/services/alertService.js',
        'src/services/invoiceService.js',
        'src/services/pharmacistStockService.js',
        'src/services/reportService.js',
        'src/services/storefrontConsultationService.js'
      ]
    ) {
      const source =
        fs.readFileSync(
          file,
          'utf8'
        );

      assert.match(
        source,
        /VITE_API_URL/
      );

      assert.match(
        source,
        /\|\|\s*['"]\/api['"]/
      );
    }
  }
);


test(
  'refund API remains on invoice return routes',
  () => {
    const source =
      fs.readFileSync(
        'src/pages/storefront/RefundPage.jsx',
        'utf8'
      );

    assert.match(
      source,
      /const API = ['"]\/api['"]/
    );

    assert.match(
      source,
      /invoice\/customer-returns/
    );

    assert.match(
      source,
      /invoice\/customer-return/
    );
  }
);