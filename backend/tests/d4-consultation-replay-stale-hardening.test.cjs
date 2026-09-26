const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

const service =
  read(
    'src/services/pharmacistConsultationService.js'
  );

const order =
  read(
    'src/controllers/orderController.js'
  );

function functionWindow(
  source,
  startMarker,
  endMarker
) {
  const start =
    source.indexOf(
      startMarker
    );

  assert.ok(
    start >= 0,
    'start marker not found: ' +
      startMarker
  );

  const end =
    endMarker
      ? source.indexOf(
          endMarker,
          start +
            startMarker.length
        )
      : source.length;

  assert.ok(
    end > start,
    'end marker not found: ' +
      endMarker
  );

  return source.slice(
    start,
    end
  );
}

const consume =
  functionWindow(
    service,
    'async function consumeApprovedCheckout',
    'module.exports ='
  );

const create =
  functionWindow(
    service,
    'async function createConsultation',
    'async function listCustomerConsultations'
  );

const createOrder =
  functionWindow(
    order,
    'exports.createOrder =',
    null
  );


test(
  'cart approval requires a validated lifecycle before database lookup',
  () => {
    const normalize =
      consume.indexOf(
        'normalizeCartInstanceId'
      );

    const select =
      consume.indexOf(
        'SELECT *'
      );

    assert.ok(
      normalize >= 0
    );

    assert.ok(
      select > normalize
    );

    assert.equal(
      service.includes(
        'CONSULT_CART_INSTANCE_REQUIRED'
      ),
      true
    );

    assert.equal(
      service.includes(
        'cart-safe-'
      ),
      true
    );

    assert.equal(
      service.includes(
        'buy-now-'
      ),
      true
    );
  }
);


test(
  'approval lookup is bound to consultation customer and cart source',
  () => {
    assert.equal(
      consume.includes(
        'consultation_id ='
      ),
      true
    );

    assert.equal(
      consume.includes(
        'customer_id ='
      ),
      true
    );

    assert.equal(
      consume.includes(
        "source ="
      ),
      true
    );

    assert.equal(
      consume.includes(
        "'cart'"
      ),
      true
    );

    assert.equal(
      consume.includes(
        'FOR UPDATE'
      ),
      true
    );

    assert.equal(
      consume.includes(
        'CONSULT_APPROVAL_NOT_FOUND'
      ),
      true
    );
  }
);


test(
  'pending rejected and non-approved consultations cannot unlock checkout',
  () => {
    assert.equal(
      consume.includes(
        'CONSULT_APPROVAL_PENDING'
      ),
      true
    );

    assert.equal(
      consume.includes(
        'CONSULT_APPROVAL_REJECTED'
      ),
      true
    );

    assert.equal(
      consume.includes(
        'CONSULT_APPROVAL_NOT_GRANTED'
      ),
      true
    );

    const pending =
      consume.indexOf(
        'CONSULT_APPROVAL_PENDING'
      );

    const rejected =
      consume.indexOf(
        'CONSULT_APPROVAL_REJECTED'
      );

    const consumeUpdate =
      consume.indexOf(
        'checkout_consumed_at ='
      );

    assert.ok(
      pending >= 0 &&
      pending < consumeUpdate
    );

    assert.ok(
      rejected >= 0 &&
      rejected < consumeUpdate
    );
  }
);


test(
  'already consumed approval cannot be replayed',
  () => {
    const earlyConsumedCheck =
      consume.indexOf(
        '.checkout_consumed_at'
      );

    const alreadyUsed =
      consume.indexOf(
        'CONSULT_APPROVAL_ALREADY_USED'
      );

    const update =
      consume.indexOf(
        'UPDATE pharmacist_consultations'
      );

    assert.ok(
      earlyConsumedCheck >= 0
    );

    assert.ok(
      alreadyUsed >
        earlyConsumedCheck
    );

    assert.ok(
      update > alreadyUsed
    );

    assert.equal(
      consume.includes(
        'AND checkout_consumed_at'
      ),
      true
    );

    assert.equal(
      consume.includes(
        'IS NULL'
      ),
      true
    );
  }
);


