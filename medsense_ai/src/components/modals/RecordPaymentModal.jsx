import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DollarSign, X } from 'lucide-react';

const fieldStyle = {
  width: '100%',
  padding: '0.72rem 0.9rem',
  borderRadius: 10,
  border: '1px solid var(--dash-border)',
  background: 'white',
  fontSize: '0.84rem',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function RecordPaymentModal({ isOpen, onClose, onSubmit, customer }) {
  const [formData, setFormData] = useState({
    amount: '',
    paymentMethod: 'cash',
    referenceNumber: '',
    description: '',
    performedBy: 'System'
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        amount: '',
        paymentMethod: 'cash',
        referenceNumber: '',
        description: '',
        performedBy: 'System'
      });
      setError('');
      setFieldErrors({});
      setIsSaving(false);
    }
  }, [isOpen]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
    setFieldErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateAmount = (amount) => {
    if (!amount || amount.trim() === '') return 'Payment amount is required';
    const num = Number(amount);
    if (isNaN(num)) return 'Payment amount must be a valid number';
    if (num <= 0) return 'Payment amount must be greater than 0';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate amount
    const amountError = validateAmount(formData.amount);
    if (amountError) {
      setFieldErrors({ amount: amountError });
      setError('Please fix the error above');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to record payment');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            style={{
              position: 'relative',
              width: 'min(540px, 100%)',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'white',
              borderRadius: 'var(--dash-radius)',
              border: '1px solid var(--dash-border)',
              boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
            }}
          >
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy)' }}>Record Payment</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                      {customer ? `COD payment from ${customer.name}` : 'Record COD payment'}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '1.5rem', display: 'grid', gap: '1.25rem' }}>
                {customer && (
                  <div style={{ padding: '1rem', background: 'var(--dash-bg)', borderRadius: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '0.9rem' }}>{customer.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{customer.phone || customer.email || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>Total Orders</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#2563eb' }}>
                          {customer.totalOrders || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                    Payment Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => handleChange('amount', e.target.value)}
                    onBlur={(e) => {
                      const error = validateAmount(e.target.value);
                      if (error) setFieldErrors(prev => ({ ...prev, amount: error }));
                    }}
                    placeholder="Enter payment amount"
                    style={{
                      ...fieldStyle,
                      border: fieldErrors.amount ? '1px solid #dc2626' : '1px solid var(--dash-border)',
                      background: fieldErrors.amount ? 'rgba(239,68,68,0.05)' : 'white'
                    }}
                    required
                  />
                  {fieldErrors.amount && (
                    <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem', display: 'block' }}>
                      {fieldErrors.amount}
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                    Payment Method *
                  </label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => handleChange('paymentMethod', e.target.value)}
                    style={fieldStyle}
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                    Reference Number
                  </label>
                  <input
                    value={formData.referenceNumber}
                    onChange={(e) => handleChange('referenceNumber', e.target.value)}
                    placeholder="Transaction ID, Cheque No., etc."
                    style={fieldStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-400)', marginBottom: '0.35rem' }}>
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Optional notes about this payment"
                    rows={2}
                    style={{ ...fieldStyle, resize: 'vertical' }}
                  />
                </div>

                {error && (
                  <div style={{ borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                    {error}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem 1.5rem', borderTop: '1px solid var(--dash-border)' }}>
                <button type="button" onClick={onClose} style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', cursor: 'pointer', fontWeight: 700 }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: 'none', background: '#10b981', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: isSaving ? 0.7 : 1 }}>
                  {isSaving ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
