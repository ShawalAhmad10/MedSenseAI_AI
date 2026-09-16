import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Briefcase, Lock, Mail, Phone, Send, Shield, UserPlus, X } from 'lucide-react';

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

export default function InviteTeamModal({ isOpen, onClose, member = null, onSubmit }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    type: 'pharmacist', // Always pharmacist by default
    status: 'active',
  });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      name: member?.name ?? '',
      email: member?.email ?? '',
      phone: member?.phone ?? '',
      type: member?.type ?? 'pharmacist',
      status: member?.status ?? 'active',
    });
    setError('');
    setIsSaving(false);
  }, [isOpen, member]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        type: 'pharmacist', // Force pharmacist role
      });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save team member.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(13, 17, 23, 0.4)', backdropFilter: 'blur(4px)' }} />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} style={{ position: 'relative', width: '100%', maxWidth: 620, background: 'white', borderRadius: 'var(--dash-radius)', boxShadow: '0 24px 48px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <form onSubmit={handleSubmit}>
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--dash-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserPlus size={18} color="var(--navy)" />
                  </div>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>{member ? 'Edit Team Member' : 'Add Team Member'}</h3>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.76rem', color: 'var(--gray-400)' }}>Manage team members for MedsenseAI Pharm.</p>
                  </div>
                </div>
                <button onClick={onClose} type="button" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)' }}><X size={20} /></button>
              </div>

              <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>Full Name</label>
                  <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="John Doe" style={fieldStyle} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>Email Address</label>
                    <div style={{ position: 'relative' }}>
                      <Mail size={16} color="var(--gray-400)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                      <input value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} placeholder="john@pharmacy.com" style={{ ...fieldStyle, paddingLeft: '2.5rem' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>Phone Number</label>
                    <div style={{ position: 'relative' }}>
                      <Phone size={16} color="var(--gray-400)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                      <input value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} placeholder="+92 300 0000000" style={{ ...fieldStyle, paddingLeft: '2.5rem' }} />
                    </div>
                  </div>
                </div>

                {/* Hidden field - always pharmacist */}
                <input type="hidden" value="pharmacist" />

                <div style={{ padding: '1rem', borderRadius: 12, border: '2px solid var(--blue)', background: 'var(--blue-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Shield size={16} color="var(--blue)" />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--blue)' }}>Pharmacist Role</p>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: 'var(--gray-500)', lineHeight: 1.3 }}>All team members are pharmacists</p>
                    </div>
                  </div>
                </div>

                {error && <div style={{ borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', padding: '0.85rem 1rem', fontSize: '0.82rem' }}>{error}</div>}
              </div>

              <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--dash-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button onClick={onClose} type="button" style={{ padding: '0.6rem 1.25rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--gray-600)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={isSaving} type="submit" style={{ padding: '0.6rem 1.5rem', borderRadius: 100, border: 'none', background: 'var(--navy)', color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: isSaving ? 0.6 : 1 }}>
                  <Send size={16} />
                  {isSaving ? 'Saving...' : member ? 'Save Member' : 'Create Member'}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
