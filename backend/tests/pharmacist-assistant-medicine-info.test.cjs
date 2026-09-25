const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const fs =
  require('fs');

const path =
  require('path');

const {
  selectMedicineRows,
} =
  require(
    '../src/services/assistantMedicineInfoService'
  );

const {
  buildReply,
} =
  require(
    '../src/services/pharmacistAssistantService'
  );

const sampleRows = [
  {
    product_id: 27,
    product_title:
      'Brufen 400mg Tablets',
    product_generic_name:
      'Ibuprofen',
    product_salt:
      'Ibuprofen',
    product_category:
      'Pain relief',
    product_requires_rx:
      false,
    stock_quantity:
      260,
  },
  {
    product_id: 31,
    product_title:
      'Citanew',
    product_generic_name:
      'Tablet',
    product_salt:
      null,
    product_category:
      null,
    product_requires_rx:
      false,
    stock_quantity:
      354,
  },
  {
    product_id: 35,
    product_title:
      'Citanew 20mg',
    product_generic_name:
      'Escitalopram',
    product_salt:
      'Escitalopram',
    product_category:
      null,
    product_requires_rx:
      true,
    stock_quantity:
      10,
  },
];

test(
  'medicine matcher resolves named catalogue brand',
  () => {
    const result =
      selectMedicineRows(
        sampleRows,
        'Tell me about Brufen'
      );

    assert.equal(
      result.status,
      'FOUND'
    );

    assert.equal(
      result.rows[0]
        .product_id,
      27
    );
  }
);

test(
  'specific medicine title outranks shorter related title',
  () => {
    const result =
      selectMedicineRows(
        sampleRows,
        'Tell me about Citanew 20mg'
      );

    assert.equal(
      result.status,
      'FOUND'
    );

    assert.equal(
      result.rows[0]
        .product_id,
      35
    );
  }
);

test(
  'unknown medicine fails closed',
  () => {
    const result =
      selectMedicineRows(
        sampleRows,
        'Tell me about CompletelyUnknownDrugXYZ'
      );

    assert.equal(
      result.status,
      'NOT_FOUND'
    );

    assert.deepEqual(
      result.rows,
      []
    );
  }
);

test(
  'medicine reply stays factual and non-clinical',
  () => {
    const reply =
      buildReply(
        {
          intent:
            'MEDICINE_INFO',
          days:
            7,
        },
        {
          summary: {
            status:
              'FOUND',
          },

          rows: [
            sampleRows[0],
          ],
        }
      );

    assert.match(
      reply,
      /Brufen 400mg Tablets/
    );

    assert.match(
      reply,
      /Ibuprofen/
    );

    assert.match(
      reply,
      /260 unit/
    );

    assert.match(
      reply,
      /not dosing.*diagnosis.*clinical substitution.*DDI clearance/i
    );

    assert.doesNotMatch(
      reply,
      /\bsafe\b|\bequivalent\b|\brecommended dose\b/i
    );
  }
);

test(
  'provider includes medicine info and preserves DDI precedence',
  async () => {
    const provider =
      require(
        '../src/services/assistantIntentProvider'
      );

    const medicine =
      await provider.classifyIntent(
        'Tell me about Brufen'
      );

    const ddi =
      await provider.classifyIntent(
        'Can I take Brufen and Aspirin together?'
      );

    const dose =
      await provider.classifyIntent(
        'What dose of Brufen should I take?'
      );

    assert.equal(
      medicine.intent,
      'MEDICINE_INFO'
    );

    assert.equal(
      ddi.intent,
      'DDI_REDIRECT'
    );

    assert.equal(
      dose.intent,
      'UNSUPPORTED'
    );
  }
);

test(
  'medicine information source is read-only',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          '../src/services/assistantMedicineInfoService.js'
        ),
        'utf8'
      );

    assert.match(
      source,
      /\bSELECT\b/
    );

    assert.doesNotMatch(
      source,
      /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bALTER\b/i
    );
  }
);