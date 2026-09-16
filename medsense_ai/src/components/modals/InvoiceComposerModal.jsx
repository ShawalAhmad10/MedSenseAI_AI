import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calculator, Plus, ReceiptText, Trash2, X } from 'lucide-react';

const baseFieldStyle = {
  width: '100%',
  padding: '0.72rem 0.9rem',
  borderRadius: 10,
  border: '1px solid var(--dash-border)',
  background: 'white',
  fontSize: '0.84rem',
  outline: 'none',
  boxSizing: 'border-box',
};

function emptyLine() {
  return {
    productId: '',
    name: '',
    qty: 1,
    unitPrice: 0,
    discountPercent: 0,
    discount: 0,
    tax: 0,
    taxPercent: 0,
  };
}

export default function InvoiceComposerModal({ isOpen, onClose, catalog, currentUserName, onSubmit }) {
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    createdBy: currentUserName || 'Pharmacist',
    deliveryAddress: '',
    notes: '',
    discount: 0,
    discountPercent: 0,
    deliveryFee: 0,
    deliveryStatus: 'pending',
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      createdBy: currentUserName || 'Pharmacist',
      deliveryAddress: '',
      notes: '',
      discount: 0,
      discountPercent: 0,
      deliveryFee: 0,
      deliveryStatus: 'pending',
    });
    setLines([emptyLine()]);
    setError('');
    setFieldErrors({});
    setIsSaving(false);
  }, [currentUserName, isOpen]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => {
      const qty       = Number(line.qty       || 0);
      const unitPrice = Number(line.unitPrice  || 0);
      const discount  = Number(line.discount   || 0);
      const tax       = Number(line.tax        || 0);
      return sum + Math.max((qty * unitPrice) - discount + tax, 0);
    }, 0);

    const discountPercent  = Number(form.discountPercent || 0);
    const invoiceDiscount  = (subtotal * discountPercent) / 100;
    const deliveryFee      = Number(form.deliveryFee || 0);
    const grandTotal       = subtotal - invoiceDiscount + deliveryFee;

    return { subtotal, invoiceDiscount, grandTotal };
  }, [form.discountPercent, form.deliveryFee, lines]);

  const updateLine = (index, patch) => {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const next = { ...line, ...patch };

        if (patch.productId && catalog?.products) {
          const product = catalog.products.find((e) => e.id === patch.productId);
          if (product) {
            next.name      = product.title;
            next.unitPrice = product.price || 0;

            const availableStock = product.stockQty || 0;
            if (availableStock === 0) {
              setError(`⚠️ "${product.title}" has no stock. Add stock from Inventory first.`);
              return { ...line, productId: '', name: '', unitPrice: 0 };
            } else if (availableStock < 10) {
              setError(`⚠️ Low stock: "${product.title}" has only ${availableStock} units.`);
              setTimeout(() => setError(''), 3000);
            } else {
              setError('');
            }
          }
        }

        const qty             = Number((patch.qty             !== undefined ? patch.qty             : next.qty)             || 0);
        const unitPrice       = Number((patch.unitPrice       !== undefined ? patch.unitPrice       : next.unitPrice)       || 0);
        const discountPercent = Number((patch.discountPercent !== undefined ? patch.discountPercent : next.discountPercent) || 0);
        const taxPercent      = Number((patch.taxPercent      !== undefined ? patch.taxPercent      : next.taxPercent)      || 0);

        if (patch.qty !== undefined || patch.unitPrice !== undefined || patch.discountPercent !== undefined) {
          next.discount = (qty * unitPrice * discountPercent) / 100;
        }
        if (patch.qty !== undefined || patch.unitPrice !== undefined || patch.taxPercent !== undefined) {
          next.tax = (qty * unitPrice * taxPercent) / 100;
        }

        return next;
      }),
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    const errors = {};

    if (!form.customerName || !form.customerName.trim()) {
      errors.customerName = 'Customer name is required';
    } else if (form.customerName.trim().length < 3) {
      errors.customerName = 'Customer name must be at least 3 characters';
    }

    if (form.customerPhone && form.customerPhone.trim()) {
      const cleaned = form.customerPhone.replace(/[\s\-+]/g, '');
      if (!/^92?\d{10}$|^03\d{9}$/.test(cleaned)) {
        errors.customerPhone = 'Phone format invalid (e.g. 03001234567)';
      }
    }

    if (form.customerEmail && form.customerEmail.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail)) {
        errors.customerEmail = 'Please enter a valid email address';
      }
    }

    const validLines = lines.filter((l) => l.productId && Number(l.qty) > 0);
    if (validLines.length === 0) {
      errors.products = 'Please add at least one product';
    }

    let hasLineErrors = false;
    lines.forEach((line, i) => {
      if (line.productId) {
        if (Number(line.qty || 0) <= 0)       { errors[`line_${i}_qty`]   = `Row ${i+1}: Qty must be > 0`; hasLineErrors = true; }
        if (Number(line.unitPrice || 0) <= 0) { errors[`line_${i}_price`] = `Row ${i+1}: Price must be > 0`; hasLineErrors = true; }
      }
    });

    if (form.deliveryFee && Number(form.deliveryFee) < 0) errors.deliveryFee = 'Delivery fee cannot be negative';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError(hasLineErrors ? '⚠️ Please fix product line errors' : '⚠️ Please fix the errors before creating invoice');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      // COD only — payment collected on delivery
      const payload = {
        customerName:    form.customerName.trim(),
        customerPhone:   form.customerPhone?.trim()  || '',
        customerEmail:   form.customerEmail?.trim()  || '',
        branchName:      'Main Branch',
        discount:        totals.invoiceDiscount,
        deliveryFee:     Number(form.deliveryFee || 0),
        paidAmount:      0,              // COD — not paid yet
        paymentMethod:   'cash',         // Always cash on delivery
        deliveryStatus:  form.deliveryStatus || 'pending',
        deliveryAddress: form.deliveryAddress?.trim() || '',
        notes:           form.notes?.trim() || '',
        createdBy:       form.createdBy || 'Pharmacist',
        items: validLines.map((line) => ({
          productId:  line.productId.toString().replace('prod-', ''),
          name:       line.name,
          quantity:   Number(line.qty),
          unitPrice:  Number(line.unitPrice || 0),
          discount:   Number(line.discount  || 0),
          tax:        Number(line.tax       || 0),
        })),
      };

      await onSubmit(payload);
      onClose();
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save invoice right now.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            style={{
              position: 'relative',
              width: 'min(1120px, 100%)',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'white',
              borderRadius: 'var(--dash-radius)',
              border: '1px solid var(--dash-border)',
              boxShadow: '0 24px 48px rgba(15,23,42,0.18)',
            }}
          >
            <form onSubmit={handleSubmit}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ReceiptText size={20} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy)' }}>Create New Invoice</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                      Cash on Delivery — payment collected at delivery
                    </p>
                  </div>
                </div>
                <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '1.5rem', display: 'grid', gap: '1.5rem' }}>

                {/* ── Customer Information ── */}
                <div>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy)' }}>Customer Information</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
                    {/* Name */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Customer Name *</label>
                      <input
                        required
                        value={form.customerName}
                        onChange={(e) => { setForm((c) => ({ ...c, customerName: e.target.value })); setFieldErrors((p) => ({ ...p, customerName: '' })); }}
                        placeholder="Ahmed Khan"
                        style={{ ...baseFieldStyle, border: fieldErrors.customerName ? '1px solid #dc2626' : '1px solid var(--dash-border)', background: fieldErrors.customerName ? 'rgba(239,68,68,0.05)' : 'white' }}
                      />
                      {fieldErrors.customerName && <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem', display: 'block' }}>{fieldErrors.customerName}</span>}
                    </div>
                    {/* Phone */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Phone Number</label>
                      <input
                        value={form.customerPhone}
                        onChange={(e) => { setForm((c) => ({ ...c, customerPhone: e.target.value })); setFieldErrors((p) => ({ ...p, customerPhone: '' })); }}
                        placeholder="03001234567" maxLength={11}
                        style={{ ...baseFieldStyle, border: fieldErrors.customerPhone ? '1px solid #dc2626' : '1px solid var(--dash-border)', background: fieldErrors.customerPhone ? 'rgba(239,68,68,0.05)' : 'white' }}
                      />
                      {fieldErrors.customerPhone && <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem', display: 'block' }}>{fieldErrors.customerPhone}</span>}
                    </div>
                    {/* Email */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Email Address</label>
                      <input
                        type="email"
                        value={form.customerEmail}
                        onChange={(e) => { setForm((c) => ({ ...c, customerEmail: e.target.value })); setFieldErrors((p) => ({ ...p, customerEmail: '' })); }}
                        placeholder="customer@example.com"
                        style={{ ...baseFieldStyle, border: fieldErrors.customerEmail ? '1px solid #dc2626' : '1px solid var(--dash-border)', background: fieldErrors.customerEmail ? 'rgba(239,68,68,0.05)' : 'white' }}
                      />
                      {fieldErrors.customerEmail && <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem', display: 'block' }}>{fieldErrors.customerEmail}</span>}
                    </div>
                  </div>
                </div>

                {/* ── Invoice Details (NO Builty No, Payment fixed as COD) ── */}
                <div>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy)' }}>Invoice Details</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
                    {/* Payment — read-only COD badge */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Payment Method</label>
                      <div style={{ ...baseFieldStyle, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--dash-bg)', color: 'var(--navy)', fontWeight: 600, cursor: 'default' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                        Cash on Delivery
                      </div>
                    </div>
                    {/* Delivery Status */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Delivery Status</label>
                      <select value={form.deliveryStatus} onChange={(e) => setForm((c) => ({ ...c, deliveryStatus: e.target.value }))} style={baseFieldStyle}>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="processing">Processing</option>
                        <option value="ready">Ready</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                      </select>
                    </div>
                    {/* Delivery Address */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Delivery Address</label>
                      <input
                        value={form.deliveryAddress}
                        onChange={(e) => setForm((c) => ({ ...c, deliveryAddress: e.target.value }))}
                        placeholder="Street, City (optional)"
                        style={baseFieldStyle}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Product Line Items ── */}
                <div style={{ border: '1px solid var(--dash-border)', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.95rem 1rem', borderBottom: '1px solid var(--dash-border)', background: 'var(--dash-bg)' }}>
                    <div>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--navy)' }}>Product Line Items</strong>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.76rem', color: 'var(--gray-400)' }}>Add products with quantity, price and optional discount</p>
                    </div>
                    <button type="button" onClick={() => setLines((c) => [...c, emptyLine()])}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'var(--navy)', color: 'white', borderRadius: 999, padding: '0.5rem 0.9rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                      <Plus size={14} /> Add Line
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--dash-border)' }}>
                          {['Product', 'Qty', 'Price', 'Discount %', 'Tax %', 'Total', ''].map((h) => (
                            <th key={h} style={{ padding: '0.8rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-400)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, index) => {
                          const qty       = Number(line.qty       || 0);
                          const unitPrice = Number(line.unitPrice  || 0);
                          const discount  = Number(line.discount   || 0);
                          const tax       = Number(line.tax        || 0);
                          const lineTotal = Math.max((qty * unitPrice) - discount + tax, 0);
                          return (
                            <tr key={`line-${index}`} style={{ borderTop: '1px solid var(--dash-border)' }}>
                              <td style={{ padding: '0.75rem' }}>
                                <select value={line.productId} onChange={(e) => updateLine(index, { productId: e.target.value })} style={{ ...baseFieldStyle, minWidth: 200 }}>
                                  <option value="">Select product</option>
                                  {catalog?.products?.map((p) => {
                                    const hasStock = (p.stockQty || 0) > 0;
                                    return (
                                      <option key={p.id} value={p.id} disabled={!hasStock} style={{ color: !hasStock ? '#dc2626' : 'inherit' }}>
                                        {p.title} {!hasStock ? '(No Stock)' : `(${p.stockQty})`}
                                      </option>
                                    );
                                  })}
                                </select>
                              </td>
                              <td style={{ padding: '0.75rem' }}>
                                <input type="number" min="1" value={line.qty} onChange={(e) => updateLine(index, { qty: e.target.value })} style={{ ...baseFieldStyle, width: 80 }} />
                              </td>
                              <td style={{ padding: '0.75rem' }}>
                                <input type="number" min="0" value={line.unitPrice} onChange={(e) => updateLine(index, { unitPrice: e.target.value })} style={{ ...baseFieldStyle, width: 110 }} />
                              </td>
                              <td style={{ padding: '0.75rem' }}>
                                <input type="number" min="0" max="100" step="0.1" value={line.discountPercent || ''} onChange={(e) => updateLine(index, { discountPercent: e.target.value })} placeholder="%" style={{ ...baseFieldStyle, width: 70 }} />
                              </td>
                              <td style={{ padding: '0.75rem' }}>
                                <input type="number" min="0" max="100" step="0.1" value={line.taxPercent || ''} onChange={(e) => updateLine(index, { taxPercent: e.target.value })} placeholder="%" style={{ ...baseFieldStyle, width: 70 }} />
                              </td>
                              <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--navy)', fontSize: '0.82rem' }}>PKR {lineTotal.toLocaleString()}</td>
                              <td style={{ padding: '0.75rem' }}>
                                <button type="button" onClick={() => setLines((c) => c.filter((_, i) => i !== index))} disabled={lines.length === 1}
                                  style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--dash-border)', background: 'white', color: '#ef4444', cursor: lines.length === 1 ? 'not-allowed' : 'pointer', opacity: lines.length === 1 ? 0.5 : 1 }}>
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Bottom: Notes + Summary ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: '1.5rem', alignItems: 'start' }}>
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Notes</label>
                      <textarea
                        value={form.notes}
                        onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
                        placeholder="Additional notes or instructions (optional)"
                        rows={3}
                        style={{ ...baseFieldStyle, resize: 'vertical' }}
                      />
                    </div>
                    {error && (
                      <div style={{ borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                        {error}
                      </div>
                    )}
                  </div>

                  {/* Invoice Summary */}
                  <div style={{ border: '1px solid var(--dash-border)', borderRadius: 16, padding: '1rem 1.1rem', background: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.8rem', color: 'var(--navy)', fontWeight: 700 }}>
                      <Calculator size={16} />
                      Invoice Summary
                    </div>
                    <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.84rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--gray-600)' }}>
                        <span>Subtotal</span>
                        <span style={{ fontWeight: 600 }}>PKR {totals.subtotal.toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)' }}>Discount %</label>
                        <input
                          type="number" min="0" max="100" step="0.1"
                          value={form.discountPercent || ''}
                          onChange={(e) => setForm((c) => ({ ...c, discountPercent: e.target.value }))}
                          placeholder="%"
                          style={{ ...baseFieldStyle, width: 100, padding: '0.4rem 0.6rem' }}
                        />
                      </div>
                      {totals.invoiceDiscount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--gray-600)' }}>
                          <span>Discount</span>
                          <span style={{ fontWeight: 600, color: '#dc2626' }}>- PKR {totals.invoiceDiscount.toLocaleString()}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)' }}>Delivery Fee</label>
                        <input
                          type="number" min="0"
                          value={form.deliveryFee}
                          onChange={(e) => setForm((c) => ({ ...c, deliveryFee: e.target.value }))}
                          style={{ ...baseFieldStyle, width: 100, padding: '0.4rem 0.6rem' }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.7rem', borderTop: '1px solid var(--dash-border)', color: 'var(--navy)', fontWeight: 800, fontSize: '1.05rem' }}>
                        <span>Grand Total</span>
                        <span>PKR {totals.grandTotal.toLocaleString()}</span>
                      </div>
                      {/* COD notice */}
                      <div style={{ marginTop: '0.25rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.78rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                        Payment collected on delivery (COD)
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem 1.5rem', borderTop: '1px solid var(--dash-border)' }}>
                <button type="button" onClick={onClose}
                  style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', cursor: 'pointer', fontWeight: 700 }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSaving}
                  style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: 'none', background: 'var(--navy)', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: isSaving ? 0.7 : 1 }}>
                  {isSaving ? 'Creating Invoice...' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
