import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root =
  path.resolve(
    process.cwd()
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
  'cart sends current cart items into pharmacist escalation modal',
  () => {
    const source =
      read(
        'src/pages/storefront/CartPage.jsx'
      );

    assert.match(
      source,
      /EscalateToPharmacistModal/
    );

    assert.match(
      source,
      /items=\{items\}/
    );

    assert.match(
      source,
      /items\.length > 0\s*&&\s*!ddiLoading\s*&&\s*!ddiCheckoutAllowed\s*&&\s*!cartConsultation/
    );
  }
);

test(
  'active escalation modal uses real API and contains no fake timer',
  () => {
    const source =
      read(
        'src/components/storefront/EscalateToPharmacistModal.jsx'
      );

    assert.match(
      source,
      /createCartConsultation/
    );

    assert.match(
      source,
      /Request Pharmacist Guidance/
    );

    assert.doesNotMatch(
      source,
      /setTimeout/
    );

    assert.doesNotMatch(
      source,
      /Mock handoff|within 15 minutes|We can later connect/i
    );
  }
);

test(
  'customer consultation creation sends product identity only for authoritative backend verification',
  () => {
    const source =
      read(
        'src/services/storefrontConsultationService.js'
      );

    assert.match(
      source,
      /\/consultations\/customer/
    );

    assert.match(
      source,
      /product_id/
    );

    assert.match(
      source,
      /quantity/
    );

    assert.doesNotMatch(
      source,
      /ddi_status\s*:/
    );

    assert.doesNotMatch(
      source,
      /interaction_details\s*:/
    );

    assert.doesNotMatch(
      source,
      /cart_snapshot\s*:/
    );
  }
);

test(
  'customer consult status page reads real account consultations',
  () => {
    const source =
      read(
        'src/pages/storefront/PharmacistConsultPage.jsx'
      );

    assert.match(
      source,
      /listCustomerConsultations/
    );

    assert.match(
      source,
      /pharmacist_guidance/
    );

    assert.doesNotMatch(
      source,
      /storefrontData/
    );

    assert.doesNotMatch(
      source,
      /pharmacistConsultStatus/
    );
  }
);

test(
  'active pharmacist consultations page contains no mock patient queue',
  () => {
    const source =
      read(
        'src/pages/dashboard/Consultations.jsx'
      );

    assert.match(
      source,
      /consultationService/
    );

    assert.match(
      source,
      /\.getQueue/
    );

    assert.match(
      source,
      /\.decideConsultation/
    );

    assert.match(
      source,
      /Approve Checkout/
    );

    assert.match(
      source,
      /Reject Checkout/
    );

    assert.doesNotMatch(
      source,
      /consultationData/
    );

    assert.doesNotMatch(
      source,
      /Usman Ghani/
    );

    assert.doesNotMatch(
      source,
      /initialQueue/
    );
  }
);

test(
  'pharmacist service uses implemented EUC-08 backend endpoints',
  () => {
    const source =
      read(
        'src/services/consultationService.js'
      );

    assert.match(
      source,
      /\/consultations\/queue/
    );

    assert.match(
      source,
      /\/consultations\/\$\{consultationId\}/
    );

    assert.match(
      source,
      /\/guidance/
    );

    assert.doesNotMatch(
      source,
      /\/messages/
    );

    assert.doesNotMatch(
      source,
      /\/resolve/
    );
  }
);

test(
  'consultation approval remains server-governed and exact-cart bound',
  () => {
    const customer =
      read(
        'src/pages/storefront/PharmacistConsultPage.jsx'
      );

    const pharmacist =
      read(
        'src/pages/dashboard/Consultations.jsx'
      );

    const modal =
      read(
        'src/components/storefront/EscalateToPharmacistModal.jsx'
      );

    const combined =
      `${customer}\n${pharmacist}\n${modal}`;

    assert.match(
      pharmacist,
      /Approve Checkout/
    );

    assert.match(
      pharmacist,
      /Reject Checkout/
    );

    assert.match(
      combined,
      /exact reviewed medicine set|exact reviewed cart|server re-runs|server will revalidate/i
    );

    assert.doesNotMatch(
      combined,
      /override ddi|ddi override|checkout_allowed\s*=\s*true|force checkout/i
    );
  }
);
