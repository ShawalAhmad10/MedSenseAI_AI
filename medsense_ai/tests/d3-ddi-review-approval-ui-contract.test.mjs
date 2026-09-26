import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const checkout = read(
  'src/pages/storefront/CheckoutPage.jsx'
);

const cart = read(
  'src/pages/storefront/CartPage.jsx'
);

const service = read(
  'src/services/consultationService.js'
);

const pharmacist = read(
  'src/pages/dashboard/Consultations.jsx'
);

const customer = read(
  'src/pages/storefront/PharmacistConsultPage.jsx'
);

test(
  'review-required checkout reaches authoritative order endpoint',
  () => {
    assert.match(
      checkout,
      /DDI_REVIEW_PENDING/
    );

    assert.match(
      checkout,
      /ddi_consultation_id/
    );

    assert.doesNotMatch(
      checkout,
      /if \(ddiLoading \|\| !ddiCheckoutAllowed\)/
    );

    assert.match(
      checkout,
      /disabled=\{isSubmitting \|\| ddiLoading\}/
    );

    assert.match(
      cart,
      /Continue to Pharmacist Review/
    );
  }
);

test(
  'pharmacist UI uses explicit approve or reject decision endpoint',
  () => {
    assert.match(
      service,
      /\/consultations\/\$\{consultationId\}\/decision/
    );

    assert.match(
      pharmacist,
      /decideConsultation/
    );

    assert.match(
      pharmacist,
      /Approve Checkout/
    );

    assert.match(
      pharmacist,
      /Reject Checkout/
    );
  }
);

test(
  'customer can retry an approved exact consultation',
  () => {
    assert.match(
      customer,
      /checkout_consumed_at/
    );

    assert.match(
      customer,
      /Continue Approved Checkout/
    );

    assert.match(
      customer,
      /ddi_consultation_id=/
    );

    assert.match(
      customer,
      /exact reviewed medicine set/
    );
  }
);


test(
  'rejected cart lifecycle creates a fresh cart after clearing',
  () => {
    const cartContext = read(
      'src/context/CartContext.jsx'
    );

    const checkoutPage = read(
      'src/pages/storefront/CheckoutPage.jsx'
    );

    const consultService = read(
      'src/services/storefrontConsultationService.js'
    );

    const escalationModal = read(
      'src/components/storefront/EscalateToPharmacistModal.jsx'
    );

    assert.match(
      cartContext,
      /resetFunnelCartId/
    );

    assert.match(
      consultService,
      /cart_instance_id/
    );

    // Consultation safety must use the dedicated cart lifecycle,
    // never observational funnel telemetry identity.
    assert.doesNotMatch(
      consultService,
      /getFunnelCartId/
    );

    // Clearing invalidates the rejected safety lifecycle.
    assert.match(
      cartContext,
      /clearStoredCartInstanceId/
    );

    // A later add to the empty cart starts a fresh safety lifecycle.
    assert.match(
      cartContext,
      /startFreshCartInstanceId/
    );

    assert.match(
      checkoutPage,
      /CONSULT_CART_REJECTED/
    );

    assert.match(
      checkoutPage,
      /clearCart\(\)/
    );

    assert.match(
      escalationModal,
      /CONSULT_CART_REJECTED/
    );
  }
);
