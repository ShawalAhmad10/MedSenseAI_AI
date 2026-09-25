// Checkout with real-time data and customer information
import React, { useMemo, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import CheckoutStepper from '../../components/storefront/CheckoutStepper';
import InteractionWarningModal from '../../components/storefront/InteractionWarningModal';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { createOrder } from '../../services/storefrontOrderService';
import { getCustomerDetails } from '../../services/customerService';
import { getFunnelContext, resetFunnelCartId, trackFunnelEventOnce } from '../../services/storefrontFunnelService';
import { checkCartDDI, extractDdiWarnings, getDdiPresentation } from '../../services/storefrontDdiService';
import { clearBuyNowCheckout, getBuyNowCheckoutSession } from '../../services/storefrontCheckoutSession';

const steps = ['address', 'prescription', 'payment', 'review'];

export default function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const checkoutParams =
    new URLSearchParams(location.search);

  const checkoutMode =
    checkoutParams.get('mode') === 'buy-now'
      ? 'BUY_NOW'
      : 'CART';

  const requestedConsultationId =
    Number(
      checkoutParams.get(
        'ddi_consultation_id'
      )
    );

  const approvedConsultationId =
    Number.isSafeInteger(
      requestedConsultationId
    ) &&
    requestedConsultationId > 0
      ? requestedConsultationId
      : null;
  const { isAuthenticated, openAuthModal, user } = useAuth();
  const {
    clearCart,
    cartInstanceId,
    items: cartItems,
    prescriptionItems: cartPrescriptionItems,
    subtotal: cartSubtotal,
    ddiResult: cartDdiResult,
    ddiLoading: cartDdiLoading,
    ddiError: cartDdiError,
    ddiWarnings: cartDdiWarnings,
    ddiCheckoutAllowed: cartDdiCheckoutAllowed,
  } = useCart();

  const buyNowOwnerId =
    isAuthenticated && user?.id
      ? user.id
      : null;

  const buyNowOwnerScope =
    buyNowOwnerId
      ? String(buyNowOwnerId)
      : 'guest';

  const [
    buyNowSession,
    setBuyNowSession,
  ] = useState(() =>
    checkoutMode === 'BUY_NOW'
      ? getBuyNowCheckoutSession(
          buyNowOwnerId
        )
      : null
  );

  const activeBuyNowSession =
    checkoutMode === 'BUY_NOW' &&
    buyNowSession?.ownerScope ===
      buyNowOwnerScope
      ? buyNowSession
      : null;

  const buyNowItems = useMemo(
    () =>
      activeBuyNowSession?.items ||
      [],
    [activeBuyNowSession]
  );

  const [buyNowDdiResult, setBuyNowDdiResult] = useState(null);
  const [buyNowDdiLoading, setBuyNowDdiLoading] = useState(
    checkoutMode === 'BUY_NOW',
  );
  const [buyNowDdiError, setBuyNowDdiError] = useState(null);
  const [buyNowDdiOwnerScope, setBuyNowDdiOwnerScope] = useState(null);

  useEffect(() => {
    if (checkoutMode !== 'BUY_NOW') {
      setBuyNowSession(null);
      return;
    }

    setBuyNowSession(
      getBuyNowCheckoutSession(
        buyNowOwnerId
      )
    );
  }, [
    checkoutMode,
    buyNowOwnerId,
  ]);

  const items = checkoutMode === 'BUY_NOW' ? buyNowItems : cartItems;

  const prescriptionItems = useMemo(
    () => checkoutMode === 'BUY_NOW'
      ? items.filter((item) => item.requiresPrescription)
      : cartPrescriptionItems,
    [checkoutMode, items, cartPrescriptionItems],
  );

  const subtotal = useMemo(
    () => checkoutMode === 'BUY_NOW'
      ? items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      : cartSubtotal,
    [checkoutMode, items, cartSubtotal],
  );

  useEffect(() => {
    if (checkoutMode !== 'BUY_NOW') {
      return undefined;
    }

    if (buyNowItems.length === 0) {
      setBuyNowDdiResult(null);
      setBuyNowDdiError(null);
      setBuyNowDdiOwnerScope(null);
      setBuyNowDdiLoading(false);
      return undefined;
    }

    let cancelled = false;
    const requestOwnerScope = buyNowOwnerScope;
    setBuyNowDdiResult(null);
    setBuyNowDdiError(null);
    setBuyNowDdiOwnerScope(null);
    setBuyNowDdiLoading(true);

    void checkCartDDI(buyNowItems)
      .then((result) => {
        if (!cancelled) {
          setBuyNowDdiResult(result);
          setBuyNowDdiError(null);
          setBuyNowDdiOwnerScope(requestOwnerScope);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          const upstreamResult = requestError.response?.data?.data ?? null;
          const message =
            requestError.response?.data?.message ||
            requestError.message ||
            'Drug interaction review could not be completed.';

          setBuyNowDdiResult(upstreamResult);
          setBuyNowDdiError(message);
          setBuyNowDdiOwnerScope(requestOwnerScope);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBuyNowDdiLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [checkoutMode, buyNowItems, buyNowOwnerScope]);

  const buyNowDdiWarnings = useMemo(
    () => extractDdiWarnings(buyNowDdiResult, buyNowDdiError || ''),
    [buyNowDdiResult, buyNowDdiError],
  );

  const buyNowDdiCheckoutAllowed =
    buyNowItems.length > 0 &&
    buyNowDdiOwnerScope === buyNowOwnerScope &&
    !buyNowDdiLoading &&
    !buyNowDdiError &&
    buyNowDdiResult?.checkout_allowed === true;

  const ddiResult = checkoutMode === 'BUY_NOW' ? buyNowDdiResult : cartDdiResult;
  const ddiLoading = checkoutMode === 'BUY_NOW' ? buyNowDdiLoading : cartDdiLoading;
  const ddiError = checkoutMode === 'BUY_NOW' ? buyNowDdiError : cartDdiError;
  const ddiWarnings = checkoutMode === 'BUY_NOW' ? buyNowDdiWarnings : cartDdiWarnings;
  const ddiCheckoutAllowed =
    checkoutMode === 'BUY_NOW'
      ? buyNowDdiCheckoutAllowed
      : cartDdiCheckoutAllowed;
  const ddiPresentation = getDdiPresentation(ddiResult, ddiError || '');
  const [stepIndex, setStepIndex] = useState(0);
  const [showWarnings, setShowWarnings] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [
    reviewConsultationId,
    setReviewConsultationId,
  ] = useState(null);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    address: '',
    city: '',
    payment: 'cod',
    notes: ''
  });
  
  // Field-specific errors
  const [fieldErrors, setFieldErrors] = useState({
    fullName: '',
    phone: '',
    address: '',
    city: ''
  });
  
  // Validation functions
  const validatePhone = (phone) => {
    if (!phone || phone.trim() === '') {
      return 'Phone number is required';
    }
    // Remove spaces and check
    const cleaned = phone.replace(/\s/g, '');
    if (!/^03\d{9}$/.test(cleaned)) {
      return 'Phone number must be 11 digits starting with 03 (e.g., 03001234567)';
    }
    return '';
  };
  
  const validateField = (name, value) => {
    switch (name) {
      case 'fullName':
        if (!value || value.trim() === '') {
          return 'Full name is required';
        }
        if (value.trim().length < 3) {
          return 'Name must be at least 3 characters';
        }
        return '';
        
      case 'phone':
        return validatePhone(value);
        
      case 'address':
        if (!value || value.trim() === '') {
          return 'Delivery address is required';
        }
        if (value.trim().length < 10) {
          return 'Please enter a complete address';
        }
        return '';
        
      case 'city':
        if (!value || value.trim() === '') {
          return 'City is required';
        }
        return '';
        
      default:
        return '';
    }
  };

  useEffect(() => {
    // Load customer data when authenticated
    if (isAuthenticated && user?.id) {
      loadCustomerData();
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !user?.id ||
      items.length === 0
    ) {
      return;
    }

    void trackFunnelEventOnce(
      'checkout_started',
      items.map((item) => item.id)
    );
  }, [isAuthenticated, user?.id, items]);

  const loadCustomerData = async () => {
    try {
      const data = await getCustomerDetails(user.id);
      setForm(prev => ({
        ...prev,
        fullName: data.customer.name || user.name || '',
        phone: data.customer.phone || user.phone || '',
        address: data.customer.address || '',
        city: data.customer.city || ''
      }));
    } catch (error) {
      console.error('Failed to load customer data:', error);
      // Fallback to user data from auth context
      setForm(prev => ({
        ...prev,
        fullName: user.name || '',
        phone: user.phone || ''
      }));
    }
  };

  const total = useMemo(() => subtotal + (items.length ? 120 : 0), [items.length, subtotal]);

  if (!isAuthenticated) {
    return (
      <div className="storefront-shell">
        <div className="sf-card sf-section-card">
          <h1 style={{ fontFamily: 'var(--font-display)' }}>Checkout requires login</h1>
          <p className="sf-muted">
            Please sign in to continue with your order. Your cart will be saved.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="sf-button" onClick={() => openAuthModal('checkout')} type="button">
              Sign in to continue
            </button>
            <Link className="sf-button-secondary" style={{ textDecoration: 'none' }} to="/cart">
              Back to cart
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="storefront-shell">
        <div className="sf-card sf-section-card">
          <h1 style={{ fontFamily: 'var(--font-display)' }}>Your cart is empty</h1>
          <p className="sf-muted">
            Add items to your cart before proceeding to checkout.
          </p>
          <Link className="sf-button" style={{ textDecoration: 'none' }} to="/">
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  const currentStep = steps[stepIndex];

  return (
    <div className="storefront-shell">
      <div className="sf-grid-2">
        <section className="sf-card sf-section-card">
          <div className="sf-page-header">
            <div>
              <h1>{checkoutMode === 'BUY_NOW' ? 'Buy Now Checkout' : 'Checkout'}</h1>
              <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
                Complete your order in a few simple steps
              </p>
            </div>
          </div>
          <CheckoutStepper activeStep={stepIndex + 1} />

          {currentStep === 'address' && (
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <div className="sf-field">
                <label htmlFor="checkout-name">Full name *</label>
                <input 
                  className={`sf-input ${fieldErrors.fullName ? 'sf-input-error' : ''}`}
                  id="checkout-name" 
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm({ ...form, fullName: value });
                    setFieldErrors({ ...fieldErrors, fullName: validateField('fullName', value) });
                  }}
                  onBlur={(event) => {
                    setFieldErrors({ ...fieldErrors, fullName: validateField('fullName', event.target.value) });
                  }}
                  value={form.fullName}
                  placeholder="Enter your full name"
                  required
                />
                {fieldErrors.fullName && (
                  <span style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {fieldErrors.fullName}
                  </span>
                )}
              </div>
              
              <div className="sf-field">
                <label htmlFor="checkout-phone">Phone *</label>
                <input 
                  className={`sf-input ${fieldErrors.phone ? 'sf-input-error' : ''}`}
                  id="checkout-phone" 
                  type="tel"
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm({ ...form, phone: value });
                    setFieldErrors({ ...fieldErrors, phone: validateField('phone', value) });
                  }}
                  onBlur={(event) => {
                    setFieldErrors({ ...fieldErrors, phone: validateField('phone', event.target.value) });
                  }}
                  value={form.phone}
                  placeholder="03001234567"
                  maxLength={11}
                  required
                />
                {fieldErrors.phone && (
                  <span style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {fieldErrors.phone}
                  </span>
                )}
              </div>
              
              <div className="sf-field">
                <label htmlFor="checkout-city">City *</label>
                <input 
                  className={`sf-input ${fieldErrors.city ? 'sf-input-error' : ''}`}
                  id="checkout-city" 
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm({ ...form, city: value });
                    setFieldErrors({ ...fieldErrors, city: validateField('city', value) });
                  }}
                  onBlur={(event) => {
                    setFieldErrors({ ...fieldErrors, city: validateField('city', event.target.value) });
                  }}
                  value={form.city}
                  placeholder="e.g., Lahore, Karachi, Islamabad"
                  required
                />
                {fieldErrors.city && (
                  <span style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {fieldErrors.city}
                  </span>
                )}
              </div>
              
              <div className="sf-field">
                <label htmlFor="checkout-address">Delivery Address *</label>
                <textarea 
                  className={`sf-textarea ${fieldErrors.address ? 'sf-input-error' : ''}`}
                  id="checkout-address" 
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm({ ...form, address: value });
                    setFieldErrors({ ...fieldErrors, address: validateField('address', value) });
                  }}
                  onBlur={(event) => {
                    setFieldErrors({ ...fieldErrors, address: validateField('address', event.target.value) });
                  }}
                  rows={4} 
                  value={form.address}
                  placeholder="Enter your complete delivery address (House/Flat #, Street, Area)"
                  required
                />
                {fieldErrors.address && (
                  <span style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {fieldErrors.address}
                  </span>
                )}
              </div>
            </div>
          )}

          {currentStep === 'prescription' && (
            <div className="sf-summary-block">
              <strong style={{ display: 'block', marginBottom: '0.6rem' }}>Prescription Verification</strong>
              <p className="sf-muted" style={{ marginTop: 0 }}>
                {prescriptionItems.length
                  ? `${prescriptionItems.length} prescription-required item(s) will be held until verification is complete.`
                  : 'No prescription-required medicines in this order.'}
              </p>

              <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                <Link className="sf-button-secondary" style={{ textDecoration: 'none' }} to="/prescription/upload">
                  Upload or review prescription
                </Link>
                <button className="sf-button-ghost" onClick={() => setShowWarnings(true)} type="button">
                  View interaction review
                </button>
              </div>
            </div>
          )}

          {currentStep === 'payment' && (
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <label className="sf-summary-block" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', cursor: 'pointer' }}>
                <input checked={form.payment === 'cod'} name="payment" onChange={() => setForm({ ...form, payment: 'cod' })} type="radio" />
                <span>
                  <strong style={{ display: 'block' }}>Cash on Delivery</strong>
                  <span className="sf-muted">Pay when you receive your order</span>
                </span>
              </label>
              
              <div style={{ 
                marginTop: '1rem', 
                padding: '1rem', 
                borderRadius: '8px',
                background: '#f0fdf4',
                border: '1px solid #86efac'
              }}>
                <p style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>
                  Pay in cash when your order is delivered to your doorstep. No advance payment required.
                </p>
              </div>
              
              <div className="sf-field" style={{ marginTop: '1rem' }}>
                <label htmlFor="checkout-notes">Order Notes (optional)</label>
                <textarea 
                  className="sf-textarea" 
                  id="checkout-notes" 
                  onChange={(event) => setForm({ ...form, notes: event.target.value })} 
                  rows={3} 
                  value={form.notes}
                  placeholder="Any special instructions for delivery?"
                />
              </div>
            </div>
          )}

          {currentStep === 'review' && (
            <>
              <div className="sf-summary-block">
                <strong style={{ display: 'block', marginBottom: '0.65rem' }}>Review Order Details</strong>
                <p className="sf-muted" style={{ marginBottom: '0.5rem' }}>
                  <strong>Deliver to:</strong> {form.fullName}
                </p>
                <p className="sf-muted" style={{ marginBottom: '0.5rem' }}>
                  <strong>Phone:</strong> {form.phone}
                </p>
                <p className="sf-muted" style={{ marginBottom: '0.5rem' }}>
                  <strong>Address:</strong> {form.address}, {form.city}
                </p>
                <p className="sf-muted" style={{ marginBottom: '0.5rem' }}>
                  <strong>Payment:</strong> Cash on Delivery
                </p>
                
                {form.notes && (
                  <p className="sf-muted" style={{ marginBottom: 0, paddingTop: '0.5rem', borderTop: '1px solid var(--sf-border)' }}>
                    <strong>Notes:</strong> {form.notes}
                  </p>
                )}
                
                <p className="sf-muted" style={{ marginBottom: 0, paddingTop: '0.75rem', borderTop: '1px solid var(--sf-border)' }}>
                  <strong>{items.length} item(s) - Total: PKR {total.toFixed(2)}</strong>
                </p>
              </div>
              {error && (
                <div className="sf-badge-warning" style={{ marginTop: '1rem' }}>
                  {error}
                </div>
              )}

              {reviewConsultationId && (
                <div
                  className="sf-summary-block"
                  style={{
                    marginTop:
                      '1rem',
                  }}
                >
                  <strong>
                    Pharmacist review created
                  </strong>

                  <p
                    className="sf-muted"
                    style={{
                      marginBottom:
                        '0.75rem',
                    }}
                  >
                    Consultation #{reviewConsultationId} is waiting for a pharmacist decision. Your order has not been created and stock has not been deducted.
                  </p>

                  <Link
                    className="sf-button-secondary"
                    style={{
                      textDecoration:
                        'none',
                    }}
                    to="/consult/pharmacist"
                  >
                    Track Pharmacist Decision
                  </Link>
                </div>
              )}

              {approvedConsultationId && (
                <div
                  className="sf-summary-block"
                  style={{
                    marginTop:
                      '1rem',
                  }}
                >
                  <div className="sf-badge-success">
                    Pharmacist approval #{approvedConsultationId}
                  </div>

                  <p
                    className="sf-muted"
                    style={{
                      marginBottom:
                        0,
                      marginTop:
                        '0.65rem',
                    }}
                  >
                    The server will re-check the exact cart, customer and approval before creating the order.
                  </p>
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            {stepIndex > 0 && (
              <button className="sf-button-secondary" onClick={() => setStepIndex((current) => current - 1)} type="button">
                Back
              </button>
            )}
            {stepIndex < steps.length - 1 ? (
              <button 
                className="sf-button" 
                onClick={() => {
                  // Validate required fields before moving forward
                  if (currentStep === 'address') {
                    // Validate all fields
                    const errors = {
                      fullName: validateField('fullName', form.fullName),
                      phone: validateField('phone', form.phone),
                      address: validateField('address', form.address),
                      city: validateField('city', form.city)
                    };
                    
                    setFieldErrors(errors);
                    
                    // Check if any errors exist
                    const hasErrors = Object.values(errors).some(error => error !== '');
                    
                    if (hasErrors) {
                      setError('Please fix the errors above before continuing');
                      // Scroll to first error
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      return;
                    }
                  }
                  
                  // No validation needed for payment step (only COD available)
                  
                  setError(null);
                  setStepIndex((current) => current + 1);
                }} 
                type="button"
              >
                Continue
              </button>
            ) : (
              <button
                className="sf-button"
                onClick={async () => {
                  if (ddiLoading) {
                    setShowWarnings(true);
                    setError(
                      'Please wait for the current interaction check to finish before continuing.',
                    );
                    return;
                  }

                  const checkoutCartInstanceId =
                    checkoutMode === 'BUY_NOW'
                      ? activeBuyNowSession
                          ?.cartInstanceId
                      : cartInstanceId;

                  if (!checkoutCartInstanceId) {
                    setError(
                      'The active checkout lifecycle is no longer valid. Return to the cart or product page and start checkout again.'
                    );
                    return;
                  }

                  setIsSubmitting(true);
                  setError(null);
                  
                  try {
                    // Prepare order data - Cash on Delivery only.
                    // Funnel identifiers are observational metadata.
                    const funnelContext = getFunnelContext();

                    const orderData = {
                      customer_id: user.id,
                      funnel_session_id: funnelContext.session_id,
                      funnel_cart_id: funnelContext.cart_id,
                      cart_instance_id: checkoutCartInstanceId,
                      customer_name: form.fullName,
                      customer_phone: form.phone,
                      customer_email: user.email || '',
                      customer_address: `${form.address}, ${form.city}`,
                      payment_method: 'cash',
                      notes: form.notes || null,
                      ...(approvedConsultationId
                        ? {
                            ddi_consultation_id:
                              approvedConsultationId,
                          }
                        : {}),
                      items: items.map(item => {
                        // Extract UUID from product ID — strip only "prod-" prefix, keep UUID intact
                        const productId = typeof item.id === 'string'
                          ? item.id.replace(/^prod-/, '')
                          : item.id;
                        return {
                          product_id: productId,
                          product_title: item.name,
                          quantity: item.quantity,
                          unit_price: item.price,
                          discount: 0,
                          tax: 0
                        };
                      }),
                      discount: 0,
                      delivery_fee: 120
                    };

                    // Create order via API
                    const response = await createOrder(orderData);
                    
                    if (response.success) {
                      if (checkoutMode === 'CART') {
                        clearCart();
                        resetFunnelCartId();
                      }

                      if (checkoutMode === 'BUY_NOW') {
                        clearBuyNowCheckout();
                      }

                      navigate('/order-confirmation', { 
                        state: { 
                          orderNumber: response.data.orderNumber,
                          total: response.data.total 
                        } 
                      });
                    } else {
                      setError('Failed to place order. Please try again.');
                    }
                  } catch (err) {
                    console.error('Order placement error:', err);

                    const apiPayload =
                      err.response?.data || {};

                    const apiCode =
                      apiPayload.code ||
                      apiPayload.error?.code ||
                      '';

                    if (
                      apiCode ===
                      'DDI_REVIEW_PENDING'
                    ) {
                      const consultation =
                        apiPayload.consultation ||
                        apiPayload.data
                          ?.consultation ||
                        null;

                      const candidateId =
                        Number(
                          apiPayload
                            .ddi_consultation_id ||
                          apiPayload.data
                            ?.ddi_consultation_id ||
                          consultation
                            ?.consultation_id
                        );

                      if (
                        Number.isSafeInteger(
                          candidateId
                        ) &&
                        candidateId > 0
                      ) {
                        setReviewConsultationId(
                          candidateId
                        );
                      }

                      setError(
                        apiPayload.message ||
                        'This medicine set requires pharmacist approval before the order can be completed.'
                      );

                      return;
                    }

                    if (
                      apiCode ===
                        'CONSULT_CART_REJECTED'
                    ) {
                      if (
                        checkoutMode ===
                          'CART'
                      ) {
                        clearCart();
                      }

                      setReviewConsultationId(
                        null
                      );

                      navigate(
                        '/consult/pharmacist'
                      );

                      return;
                    }

                    if (
                      apiCode ===
                        'CONSULT_APPROVAL_STALE' ||
                      apiCode ===
                        'CONSULT_APPROVAL_REJECTED' ||
                      apiCode ===
                        'CONSULT_APPROVAL_NOT_FOUND' ||
                      apiCode ===
                        'CONSULT_APPROVAL_ALREADY_USED'
                    ) {
                      setReviewConsultationId(
                        null
                      );
                    }

                    setError(
                      apiPayload.message ||
                      err.message ||
                      'Failed to place order. Please try again.'
                    );
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting || ddiLoading}
                type="button"
              >
                {ddiLoading
                  ? 'Checking Interactions...'
                  : isSubmitting
                    ? 'Submitting...'
                    : approvedConsultationId
                      ? 'Place Approved Order'
                      : ddiCheckoutAllowed
                        ? 'Place Order'
                        : 'Submit for Pharmacist Review'}
              </button>
            )}
          </div>
        </section>

        <aside className="sf-card sf-section-card" style={{ height: 'fit-content' }}>
          <h2 className="sf-section-heading" style={{ marginBottom: '1rem' }}>Order Summary</h2>
          {items.length > 0 && (
            <div className="sf-summary-block" style={{ marginBottom: '1rem' }}>
              <strong style={{ display: 'block', marginBottom: '0.35rem' }}>
                Drug interaction review
              </strong>

              <p
                className="sf-muted"
                style={{ marginBottom: ddiResult?.status === 'CLEAR_WITH_LIMITATIONS' ? 0 : '0.7rem' }}
              >
                {ddiLoading
                  ? 'Checking medicines against the governed DDI service...'
                  : ddiPresentation.detail}
              </p>

              {!ddiLoading && ddiResult?.status !== 'CLEAR_WITH_LIMITATIONS' && (
                <button
                  className="sf-button-secondary"
                  onClick={() => setShowWarnings(true)}
                  type="button"
                >
                  {ddiPresentation.allowedWarning
                    ? 'View non-blocking DDI warning'
                    : 'Review interaction warning'}
                </button>
              )}
            </div>
          )}
          {items.length === 0 ? (
            <div className="sf-empty">Your cart is empty. Add products before checking out.</div>
          ) : (
            <div style={{ display: 'grid', gap: '0.8rem' }}>
              {items.map((item) => (
                <div className="sf-summary-block" key={item.id}>
                  <strong style={{ display: 'block' }}>{item.name}</strong>
                  <span className="sf-muted" style={{ fontSize: '0.84rem' }}>
                    {item.quantity} x PKR {item.price.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="sf-summary-block" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <span className="sf-muted">Subtotal</span>
              <span>PKR {subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <span className="sf-muted">Delivery</span>
              <span>PKR {items.length ? 120 : 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
              <span>Total</span>
              <span>PKR {total.toFixed(2)}</span>
            </div>
          </div>
        </aside>
      </div>

      <InteractionWarningModal isOpen={showWarnings} onClose={() => setShowWarnings(false)} warnings={ddiWarnings} />
    </div>
  );
}