test(
  'historical null or wrong lifecycle approval is stale',
  () => {
    const staleCheck =
      consume.indexOf(
        '!consultation.cart_instance_id'
      );

    const equality =
      consume.indexOf(
        'cartInstanceId !=='
      );

    const staleCode =
      consume.indexOf(
        'CONSULT_APPROVAL_STALE',
        staleCheck
      );

    assert.ok(
      staleCheck >= 0
    );

    assert.ok(
      equality > staleCheck
    );

    assert.ok(
      staleCode > equality
    );

    const fingerprint =
      consume.indexOf(
        'fingerprintPayload'
      );

    assert.ok(
      fingerprint > staleCode
    );
  }
);


test(
  'CART and BUY_NOW approvals cannot cross lifecycle boundaries',
  () => {
    assert.equal(
      service.includes(
        'cart-safe-'
      ),
      true
    );

    assert.equal(
      service.includes(
        'buy-now-'
      ),
      true
    );

    assert.equal(
      consume.includes(
        'cartInstanceId !=='
      ),
      true
    );

    assert.equal(
      consume.includes(
        'consultation.cart_instance_id'
      ),
      true
    );
  }
);


test(
  'stale cart or changed DDI fingerprint cannot reuse approval',
  () => {
    const authoritativeProducts =
      consume.indexOf(
        'loadAuthoritativeProducts'
      );

    const ddi =
      consume.indexOf(
        'runAuthoritativeDdi'
      );

    const snapshot =
      consume.indexOf(
        'buildSnapshot'
      );

    const fingerprint =
      consume.indexOf(
        'fingerprintPayload'
      );

    const comparison =
      consume.indexOf(
        'consultation.review_fingerprint'
      );

    const stale =
      consume.indexOf(
        'CONSULT_APPROVAL_STALE',
        comparison
      );

    assert.ok(
      authoritativeProducts >= 0
    );

    assert.ok(
      ddi > authoritativeProducts
    );

    assert.ok(
      snapshot > ddi
    );

    assert.ok(
      fingerprint > snapshot
    );

    assert.ok(
      comparison > fingerprint
    );

    assert.ok(
      stale > comparison
    );
  }
);


test(
  'approval consumption is atomic against replay races',
  () => {
    const lock =
      consume.indexOf(
        'FOR UPDATE'
      );

    const update =
      consume.indexOf(
        'UPDATE pharmacist_consultations'
      );

    const nullGuard =
      consume.indexOf(
        'IS NULL',
        update
      );

    const returning =
      consume.indexOf(
        'RETURNING *',
        update
      );

    const finalAlreadyUsed =
      consume.lastIndexOf(
        'CONSULT_APPROVAL_ALREADY_USED'
      );

    assert.ok(
      lock >= 0
    );

    assert.ok(
      update > lock
    );

    assert.ok(
      nullGuard > update
    );

    assert.ok(
      returning > nullGuard
    );

    assert.ok(
      finalAlreadyUsed >
        returning
    );
  }
);


test(
  'checkout supplies current safety lifecycle and rolls back invalid approval',
  () => {
    const consumeCall =
      createOrder.indexOf(
        '.consumeApprovedCheckout({'
      );

    assert.ok(
      consumeCall >= 0
    );

    const approvalWindow =
      createOrder.slice(
        consumeCall,
        consumeCall + 1600
      );

    assert.equal(
      approvalWindow.includes(
        'req.body?.cart_instance_id'
      ),
      true
    );

    assert.equal(
      approvalWindow.includes(
        'requestedItems:'
      ),
      true
    );

    assert.equal(
      approvalWindow.includes(
        'await transaction.rollback();'
      ),
      true
    );

    assert.equal(
      approvalWindow.includes(
        'DDI_APPROVAL_INVALID'
      ),
      true
    );
  }
);


test(
  'new cart consultations bind pending duplicate identity to fingerprint and lifecycle',
  () => {
    assert.equal(
      create.includes(
        'normalizeCartInstanceId'
      ),
      true
    );

    assert.equal(
      create.includes(
        'review_fingerprint'
      ),
      true
    );

    assert.equal(
      create.includes(
        'cart_instance_id'
      ),
      true
    );

    assert.equal(
      create.includes(
        'status ='
      ),
      true
    );

    assert.equal(
      create.includes(
        "'pending'"
      ),
      true
    );
  }
);
