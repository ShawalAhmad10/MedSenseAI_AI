import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerUpLeft, RotateCcw, X } from 'lucide-react';

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

export default function InvoiceReturnModal({ isOpen, invoices, currentUserName, onClose, onSubmit }) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [invoiceType, setInvoiceType] = useState('normal');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) || null,
    [invoices, selectedInvoiceId],
  );

  useEffect(() => {
    if (!isOpen) return;
    setInvoiceNumber('');
    setSelectedInvoiceId('');
    setInvoiceType('normal');
    setDescription('');
    setError('');
    setIsSaving(false);
    setIsLoadingInvoice(false);
    setLines([]);
  }, [isOpen]);

  // Auto-load invoice data when invoice number is entered
  useEffect(() => {
    if (!invoiceNumber || !invoiceNumber.trim()) {
      setSelectedInvoiceId('');
      setLines([]);
      return;
    }

    const matchedInvoice = invoices.find(
      (inv) => inv.invoiceNumber.toLowerCase() === invoiceNumber.trim().toLowerCase()
    );

    if (matchedInvoice) {
      setSelectedInvoiceId(matchedInvoice.id);
      setError('');
    } else {
      setSelectedInvoiceId('');
      setLines([]);
      setError(`Invoice "${invoiceNumber}" not found.`);
    }
  }, [invoiceNumber, invoices]);

  useEffect(() => {
    if (!selectedInvoice) {
      setLines([]);
      return;
    }
    
    setLines(
      selectedInvoice.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        qty: 0,
        maxQty: item.qty,
        unitPrice: item.unitPrice,
        purchasePrice: item.purchasePrice ?? 0,
      })),
    );
    setError('');
  }, [selectedInvoice]);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.qty || 0) * Number(line.unitPrice || 0)), 0),
    [lines],
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validLines = lines.filter((line) => Number(line.qty) > 0);
    if (!selectedInvoice || validLines.length === 0) {
      setError('Choose an invoice and set at least one return quantity.');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await onSubmit({
        linkedInvoiceId: selectedInvoice.id,
        invoiceNumber: selectedInvoice.invoiceNumber,
        customerName: selectedInvoice.customerName,
        createdBy: currentUserName ?? 'Pharmacist',
        invoiceType,
        description,
        items: validLines,
      });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save invoice return.');
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
              width: 'min(980px, 100%)',
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
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#fff7ed', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CornerUpLeft size={20} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy)' }}>Invoice Return</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                      Separate return workflow for invoice-linked product returns.
                    </p>
                  </div>
                </div>
                <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '1.5rem', display: 'grid', gap: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.5fr) minmax(0, 1fr)', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                      Invoice Number *
                    </label>
                    <input 
                      value={invoiceNumber} 
                      onChange={(event) => setInvoiceNumber(event.target.value)} 
                      placeholder="Type invoice number or select below" 
                      style={fieldStyle}
                      list="invoice-suggestions"
                    />
                    <datalist id="invoice-suggestions">
                      {invoices.map((invoice) => (
                        <option key={invoice.id} value={invoice.invoiceNumber}>
                          {invoice.invoiceNumber} · {invoice.customerName}
                        </option>
                      ))}
                    </datalist>
                    {selectedInvoice && (
                      <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>
                        ✓ Invoice found: {selectedInvoice.customerName}
                      </p>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Or Select Invoice</label>
                    <select 
                      value={selectedInvoiceId} 
                      onChange={(event) => {
                        const invoice = invoices.find(inv => inv.id === event.target.value);
                        if (invoice) {
                          setInvoiceNumber(invoice.invoiceNumber);
                          setSelectedInvoiceId(invoice.id);
                        }
                      }} 
                      style={fieldStyle}
                    >
                      <option value="">-- Select --</option>
                      {invoices.map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber} · {invoice.customerName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Invoice Type</label>
                    <select value={invoiceType} onChange={(event) => setInvoiceType(event.target.value)} style={fieldStyle}>
                      <option value="normal">Normal</option>
                      <option value="open">Open</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Created By</label>
                    <input readOnly value={currentUserName ?? 'Pharmacist'} style={{ ...fieldStyle, background: '#f8fafc' }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Return Description</label>
                  <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Damage, wrong item, customer rejection..." style={fieldStyle} />
                </div>

                <div style={{ border: '1px solid var(--dash-border)', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.95rem 1rem', borderBottom: '1px solid var(--dash-border)', background: 'var(--dash-bg)' }}>
                    <div>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--navy)' }}>Return Line Items</strong>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.76rem', color: 'var(--gray-400)' }}>
                        {selectedInvoice ? 'Select products and enter return quantities below' : 'Enter invoice number above to load products'}
                      </p>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#d97706', fontWeight: 700, fontSize: '0.82rem' }}>
                      <RotateCcw size={15} />
                      Total PKR {total.toLocaleString()}
                    </div>
                  </div>

                  {!selectedInvoice ? (
                    <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <CornerUpLeft size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                      <p style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>No Invoice Selected</p>
                      <p style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
                        Enter an invoice number above to load its products for return
                      </p>
                    </div>
                  ) : lines.length === 0 ? (
                    <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <p style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>No Products Found</p>
                      <p style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
                        This invoice has no items to return
                      </p>
                    </div>
                  ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--dash-border)' }}>
                          {['Product', 'Max Qty', 'Return Qty', 'Price', 'Total Price'].map((heading) => (
                            <th key={heading} style={{ padding: '0.8rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-400)' }}>
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, index) => (
                          <tr key={`${line.productId}-${index}`} style={{ borderTop: '1px solid var(--dash-border)' }}>
                            <td style={{ padding: '0.8rem 0.75rem', fontWeight: 700, color: 'var(--navy)' }}>{line.name}</td>
                            <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>{line.maxQty}</td>
                            <td style={{ padding: '0.8rem 0.75rem' }}>
                              <input
                                type="number"
                                min="0"
                                max={line.maxQty}
                                value={line.qty}
                                onChange={(event) =>
                                  setLines((current) =>
                                    current.map((entry, lineIndex) =>
                                      lineIndex === index
                                        ? { ...entry, qty: Math.min(Number(event.target.value || 0), entry.maxQty) }
                                        : entry,
                                    ),
                                  )
                                }
                                style={{ ...fieldStyle, width: 100 }}
                              />
                            </td>
                            <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>PKR {Number(line.unitPrice).toLocaleString()}</td>
                            <td style={{ padding: '0.8rem 0.75rem', fontWeight: 700, color: 'var(--navy)' }}>
                              PKR {(Number(line.qty || 0) * Number(line.unitPrice || 0)).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
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
                <button type="submit" disabled={isSaving} style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: 'none', background: '#d97706', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: isSaving ? 0.7 : 1 }}>
                  {isSaving ? 'Saving Return...' : 'Save Return'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
