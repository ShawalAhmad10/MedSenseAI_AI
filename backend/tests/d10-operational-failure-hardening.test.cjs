const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');


const root =
  path.resolve(
    __dirname,
    '..'
  );


function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      relativePath
    ),
    'utf8'
  );
}


const sales =
  read(
    'src/controllers/salesController.js'
  );

const assistant =
  read(
    'src/services/pharmacistAssistantService.js'
  );

const assistantController =
  read(
    'src/controllers/assistantController.js'
  );


function scopeOf(
  source,
  marker
) {
  const start =
    source.indexOf(marker);

  assert.ok(
    start >= 0,
    marker + ' not found'
  );

  const end =
    source.indexOf(
      '\nasync function ',
      start + marker.length
    );

  assert.ok(
    end > start,
    marker + ' end not found'
  );

  return source.slice(
    start,
    end
  );
}


test(
  'all Sales live-stock CTEs count only saleable batches',
  () => {
    const ctes =
      [
        ...sales.matchAll(
          /WITH live_stock AS \(([\s\S]*?GROUP BY product_id\s*)\)/g
        )
      ];

    assert.equal(
      ctes.length,
      3
    );

    for (const match of ctes) {
      const cte =
        match[1];

      assert.match(
        cte,
        /FROM stock_history/
      );

      assert.match(
        cte,
        /WHERE status = 1/
      );

      assert.match(
        cte,
        /batch_status = 'ACTIVE'/
      );

      assert.match(
        cte,
        /remaining_quantity > 0/
      );

      assert.match(
        cte,
        /expiry_date >= CURRENT_DATE/
      );
    }
  }
);


test(
  'assistant inventory counts only active positive unexpired stock',
  () => {
    const scope =
      scopeOf(
        assistant,
        'async function loadInventoryRows() {'
      );

    assert.match(
      scope,
      /sh\.status = 1/
    );

    assert.match(
      scope,
      /sh\.batch_status = 'ACTIVE'/
    );

    assert.match(
      scope,
      /sh\.remaining_quantity > 0/
    );

    assert.match(
      scope,
      /sh\.expiry_date >= CURRENT_DATE/
    );
  }
);


test(
  'assistant expiry alerts ignore deleted and empty batches',
  () => {
    const scope =
      scopeOf(
        assistant,
        'async function alertsEvidence() {'
      );

    assert.match(
      scope,
      /batch_status =[\s\S]*?'ACTIVE'/
    );

    assert.match(
      scope,
      /status = 1/
    );

    assert.match(
      scope,
      /remaining_quantity > 0/
    );

    assert.match(
      scope,
      /expiry_date <=[\s\S]*?CURRENT_DATE \+ 30/
    );

    assert.match(
      scope,
      /WHEN expiry_date <[\s\S]*?CURRENT_DATE[\s\S]*?THEN 'expired'/
    );
  }
);


test(
  'invalid assistant classifier contract is mapped to service unavailable',
  () => {
    assert.match(
      assistantController,
      /ASSISTANT_CLASSIFIER_INVALID_RESPONSE/
    );

    const start =
      assistantController.indexOf(
        "'ASSISTANT_MODEL_UNAVAILABLE'"
      );

    const end =
      assistantController.indexOf(
        'return 503',
        start
      );

    assert.ok(
      start >= 0
    );

    assert.ok(
      end > start
    );

    const scope =
      assistantController.slice(
        start,
        end
      );

    assert.match(
      scope,
      /ASSISTANT_CLASSIFIER_INVALID_RESPONSE/
    );
  }
);
