// SRS §3.2.1 / EUC-01: Storefront customer sign-in and registration entry point.
import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Eye, EyeOff, Loader2, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { adoptGuestBuyNowCheckout } from '../../services/storefrontCheckoutSession';

const intentCopy = {
  checkout: 'Sign in to save your order, merge your guest cart, and finish checkout securely.',
  account: 'Sign in to manage prescriptions, addresses, refill alerts, and order history.',
  prescription: 'Sign in before uploading and tracking prescriptions linked to your account.',
};

export default function AuthModal({ isOpen, onClose, intent = 'checkout' }) {
  const { login, register, authError, authLoading } = useAuth();
  const { mergeGuestCartToAccount } = useCart();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', city: '', address: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const validateEmail = (email) => {
    if (!email) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    return '';
  };

  const validatePhone = (phone) => {
    if (!phone || !phone.trim()) return 'Phone number is required';
    const cleaned = phone.replace(/\s/g, '');
    if (!/^03\d{9}$/.test(cleaned)) {
      return 'Phone must be 11 digits starting with 03 (e.g., 03001234567)';
    }
    return '';
  };

  const validateName = (name) => {
    if (!name || name.trim() === '') return 'Full name is required';
    if (name.trim().length < 3) return 'Name must be at least 3 characters';
    return '';
  };

  const validatePassword = (password) => {
    if (!password) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!/[a-z]/.test(password)) return 'Password must contain lowercase letter';
    if (!/[A-Z]/.test(password)) return 'Password must contain uppercase letter';
    if (!/[0-9]/.test(password)) return 'Password must contain a number';
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return 'Password must contain special character';
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError('');
    setFieldErrors({});

    // Validate all fields based on mode
    const errors = {};
    
    if (mode === 'signup') {
      errors.name = validateName(form.name);
      errors.password = validatePassword(form.password);
      errors.phone = validatePhone(form.phone);
      if (!form.city || !form.city.trim()) errors.city = 'City is required';
      if (!form.address || !form.address.trim()) errors.address = 'Address is required';
    }
    
    errors.email = validateEmail(form.email);
    
    if (mode === 'signin' && !form.password) {
      errors.password = 'Password is required';
    }

    // Filter out empty errors
    const hasErrors = Object.values(errors).some(error => error !== '');
    
    if (hasErrors) {
      setFieldErrors(errors);
      setLocalError('Please fix the errors above');
      return;
    }

    try {
      if (mode === 'signin') {
        const response =
          await login({
            email: form.email,
            password: form.password,
          });

        const authenticatedCustomerId =
          response?.data?.customer?.id;

        mergeGuestCartToAccount(
          authenticatedCustomerId
        );

        adoptGuestBuyNowCheckout(
          authenticatedCustomerId
        );
      } else {
        const response =
          await register({
            name: form.name,
            email: form.email,
            password: form.password,
            phone: form.phone || undefined,
            city: form.city || undefined,
            address: form.address || undefined,
          });

        const authenticatedCustomerId =
          response?.data?.customer?.id;

        mergeGuestCartToAccount(
          authenticatedCustomerId
        );

        adoptGuestBuyNowCheckout(
          authenticatedCustomerId
        );
      }
    } catch (error) {
      setLocalError(error.message);
    }
  };

  const displayError = localError || authError;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            className="sf-overlay"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="sf-modal-shell">
            <motion.div
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="sf-card sf-modal-card"
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              style={{ width: 'min(100%, 520px)' }}
            >
              <div className="sf-panel-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <strong style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
                    {mode === 'signin' ? 'Continue to storefront account' : 'Create your storefront account'}
                  </strong>
                  <span className="sf-muted" style={{ fontSize: '0.88rem' }}>
                    {intentCopy[intent] || intentCopy.checkout}
                  </span>
                </div>
                <button className="sf-icon-button" onClick={onClose} type="button">
                  <X size={18} />
                </button>
              </div>
              <div className="sf-panel-body">
                <div className="sf-badge-success" style={{ marginBottom: '1rem' }}>
                  <ShieldCheck size={14} />
                  Secure authentication with database storage
                </div>

                {displayError && (
                  <div style={{ padding: '0.75rem 1rem', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={16} color="#dc2626" />
                    <span style={{ fontSize: '0.85rem', color: '#dc2626' }}>{displayError}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.9rem' }}>
                  {mode === 'signup' && (
                    <>
                      <div className="sf-field">
                        <label htmlFor="storefront-name">Full name *</label>
                        <input
                          className={`sf-input ${fieldErrors.name ? 'sf-input-error' : ''}`}
                          id="storefront-name"
                          onChange={(event) => {
                            setForm((current) => ({ ...current, name: event.target.value }));
                            setFieldErrors(prev => ({ ...prev, name: '' }));
                          }}
                          onBlur={(event) => {
                            const error = validateName(event.target.value);
                            if (error) setFieldErrors(prev => ({ ...prev, name: error }));
                          }}
                          placeholder="Areeba Khan"
                          required
                          value={form.name}
                        />
                        {fieldErrors.name && (
                          <span style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                            {fieldErrors.name}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                  <div className="sf-field">
                    <label htmlFor="storefront-email">Email {mode === 'signup' && '*'}</label>
                    <input
                      className={`sf-input ${fieldErrors.email ? 'sf-input-error' : ''}`}
                      id="storefront-email"
                      onChange={(event) => {
                        setForm((current) => ({ ...current, email: event.target.value }));
                        setFieldErrors(prev => ({ ...prev, email: '' }));
                      }}
                      onBlur={(event) => {
                        const error = validateEmail(event.target.value);
                        if (error) setFieldErrors(prev => ({ ...prev, email: error }));
                      }}
                      placeholder="areeba@example.com"
                      required
                      type="email"
                      value={form.email}
                    />
                    {fieldErrors.email && (
                      <span style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                        {fieldErrors.email}
                      </span>
                    )}
                  </div>
                  <div className="sf-field">
                    <label htmlFor="storefront-password">Password {mode === 'signup' && '*'}</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className={`sf-input ${fieldErrors.password ? 'sf-input-error' : ''}`}
                        id="storefront-password"
                        onChange={(event) => {
                          setForm((current) => ({ ...current, password: event.target.value }));
                          setFieldErrors(prev => ({ ...prev, password: '' }));
                        }}
                        onBlur={(event) => {
                          if (mode === 'signup') {
                            const error = validatePassword(event.target.value);
                            if (error) setFieldErrors(prev => ({ ...prev, password: error }));
                          }
                        }}
                        placeholder={mode === 'signup' ? 'Min 8 chars, uppercase, lowercase, number, special' : 'Enter your password'}
                        required
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                      />
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                        type="button"
                      >
                        {showPassword ? <EyeOff size={18} color="var(--gray-400)" /> : <Eye size={18} color="var(--gray-400)" />}
                      </button>
                    </div>
                    {fieldErrors.password && (
                      <span style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                        {fieldErrors.password}
                      </span>
                    )}
                    {mode === 'signup' && !fieldErrors.password && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '0.25rem', display: 'block' }}>
                        8+ characters with uppercase, lowercase, number, and special character
                      </span>
                    )}
                  </div>
                  {mode === 'signup' && (
                    <>
                      <div className="sf-field">
                        <label htmlFor="storefront-phone">Phone *</label>
                        <input
                          className={`sf-input ${fieldErrors.phone ? 'sf-input-error' : ''}`}
                          id="storefront-phone"
                          onChange={(event) => {
                            setForm((current) => ({ ...current, phone: event.target.value }));
                            setFieldErrors(prev => ({ ...prev, phone: '' }));
                          }}
                          onBlur={(event) => {
                            const error = validatePhone(event.target.value);
                            if (error) setFieldErrors(prev => ({ ...prev, phone: error }));
                          }}
                          placeholder="03001234567"
                          type="tel"
                          maxLength={11}
                          required
                          value={form.phone}
                        />
                        {fieldErrors.phone && (
                          <span style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                            {fieldErrors.phone}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
                        <div className="sf-field">
                          <label htmlFor="storefront-city">City *</label>
                          <input
                            className={`sf-input ${fieldErrors.city ? 'sf-input-error' : ''}`}
                            id="storefront-city"
                            onChange={(event) => {
                              setForm((current) => ({ ...current, city: event.target.value }));
                              setFieldErrors(prev => ({ ...prev, city: '' }));
                            }}
                            placeholder="Karachi"
                            required
                            value={form.city}
                          />
                          {fieldErrors.city && (
                            <span style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                              {fieldErrors.city}
                            </span>
                          )}
                        </div>
                        <div className="sf-field">
                          <label htmlFor="storefront-address">Address *</label>
                          <input
                            className={`sf-input ${fieldErrors.address ? 'sf-input-error' : ''}`}
                            id="storefront-address"
                            onChange={(event) => {
                              setForm((current) => ({ ...current, address: event.target.value }));
                              setFieldErrors(prev => ({ ...prev, address: '' }));
                            }}
                            placeholder="House #, Street, Area"
                            required
                            value={form.address}
                          />
                          {fieldErrors.address && (
                            <span style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                              {fieldErrors.address}
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                  <button className="sf-button" disabled={authLoading} type="submit">
                    {authLoading ? (
                      <>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                      </>
                    ) : (
                      mode === 'signin' ? 'Sign in securely' : 'Create account'
                    )}
                  </button>
                </form>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                  <button className="sf-button-ghost" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setLocalError(''); }} type="button">
                    {mode === 'signin' ? 'New here? Register' : 'Already have an account? Sign in'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
