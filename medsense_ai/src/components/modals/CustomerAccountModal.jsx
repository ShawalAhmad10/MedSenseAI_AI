import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Wallet, X } from 'lucide-react';

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

export default function CustomerAccountModal({ isOpen, customers, invoices, selectedBranch, onClose, onSubmit }) {
  const [form, setForm] = useState({ customerId: '', accountType: 'opening balance', paymentType: 'cash', amountPaid: '', description: '', date: '2026-08-09', invoiceNumber: '' });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm({ customerId: customers[0]?.id ?? '', accountType: 'opening balance', paymentType: 'cash', amountPaid: '', description: '', date: '2026-08-09', invoiceNumber: '' });
    setError('');
    setIsSaving(false);
  }, [customers, isOpen]);

  const customerInvoices = invoices.filter((invoice) => invoice.customerId === form.customerId);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const customer = customers.find((entry) => entry.id === form.customerId);
    if (!customer || !selectedBranch?.id || Number(form.amountPaid) <= 0) {
      setError('Customer, branch, and amount are required.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      await onSubmit({
        ...form,
        amountPaid: Number(form.amountPaid),
        customerName: customer.name,
        branchId: selectedBranch.id,
        branchName: selectedBranch.branchName,
      });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save payment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }} />
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 20 }} style={{ position: 'relative', width: 'min(680px, 100%)', background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)' }}>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Wallet size={20} /></div>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy)' }}>Record Customer Payment</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--gray-400)' }}>Opening balance and invoice payment entries for customer accounts.</p>
                  </div>
                </div>
                <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer' }}><X size={20} /></button>
              </div>

              <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div><label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Customer</label><select value={form.customerId} onChange={(e) => setForm((c) => ({ ...c, customerId: e.target.value, invoiceNumber: '' }))} style={fieldStyle}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div>
                  <div><label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Account Type</label><select value={form.accountType} onChange={(e) => setForm((c) => ({ ...c, accountType: e.target.value }))} style={fieldStyle}><option value="opening balance">Opening Balance</option><option value="invoice payment">Invoice Payment</option></select></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div><label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Payment Type</label><select value={form.paymentType} onChange={(e) => setForm((c) => ({ ...c, paymentType: e.target.value }))} style={fieldStyle}><option value="cash">Cash</option><option value="cheque">Cheque</option></select></div>
                  <div><label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Amount Paid</label><input type="number" min="0" value={form.amountPaid} onChange={(e) => setForm((c) => ({ ...c, amountPaid: e.target.value }))} style={fieldStyle} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div><label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Date</label><input type="date" value={form.date} onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))} style={fieldStyle} /></div>
                  <div><label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Linked Invoice</label><select value={form.invoiceNumber} onChange={(e) => setForm((c) => ({ ...c, invoiceNumber: e.target.value }))} style={fieldStyle}><option value="">None</option>{customerInvoices.map((invoice) => <option key={invoice.id} value={invoice.invoiceNumber}>{invoice.invoiceNumber}</option>)}</select></div>
                </div>
                <div><label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Description</label><textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} /></div>
                {error && <div style={{ borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', padding: '0.85rem 1rem', fontSize: '0.82rem' }}>{error}</div>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem 1.5rem', borderTop: '1px solid var(--dash-border)' }}>
                <button type="button" onClick={onClose} style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
                <button type="submit" disabled={isSaving} style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: 'none', background: 'var(--navy)', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: isSaving ? 0.7 : 1 }}>{isSaving ? 'Saving...' : 'Save Payment'}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
