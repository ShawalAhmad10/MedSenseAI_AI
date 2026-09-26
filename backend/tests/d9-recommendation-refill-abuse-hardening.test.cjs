const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');


const repo =
  path.resolve(
    __dirname,
    '..',
    '..'
  );


function read(relativePath) {
  return fs.readFileSync(
    path.join(
      repo,
      relativePath
    ),
    'utf8'
  );
}


const recommendation =
  read(
    'backend/src/services/medicineRecommendationService.js'
  );

const interaction =
  read(
    'backend/src/services/interactionAwareRecommendationService.js'
  );

const refill =
  read(
    'backend/src/services/customerRefillService.js'
  );

const refillRoutes =
  read(
    'backend/src/routes/customerRefillRoutes.js'
  );

const refillClient =
  read(
    'medsense_ai/src/services/storefrontRefillService.js'
  );

const refillPage =
  read(
    'medsense_ai/src/pages/storefront/RefillAlertsPage.jsx'
  );


test(
  'catalogue recommendation stock is authoritative active non-expired positive stock only',
  () => {
    assert.match(
      recommendation,
      /WHERE p\.product_status = 1/
    );

    assert.match(
      recommendation,
      /LEFT JOIN stock_history sh[\s\S]*?AND sh\.status = 1/
    );

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
  'catalogue alternative must be a different active in-stock product with exact ingredient identity',
  () => {
    const start =
      recommendation.indexOf(
        'function selectAlternatives'
      );

    const end =
      recommendation.indexOf(
        'async function loadActiveProductSnapshot'
      );

    const scope =
      recommendation.slice(
        start,
        end
      );

    assert.match(
      scope,
      /candidate\.product_id/
    );

    assert.match(
      scope,
      /candidate\.product_status/
    );

    assert.match(
      scope,
      /candidate\.available_stock/
    );

    assert.match(
      scope,
      /sameIdentity/
    );
  }
);


test(
  'interaction-aware cart identity is reloaded from authoritative active catalogue rows',
  () => {
    assert.match(
      interaction,
      /p\.product_status = 1/
    );

    assert.match(
      interaction,
      /AND sh\.status = 1/
    );

    assert.match(
      interaction,
      /RECOMMENDATION_CART_PRODUCT_UNAVAILABLE/
    );
  }
);


test(
  'interaction-aware recommendation requires governed mapping and different ingredient',
  () => {
    assert.match(
      interaction,
      /NO_GOVERNED_ALTERNATIVE_MAPPING/
    );

    assert.match(
      interaction,
      /candidateIdentity !==[\s\S]*?sourceIdentity/
    );

    assert.match(
      interaction,
      /NO_ELIGIBLE_GOVERNED_ALTERNATIVE/
    );
  }
);


test(
  'interaction-aware candidate must clear authoritative DDI recheck and still needs pharmacist confirmation',
  () => {
    assert.match(
      interaction,
      /await checkCart/
    );

    assert.match(
      interaction,
      /candidateDdiCleared/
    );

    assert.match(
      interaction,
      /requires_pharmacist_confirmation:[\s\S]*?true/
    );

    assert.match(
      interaction,
      /NO_GOVERNED_ALTERNATIVE_CLEARED_DDI_RECHECK/
    );
  }
);


test(
  'failed candidate DDI recheck is omitted rather than treated as safe',
  () => {
    const start =
      interaction.indexOf(
        'let recheckRaw;'
      );

    const end =
      interaction.indexOf(
        'cleared.push({',
        start
      );

    assert.ok(
      start >= 0,
      'DDI recheck block not found'
    );

    assert.ok(
      end > start,
      'DDI cleared-candidate boundary not found'
    );

    const scope =
      interaction.slice(
        start,
        end
      );

    assert.match(
      scope,
      /catch\s*\{[\s\S]*?continue;?/
    );

    assert.match(
      scope,
      /!candidateDdiCleared\([\s\S]*?\)[\s\S]*?\{[\s\S]*?continue;?/
    );
  }
);


test(
  'every refill endpoint requires customer JWT',
  () => {
    const protectedRoutes = [
      /router\.get\([\s\S]*?'\/sources'[\s\S]*?verifyCustomerToken[\s\S]*?controller\.listSources/,
      /router\.get\([\s\S]*?'\/'[\s\S]*?verifyCustomerToken[\s\S]*?controller\.listReminders/,
      /router\.post\([\s\S]*?'\/'[\s\S]*?verifyCustomerToken[\s\S]*?controller\.createReminder/,
      /router\.patch\([\s\S]*?'\/:reminderId'[\s\S]*?verifyCustomerToken[\s\S]*?controller\.updateReminder/,
      /router\.post\([\s\S]*?'\/:reminderId\/complete'[\s\S]*?verifyCustomerToken[\s\S]*?controller\.completeReminder/,
      /router\.delete\([\s\S]*?'\/:reminderId'[\s\S]*?verifyCustomerToken[\s\S]*?controller\.cancelReminder/
    ];

    for (const route of protectedRoutes) {
      assert.match(
        refillRoutes,
        route
      );
    }
  }
);


test(
  'refill source is bound to authenticated customer real purchase and positive purchased quantity',
  () => {
    const start =
      refill.indexOf(
        'async function loadEligibleSources('
      );

    const end =
      refill.indexOf(
        'async function loadEligibleSource(',
        start + 1
      );

    assert.ok(
      start >= 0,
      'loadEligibleSources not found'
    );

    assert.ok(
      end > start,
      'loadEligibleSource boundary not found'
    );

    const scope =
      refill.slice(
        start,
        end
      );

    assert.match(
      scope,
      /WHERE\s+i\.customer_id\s*=\s*[\s\S]*?:customer_id/
    );

    assert.match(
      scope,
      /delivery_status[\s\S]*?'delivered'[\s\S]*?'returned'/
    );

    assert.match(
      scope,
      /HAVING\s+SUM\([\s\S]*?\)\s*>\s*0/
    );
  }
);


test(
  'concurrent duplicate active refill creation fails closed through database uniqueness',
  () => {
    assert.match(
      refill,
      /23505/
    );

    assert.match(
      refill,
      /REFILL_ACTIVE_REMINDER_EXISTS/
    );

    assert.match(
      refill,
      /customer_refill_one_active_source_idx/
    );
  }
);


test(
  'refill mutation race loser cannot report successful reschedule or lifecycle transition',
  () => {
    const returning =
      refill.match(
        /RETURNING reminder_id/g
      ) || [];

    const checks =
      refill.match(
        /updatedRows\.length !== 1/g
      ) || [];

    assert.ok(
      returning.length >= 2
    );

    assert.equal(
      checks.length,
      2
    );

    assert.match(
      refill,
      /REFILL_NOT_ACTIVE/
    );
  }
);


test(
  'refill mutations remain customer-owned and active-only',
  () => {
    assert.match(
      refill,
      /WHERE reminder_id =[\s\S]*?:reminder_id[\s\S]*?AND customer_id =[\s\S]*?:customer_id[\s\S]*?AND lifecycle_status =[\s\S]*?'active'/
    );
  }
);


test(
  'refill storefront supports session and remembered customer authentication',
  () => {
    assert.match(
      refillClient,
      /sessionStorage\.getItem/
    );

    assert.match(
      refillClient,
      /localStorage\.getItem/
    );

    assert.match(
      refillClient,
      /Authorization:[\s\S]*?Bearer/
    );
  }
);


test(
  'refill reorder opens normal product flow and never directly mutates cart or checkout',
  () => {
    const label =
      refillPage.indexOf(
        'Reorder medicine'
      );

    assert.ok(
      label >= 0,
      'Reorder medicine link not found'
    );

    const linkStart =
      refillPage.lastIndexOf(
        '<Link',
        label
      );

    const linkEnd =
      refillPage.indexOf(
        '</Link>',
        label
      );

    assert.ok(
      linkStart >= 0,
      'Reorder Link start not found'
    );

    assert.ok(
      linkEnd > label,
      'Reorder Link end not found'
    );

    const link =
      refillPage.slice(
        linkStart,
        linkEnd + '</Link>'.length
      );

    assert.match(
      link,
      /to=\{\`\/product\/\$\{productSlug\(/
    );

    assert.doesNotMatch(
      link,
      /onClick/
    );

    assert.doesNotMatch(
      link,
      /addToCart\s*\(/
    );

    assert.doesNotMatch(
      link,
      /createOrder\s*\(/
    );

    assert.doesNotMatch(
      link,
      /axios\.|api\.(?:get|post|put|patch|delete)/
    );
  }
);
