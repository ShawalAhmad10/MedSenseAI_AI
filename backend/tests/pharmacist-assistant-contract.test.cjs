const fs =
  require('node:fs');

const path =
  require('node:path');

const test =
  require('node:test');

const assert =
  require('node:assert/strict');

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

test(
  'local provider uses bounded offline intent contract',
  () => {
    const source =
      read(
        'src/services/assistantIntentProvider.js'
      );

    assert.match(
      source,
      /local-bounded-intent-v1/
    );

    assert.match(
      source,
      /DDI_REDIRECT/
    );

    assert.match(
      source,
      /MEDICINE_INFO/
    );

    assert.match(
      source,
      /UNSUPPORTED/
    );

    assert.doesNotMatch(
      source,
      /GEMINI_|generativelanguage|fetchImpl|generateContent/i
    );
  }
);

test(
  'local provider has no pharmacy facts, database access, or network transport',
  () => {
    const source =
      read(
        'src/services/assistantIntentProvider.js'
      );

    assert.doesNotMatch(
      source,
      /Panadol|Amoxicillin|ORS|everything looks optimal|pharmacyResponses|defaultResponses/i
    );

    assert.doesNotMatch(
      source,
      /sequelize|postgres|product_current_stock|stock_history|invoice_report/i
    );

    assert.doesNotMatch(
      source,
      /https?:\/\/|fetch\s*\(|axios|GEMINI_API_KEY/i
    );
  }
);

test(
  'local classifier is deterministic bounded and safety-first',
  async () => {
    const provider =
      require(
        '../src/services/assistantIntentProvider'
      );

    assert.deepEqual(
      await provider.classifyIntent(
        'show low stock'
      ),
      {
        intent:
          'LOW_STOCK',

        days:
          7,

        limit:
          10,
      }
    );

    assert.deepEqual(
      await provider.classifyIntent(
        'Show sales summary for the last 30 days'
      ),
      {
        intent:
          'SALES_SUMMARY',

        days:
          30,

        limit:
          10,
      }
    );

    assert.deepEqual(
      await provider.classifyIntent(
        'Top 5 medicines this month'
      ),
      {
        intent:
          'TOP_MEDICINES',

        days:
          30,

        limit:
          5,
      }
    );

    assert.equal(
      (
        await provider.classifyIntent(
          'Tell me about Brufen'
        )
      ).intent,
      'MEDICINE_INFO'
    );

    assert.equal(
      (
        await provider.classifyIntent(
          'Can I take Brufen and Aspirin together?'
        )
      ).intent,
      'DDI_REDIRECT'
    );

    assert.equal(
      (
        await provider.classifyIntent(
          'What dose of Brufen should I take?'
        )
      ).intent,
      'UNSUPPORTED'
    );
  }
);
test(
  'pharmacist assistant requires active approved pharmacist',
  () => {
    const source =
      read(
        'src/services/pharmacistAssistantService.js'
      );

    assert.match(
      source,
      /LOWER\([\s\S]*role[\s\S]*\)\s*=[\s\S]*'pharmacist'/
    );

    assert.match(
      source,
      /is_active[\s\S]*TRUE/
    );

    assert.match(
      source,
      /is_approved[\s\S]*TRUE/
    );
  }
);

test(
  'assistant grounding is SELECT-only and cannot mutate pharmacy authority',
  () => {
    const source =
      read(
        'src/services/pharmacistAssistantService.js'
      );

    assert.doesNotMatch(
      source,
      /\bINSERT\s+INTO\b|\bUPDATE\s+(?:product|stock_history|invoice|invoice_report|customer|customer_refill_reminders)\b|\bDELETE\s+FROM\b|\bDROP\s+TABLE\b|\bTRUNCATE\b|\bALTER\s+TABLE\b/i
    );
  }
);

test(
  'sales grounding preserves frozen analytics lifecycle semantics',
  () => {
    const source =
      read(
        'src/services/pharmacistAssistantService.js'
      );

    assert.match(
      source,
      /status = 1/
    );

    assert.match(
      source,
      /NOT IN \('cancelled', 'refunded'\)/
    );

    assert.doesNotMatch(
      source,
      /NOT IN \('cancelled', 'refunded', 'returned'\)/
    );

    assert.match(
      source,
      /Recorded Sales are invoice totals, not cash collected/
    );
  }
);

test(
  'top medicines are grounded in active invoice line units and recorded sales',
  () => {
    const source =
      read(
        'src/services/pharmacistAssistantService.js'
      );

    assert.match(
      source,
      /FROM invoice_report ir/
    );

    assert.match(
      source,
      /SUM\([\s\S]*ir\.quantity/
    );

    assert.match(
      source,
      /SUM\([\s\S]*ir\.total_price/
    );

    assert.match(
      source,
      /ORDER BY[\s\S]*units DESC/
    );
  }
);

test(
  'inventory low-stock semantics match configured threshold rule',
  () => {
    const source =
      read(
        'src/services/pharmacistAssistantService.js'
      );

    assert.match(
      source,
      /product_min_threshold/
    );

    assert.match(
      source,
      /row\.stock_quantity > 0[\s\S]*row\.stock_quantity <=[\s\S]*row\.minimum_threshold/
    );

    assert.match(
      source,
      /row\.stock_quantity === 0/
    );
  }
);

test(
  'refill assistant reads only active due or overdue governed reminders',
  () => {
    const source =
      read(
        'src/services/pharmacistAssistantService.js'
      );

    assert.match(
      source,
      /FROM customer_refill_reminders r/
    );

    assert.match(
      source,
      /r\.lifecycle_status[\s\S]*'active'/
    );

    assert.match(
      source,
      /r\.reminder_date <=[\s\S]*CURRENT_DATE/
    );

    assert.match(
      source,
      /customer-selected refill reminder/
    );
  }
);

test(
  'patient identifiers are rejected before provider classification',
  () => {
    const service =
      require(
        '../src/services/pharmacistAssistantService'
      );

    assert.throws(
      () =>
        service
          .rejectSensitiveProviderInput(
            'show patient #22 refill'
          ),
      /identifiers are not supported/
    );

    assert.throws(
      () =>
        service
          .rejectSensitiveProviderInput(
            'customer email abc@example.com'
          ),
      /identifiers are not supported/
    );
  }
);

test(
  'DDI questions are redirected to governed safety workflow',
  () => {
    const service =
      require(
        '../src/services/pharmacistAssistantService'
      );

    const reply =
      service.buildReply(
        {
          intent:
            'DDI_REDIRECT',

          days:
            7,

          limit:
            10,
        },
        {
          summary:
            {},

          rows:
            [],
        }
      );

    assert.match(
      reply,
      /does not independently assess medicine-combination safety/
    );

    assert.match(
      reply,
      /governed cart drug-interaction check/
    );

    assert.doesNotMatch(
      reply,
      /safe to take|no interaction|clinically safe/i
    );
  }
);

test(
  'unsupported questions fail to factual scope rather than fake answer',
  () => {
    const service =
      require(
        '../src/services/pharmacistAssistantService'
      );

    const reply =
      service.buildReply(
        {
          intent:
            'UNSUPPORTED',

          days:
            7,

          limit:
            10,
        },
        {
          summary:
            {},

          rows:
            [],
        }
      );

    assert.match(
      reply,
      /grounded pharmacy-operations questions/
    );

    assert.match(
      reply,
      /do not diagnose/
    );
  }
);

test(
  'assistant response exposes evidence source and data timestamp',
  () => {
    const source =
      read(
        'src/services/pharmacistAssistantService.js'
      );

    assert.match(
      source,
      /evidence:[\s\S]*source:/
    );

    assert.match(
      source,
      /data_as_of/
    );

    assert.match(
      source,
      /limitations/
    );
  }
);

test(
  'local provider receives question for classification but never imports database',
  () => {
    const provider =
      read(
        'src/services/assistantIntentProvider.js'
      );

    assert.doesNotMatch(
      provider,
      /sequelize|config\/database|stock_history|invoice_report|customer_refill_reminders/
    );
  }
);

test(
  'assistant route requires pharmacist JWT and server exposes /api/assistant',
  () => {
    const route =
      read(
        'src/routes/assistantRoutes.js'
      );

    const server =
      read(
        'src/server.js'
      );

    assert.match(
      route,
      /authenticateToken/
    );

    assert.match(
      route,
      /router\.post\([\s\S]*'\/ask'/
    );

    assert.match(
      server,
      /app\.use\('\/api\/assistant', assistantRoutes\)/
    );
  }
);
