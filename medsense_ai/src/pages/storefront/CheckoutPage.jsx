// Checkout with real-time data and customer information
import React, { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CheckoutStepper from '../../components/storefront/CheckoutStepper';
import InteractionWarningModal from '../../components/storefront/InteractionWarningModal';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { createOrder } from '../../services/storefrontOrderService';
import { getCustomerDetails } from '../../services/customerService';

const steps = ['address', 'prescription', 'payment', 'review'];

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { isAuthenticated, openAuthModal, user } = useAuth();
  const {
    clearCart,
    items,
    prescriptionItems,
    subtotal,
    ddiResult,
    ddiLoading,
    ddiError,
    ddiWarnings,
    ddiCheckoutAllowed,
  } = useCart();
  const [stepIndex, setStepIndex] = useState(0);
  const [showWarnings, setShowWarnings] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
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
              <h1>Checkout</h1>
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
              {prescriptionItems.length === 0 && (
                <div style={{ marginBottom: '0.9rem' }}>
                  <span className="sf-badge-success">Checked - no interactions found</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                <Link className="sf-button-secondary" style={{ textDecoration: 'none' }} to="/prescription/upload">
                  Upload or review prescription
                </Link>
                <button className="sf-button-ghost" onClick={() => setShowWarnings(true)} type="button">
                  Run interaction review
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
                  if (ddiLoading || !ddiCheckoutAllowed) {
                    setShowWarnings(true);
                    setError(
                      ddiError ||
                      ddiResult?.message ||
                      'Drug interaction review must clear before placing the order.',
                    );
                    return;
                  }

                  setIsSubmitting(true);
                  setError(null);
                  
                  try {
                    // Prepare order data - Cash on Delivery only
                    const orderData = {
                      customer_id: user.id,
                      customer_name: form.fullName,
                      customer_phone: form.phone,
                      customer_email: user.email || '',
                      customer_address: `${form.address}, ${form.city}`,
                      payment_method: 'cash',
                      notes: form.notes || null,
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
                      clearCart();
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
                    setError(err.response?.data?.message || err.message || 'Failed to place order. Please try again.');
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting || ddiLoading || !ddiCheckoutAllowed}
                type="button"
              >
                {ddiLoading
                  ? 'Checking Interactions...'
                  : isSubmitting
                    ? 'Placing Order...'
                    : 'Place Order'}
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
                style={{ marginBottom: ddiCheckoutAllowed ? 0 : '0.7rem' }}
              >
                {ddiLoading
                  ? 'Checking medicines against the governed DDI service...'
                  : ddiCheckoutAllowed
                    ? 'DDI review completed - no governed warning found.'
                    : ddiError ||
                      ddiResult?.message ||
                      'Interaction review is required before checkout.'}
              </p>

              {!ddiLoading && !ddiCheckoutAllowed && (
                <button
                  className="sf-button-secondary"
                  onClick={() => setShowWarnings(true)}
                  type="button"
                >
                  Review interaction warning
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
