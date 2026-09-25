import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, X } from 'lucide-react';

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

export default function StockReturnModal({ isOpen, batches, currentUserName, onClose, onSubmit }) {
  const [stockId, setStockId] = useState('');
  const [returnType, setReturnType] = useState('normal');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([]);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const selectedBatch = useMemo(
    () => batches.find((entry) => entry.id === stockId) || null,
    [batches, stockId],
  );

  useEffect(() => {
    if (!isOpen) return;
    const initialBatch = batches[0] ?? null;
    setStockId(initialBatch?.id ?? '');
    setReturnType('normal');
    setDescription('');
    setError('');
    setFieldErrors({});
    setIsSaving(false);
    setLines(
      (initialBatch?.items ?? []).map((item) => ({
        batchLineId: item.id,
        productId: item.productId,
        name: item.name,
        maxQuantity: item.qty,
        quantity: 0,
        price: item.purchasePrice,
        expiry: item.productExpiry,
      })),
    );
  }, [batches, isOpen]);

  useEffect(() => {
    if (!selectedBatch) return;
    setLines(
      selectedBatch.items.map((item) => ({
        batchLineId: item.id,
        productId: item.productId,
        name: item.name,
        maxQuantity: item.qty,
        quantity: 0,
        price: item.purchasePrice,
        expiry: item.productExpiry,
      })),
    );
  }, [selectedBatch]);

  const returnTotal = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.quantity || 0) * Number(line.price || 0)), 0),
    [lines],
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validLines = lines.filter((line) => Number(line.quantity) > 0);
    
    const errors = {};
    if (!selectedBatch) {
      errors.stockId = 'Please select a stock batch';
    }
    
    if (validLines.length === 0) {
      errors.items = 'Please enter at least one return quantity greater than 0';
    }
    
    // Validate each line with quantity
    let hasLineErrors = false;
    validLines.forEach((line, index) => {
      if (Number(line.quantity) > Number(line.maxQuantity)) {
        errors[`line_${index}`] = `${line.name}: Return quantity cannot exceed max quantity (${line.maxQuantity})`;
        hasLineErrors = true;
      }
    });
    
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError(hasLineErrors ? '⚠️ Please fix line item errors' : '⚠️ Please fix the errors above');
      return;
    }

    setIsSaving(true);
    setError('');
    setFieldErrors({});
    try {
      await onSubmit({
        stockId: selectedBatch.id,
        stockNumber: selectedBatch.stockNumber,
        supplierId: selectedBatch.supplierId,
        supplierName: selectedBatch.supplierName,
        returnType,
        description,
        createdBy: currentUserName,
        items: validLines,
      });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save stock return.');
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
                    <RotateCcw size={20} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy)' }}>Return Stock to Supplier</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                      Supplier return with normal/open types and batch-linked line items.
                    </p>
                  </div>
                </div>
                <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '1.5rem', display: 'grid', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Stock Batch *</label>
                    <select 
                      value={stockId} 
                      onChange={(event) => {
                        setStockId(event.target.value);
                        setFieldErrors(prev => ({ ...prev, stockId: '' }));
                      }} 
                      style={{
                        ...fieldStyle,
                        border: fieldErrors.stockId ? '1px solid #dc2626' : '1px solid var(--dash-border)',
                        background: fieldErrors.stockId ? 'rgba(239,68,68,0.05)' : 'white'
                      }}
                    >
                      {batches.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.stockNumber} | {batch.supplierName}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.stockId && (
                      <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem', display: 'block' }}>
                        {fieldErrors.stockId}
                      </span>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Return Type</label>
                    <select value={returnType} onChange={(event) => setReturnType(event.target.value)} style={fieldStyle}>
                      <option value="normal">Normal</option>
                      <option value="open">Open</option>
                    </select>
                  </div>
                  <div style={{ padding: '0.9rem 1rem', borderRadius: 14, background: 'var(--dash-bg)', border: '1px solid var(--dash-border)' }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 700 }}>Supplier</div>
                    <div style={{ fontSize: '0.92rem', color: 'var(--navy)', fontWeight: 700, marginTop: 4 }}>{selectedBatch?.supplierName || '-'}</div>
                  </div>
                  <div style={{ padding: '0.9rem 1rem', borderRadius: 14, background: 'var(--dash-bg)', border: '1px solid var(--dash-border)' }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 700 }}>Return Total</div>
                    <div style={{ fontSize: '0.92rem', color: 'var(--navy)', fontWeight: 700, marginTop: 4 }}>PKR {returnTotal.toLocaleString()}</div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Description</label>
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
                </div>

                <div style={{ border: '1px solid var(--dash-border)', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '0.95rem 1rem', borderBottom: '1px solid var(--dash-border)', background: 'var(--dash-bg)' }}>
                    <strong style={{ fontSize: '0.92rem', color: 'var(--navy)' }}>Return Line Items</strong>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.76rem', color: 'var(--gray-400)' }}>
                      Enter quantities to return (must be between 0 and max qty)
                    </p>
                  </div>
                  {fieldErrors.items && (
                    <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                      <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>
                        {fieldErrors.items}
                      </span>
                    </div>
                  )}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--dash-border)' }}>
                          {['Product', 'Max Qty', 'Return Qty', 'Price', 'Expiry', 'Total Price'].map((heading) => (
                            <th key={heading} style={{ padding: '0.8rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-400)' }}>
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, index) => (
                          <tr key={`${line.batchLineId}-${index}`} style={{ borderTop: '1px solid var(--dash-border)' }}>
                            <td style={{ padding: '0.8rem 0.75rem', fontWeight: 700, color: 'var(--navy)' }}>{line.name}</td>
                            <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>{line.maxQuantity}</td>
                            <td style={{ padding: '0.8rem 0.75rem' }}>
                              <input
                                type="number"
                                min="0"
                                max={line.maxQuantity}
                                value={line.quantity}
                                onChange={(event) => {
                                  const newQty = Math.min(Number(event.target.value || 0), line.maxQuantity);
                                  setLines((current) =>
                                    current.map((entry, lineIndex) =>
                                      lineIndex === index ? { ...entry, quantity: newQty } : entry,
                                    ),
                                  );
                                  setFieldErrors(prev => ({ ...prev, [`line_${index}`]: '', items: '' }));
                                }}
                                style={{
                                  ...fieldStyle,
                                  width: 100,
                                  border: fieldErrors[`line_${index}`] ? '1px solid #dc2626' : '1px solid var(--dash-border)',
                                  background: fieldErrors[`line_${index}`] ? 'rgba(239,68,68,0.05)' : 'white'
                                }}
                              />
                              {fieldErrors[`line_${index}`] && (
                                <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '0.25rem' }}>
                                  {fieldErrors[`line_${index}`]}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>PKR {Number(line.price || 0).toLocaleString()}</td>
                            <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>{line.expiry || '-'}</td>
                            <td style={{ padding: '0.8rem 0.75rem', fontWeight: 700, color: 'var(--navy)' }}>
                              PKR {(Number(line.quantity || 0) * Number(line.price || 0)).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                  {isSaving ? 'Saving Return...' : 'Save Stock Return'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
