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


const recommendation =
  read(
    'src/services/medicineRecommendationService.js'
  );

const interaction =
  read(
    'src/services/interactionAwareRecommendationService.js'
  );

const refill =
  read(
    'src/services/customerRefillService.js'
  );

const refillRoutes =
  read(
    'src/routes/customerRefillRoutes.js'
  );


test(
  'normal catalogue recommendations count only active stock batches',
  () => {
    assert.match(
      recommendation,
      /LEFT JOIN stock_history sh[\s\S]*?ON sh\.product_id[\s\S]*?p\.product_id[\s\S]*?AND sh\.status = 1/
    );
  }
);


test(
  'interaction-aware recommendations count only active stock batches',
  () => {
    assert.match(
      interaction,
      /LEFT JOIN stock_history sh[\s\S]*?ON sh\.product_id[\s\S]*?p\.product_id[\s\S]*?AND sh\.status = 1/
    );
  }
);


test(
  'normal recommendations still exclude expired and zero-quantity stock',
  () => {
    assert.match(
      recommendation,
      /sh\.expiry_date >=[\s\S]*?CURRENT_DATE/
    );

    assert.match(
      recommendation,
      /sh\.remaining_quantity > 0/
    );
  }
);


test(
  'interaction-aware recommendations still exclude expired and zero-quantity stock',
  () => {
    assert.match(
      interaction,
      /sh\.expiry_date >= CURRENT_DATE/
    );

    assert.match(
      interaction,
      /sh\.remaining_quantity > 0/
    );
  }
);


test(
  'refill reschedule conditionally updates active owned reminder and returns changed row',
  () => {
    const start =
      refill.indexOf(
        'async function updateReminderDate'
      );

    const end =
      refill.indexOf(
        'async function setLifecycle'
      );

    const scope =
      refill.slice(
        start,
        end
      );

    assert.match(
      scope,
      /AND customer_id =/
    );

    assert.match(
      scope,
      /AND lifecycle_status =\s*'active'/
    );

    assert.match(
      scope,
      /RETURNING reminder_id/
    );

    assert.match(
      scope,
      /updatedRows\.length !== 1/
    );

    assert.match(
      scope,
      /REFILL_NOT_ACTIVE/
    );
  }
);


test(
  'complete and cancel share atomic active-only lifecycle transition',
  () => {
    const start =
      refill.indexOf(
        'async function setLifecycle'
      );

    const end =
      refill.indexOf(
        'async function completeReminder'
      );

    const scope =
      refill.slice(
        start,
        end
      );

    assert.match(
      scope,
      /AND customer_id =/
    );

    assert.match(
      scope,
      /AND lifecycle_status =\s*'active'/
    );

    assert.match(
      scope,
      /RETURNING reminder_id/
    );

    assert.match(
      scope,
      /updatedRows\.length !== 1/
    );

    assert.match(
      scope,
      /REFILL_NOT_ACTIVE/
    );
  }
);


test(
  'all refill mutation routes remain customer authenticated',
  () => {
    for (
      const route
      of [
        /router\.post\([\s\S]*?'\/'[\s\S]*?verifyCustomerToken[\s\S]*?controller\.createReminder/,
        /router\.patch\([\s\S]*?'\/:reminderId'[\s\S]*?verifyCustomerToken[\s\S]*?controller\.updateReminder/,
        /router\.post\([\s\S]*?'\/:reminderId\/complete'[\s\S]*?verifyCustomerToken[\s\S]*?controller\.completeReminder/,
        /router\.delete\([\s\S]*?'\/:reminderId'[\s\S]*?verifyCustomerToken[\s\S]*?controller\.cancelReminder/
      ]
    ) {
      assert.match(
        refillRoutes,
        route
      );
    }
  }
);


test(
  'refill service still binds mutations to customer ownership',
  () => {
    assert.match(
      refill,
      /WHERE reminder_id =[\s\S]*?:reminder_id[\s\S]*?AND customer_id =[\s\S]*?:customer_id/
    );
  }
);


test(
  'refill reorder remains advisory and does not mutate cart or checkout',
  () => {
    assert.doesNotMatch(
      refill,
      /addToCart|createOrder|ddi-check|checkout/
    );
  }
);
