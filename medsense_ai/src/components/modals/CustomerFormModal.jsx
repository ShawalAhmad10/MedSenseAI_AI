import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserRound, X } from 'lucide-react';

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

export default function CustomerFormModal({ isOpen, customer, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: '', contact: '', email: '', city: '', status: 'active' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      name: customer?.name ?? '',
      contact: customer?.contact ?? '',
      email: customer?.email ?? '',
      city: customer?.city ?? '',
      status: customer?.status ?? 'active',
    });
    setError('');
    setFieldErrors({});
    setIsSaving(false);
  }, [customer, isOpen]);

  const validateName = (name) => {
    if (!name || !name.trim()) return 'Customer name is required';
    if (name.trim().length < 3) return 'Name must be at least 3 characters';
    return '';
  };

  const validateContact = (contact) => {
    if (!contact || !contact.trim()) return '';
    const cleaned = contact.replace(/[\s-]/g, '');
    if (!/^03\d{9}$/.test(cleaned)) return 'Contact must be 11 digits starting with 03';
    return '';
  };

  const validateEmail = (email) => {
    if (!email || !email.trim()) return '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email';
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = {
      name: validateName(form.name),
      contact: validateContact(form.contact),
      email: validateEmail(form.email),
    };
    const hasErrors = Object.values(errors).some(e => e !== '');
    if (hasErrors) {
      setFieldErrors(errors);
      setError('Please fix errors above');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      await onSubmit({ ...form, name: form.name.trim() });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save customer.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }} />
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 20 }} style={{ position: 'relative', width: 'min(620px, 100%)', background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)' }}>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserRound size={20} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy)' }}>{customer ? 'Edit Customer' : 'Add Customer'}</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--gray-400)' }}>Customer master with contact details and status.</p>
                  </div>
                </div>
                <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer' }}><X size={20} /></button>
              </div>

              <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div><label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Name</label><input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} style={fieldStyle} /></div>
                  <div><label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Contact</label><input value={form.contact} onChange={(e) => setForm((c) => ({ ...c, contact: e.target.value }))} style={fieldStyle} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div><label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Email</label><input value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} style={fieldStyle} /></div>
                  <div><label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>City</label><input value={form.city} onChange={(e) => setForm((c) => ({ ...c, city: e.target.value }))} style={fieldStyle} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                  <div><label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Status</label><select value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))} style={fieldStyle}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
                </div>
                {error && <div style={{ borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', padding: '0.85rem 1rem', fontSize: '0.82rem' }}>{error}</div>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem 1.5rem', borderTop: '1px solid var(--dash-border)' }}>
                <button type="button" onClick={onClose} style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
                <button type="submit" disabled={isSaving} style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: 'none', background: 'var(--navy)', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: isSaving ? 0.7 : 1 }}>{isSaving ? 'Saving...' : 'Save Customer'}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
