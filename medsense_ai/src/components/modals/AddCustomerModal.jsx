import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserPlus, X } from 'lucide-react';

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

export default function AddCustomerModal({ isOpen, onClose, onSubmit, editData = null }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    address: '',
    notes: ''
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        name: '',
        email: '',
        phone: '',
        city: '',
        address: '',
        notes: ''
      });
      setError('');
      setFieldErrors({});
      setIsSaving(false);
    } else if (editData) {
      setFormData({
        name: editData.name || '',
        email: editData.email || '',
        phone: editData.phone || '',
        city: editData.city || '',
        address: editData.address || '',
        notes: editData.notes || ''
      });
    }
  }, [isOpen, editData]);

  // Validation functions
  const validateName = (name) => {
    if (!name || name.trim() === '') return 'Customer name is required';
    if (name.trim().length < 3) return 'Name must be at least 3 characters';
    return '';
  };

  const validateEmail = (email) => {
    if (!email || email.trim() === '') return ''; // Email is optional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    return '';
  };

  const validatePhone = (phone) => {
    if (!phone || phone.trim() === '') return ''; // Phone is optional
    const cleaned = phone.replace(/[\s-]/g, '');
    if (!/^03\d{9}$/.test(cleaned)) {
      return 'Phone must be 11 digits starting with 03 (e.g., 03001234567)';
    }
    return '';
  };

  const validateNumber = (value, fieldName, min = 0) => {
    const num = Number(value);
    if (isNaN(num)) return `${fieldName} must be a valid number`;
    if (num < min) return `${fieldName} must be at least ${min}`;
    return '';
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
    // Clear field error when user types
    setFieldErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleBlur = (field) => {
    let error = '';
    switch (field) {
      case 'name':
        error = validateName(formData.name);
        break;
      case 'email':
        error = validateEmail(formData.email);
        break;
      case 'phone':
        error = validatePhone(formData.phone);
        break;
      default:
        break;
    }
    if (error) {
      setFieldErrors(prev => ({ ...prev, [field]: error }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate all fields
    const errors = {
      name: validateName(formData.name),
      email: validateEmail(formData.email),
      phone: validatePhone(formData.phone),
    };

    // Filter out empty errors
    const hasErrors = Object.values(errors).some(error => error !== '');
    
    if (hasErrors) {
      setFieldErrors(errors);
      setError('Please fix the errors above before submitting');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save customer');
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
              width: 'min(720px, 100%)',
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
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserPlus size={20} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy)' }}>
                      {editData ? 'Edit Customer' : 'Add New Customer'}
                    </h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                      {editData ? 'Update customer information' : 'Create customer account for COD orders'}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '1.5rem', display: 'grid', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                      Customer Name *
                    </label>
                    <input
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      onBlur={() => handleBlur('name')}
                      placeholder="Enter customer name"
                      style={{
                        ...fieldStyle,
                        border: fieldErrors.name ? '1px solid #dc2626' : '1px solid var(--dash-border)',
                        background: fieldErrors.name ? 'rgba(239,68,68,0.05)' : 'white'
                      }}
                      required
                    />
                    {fieldErrors.name && (
                      <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem', display: 'block' }}>
                        {fieldErrors.name}
                      </span>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      onBlur={() => handleBlur('email')}
                      placeholder="customer@email.com"
                      style={{
                        ...fieldStyle,
                        border: fieldErrors.email ? '1px solid #dc2626' : '1px solid var(--dash-border)',
                        background: fieldErrors.email ? 'rgba(239,68,68,0.05)' : 'white'
                      }}
                    />
                    {fieldErrors.email && (
                      <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem', display: 'block' }}>
                        {fieldErrors.email}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                      Phone / Contact
                    </label>
                    <input
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      onBlur={() => handleBlur('phone')}
                      placeholder="03001234567"
                      maxLength={11}
                      style={{
                        ...fieldStyle,
                        border: fieldErrors.phone ? '1px solid #dc2626' : '1px solid var(--dash-border)',
                        background: fieldErrors.phone ? 'rgba(239,68,68,0.05)' : 'white'
                      }}
                    />
                    {fieldErrors.phone && (
                      <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem', display: 'block' }}>
                        {fieldErrors.phone}
                      </span>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                      City
                    </label>
                    <input
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      placeholder="Lahore"
                      style={fieldStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                    Address
                  </label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    placeholder="Enter full address"
                    rows={2}
                    style={{ ...fieldStyle, resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    placeholder="Additional notes about customer"
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
                <button type="submit" disabled={isSaving} style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: 'none', background: 'var(--navy)', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: isSaving ? 0.7 : 1 }}>
                  {isSaving ? 'Saving...' : editData ? 'Update Customer' : 'Add Customer'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
