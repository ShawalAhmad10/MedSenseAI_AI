import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ClipboardPen, X } from 'lucide-react';

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

export default function StockOpeningModal({ isOpen, batches, currentUserName, onClose, onSubmit }) {
  const [stockId, setStockId] = useState('');
  const [lineKey, setLineKey] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('opening');
  const [quantity, setQuantity] = useState(0);
  const [price, setPrice] = useState(0);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const selectedBatch = useMemo(
    () => batches.find((entry) => entry.id === stockId) || null,
    [batches, stockId],
  );

  const selectedLine = useMemo(
    () => selectedBatch?.items.find((item) => item.id === lineKey) || null,
    [lineKey, selectedBatch],
  );

  useEffect(() => {
    if (!isOpen) return;
    const initialBatch = batches[0] ?? null;
    const initialLine = initialBatch?.items?.[0] ?? null;
    setStockId(initialBatch?.id ?? '');
    setLineKey(initialLine?.id ?? '');
    setAdjustmentType('opening');
    setQuantity(initialLine?.qty ?? 0);
    setPrice(initialLine?.purchasePrice ?? 0);
    setNotes('');
    setError('');
    setFieldErrors({});
    setIsSaving(false);
  }, [batches, isOpen]);

  useEffect(() => {
    if (!selectedBatch) return;
    const firstLine = selectedBatch.items[0] ?? null;
    setLineKey(firstLine?.id ?? '');
    setQuantity(firstLine?.qty ?? 0);
    setPrice(firstLine?.purchasePrice ?? 0);
  }, [selectedBatch]);

  useEffect(() => {
    if (!selectedLine) return;
    setQuantity(selectedLine.qty ?? 0);
    setPrice(selectedLine.purchasePrice ?? 0);
  }, [selectedLine]);

  const totalPrice = Number(quantity || 0) * Number(price || 0);

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Validate all fields
    const errors = {};
    
    if (!selectedBatch) {
      errors.stockId = 'Please select a stock batch';
    }
    
    if (!selectedLine) {
      errors.lineKey = 'Please select a batch line';
    }
    
    const qty = Number(quantity);
    if (!quantity || qty <= 0) {
      errors.quantity = 'Quantity must be greater than 0';
    }
    
    const prc = Number(price);
    if (!price || prc <= 0) {
      errors.price = 'Price must be greater than 0';
    }
    
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('⚠️ Please fix the errors above before submitting');
      return;
    }

    setIsSaving(true);
    setError('');
    setFieldErrors({});
    try {
      await onSubmit({
        stockId: selectedBatch.id,
        stockNumber: selectedBatch.stockNumber,
        batchNumber: selectedLine.batchNumber,
        productId: selectedLine.productId,
        productName: selectedLine.name,
        quantity: qty,
        price: prc,
        user: currentUserName,
        adjustmentType,
        notes,
      });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save opening stock entry.');
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
              width: 'min(680px, 100%)',
              background: 'white',
              borderRadius: 'var(--dash-radius)',
              border: '1px solid var(--dash-border)',
              boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
            }}
          >
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ClipboardPen size={20} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy)' }}>Opening / Adjusted Stock</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                      Explicit stock history entry tied to a received batch line.
                    </p>
                  </div>
                </div>
                <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
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
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Adjustment Type</label>
                    <select value={adjustmentType} onChange={(event) => setAdjustmentType(event.target.value)} style={fieldStyle}>
                      <option value="opening">Opening</option>
                      <option value="adjusted">Adjusted</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Batch Line *</label>
                  <select 
                    value={lineKey} 
                    onChange={(event) => {
                      setLineKey(event.target.value);
                      setFieldErrors(prev => ({ ...prev, lineKey: '' }));
                    }} 
                    style={{
                      ...fieldStyle,
                      border: fieldErrors.lineKey ? '1px solid #dc2626' : '1px solid var(--dash-border)',
                      background: fieldErrors.lineKey ? 'rgba(239,68,68,0.05)' : 'white'
                    }}
                  >
                    {(selectedBatch?.items ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.batchNumber} | {item.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.lineKey && (
                    <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem', display: 'block' }}>
                      {fieldErrors.lineKey}
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Quantity *</label>
                    <input 
                      type="number" 
                      min="1" 
                      value={quantity} 
                      onChange={(event) => {
                        setQuantity(event.target.value);
                        setFieldErrors(prev => ({ ...prev, quantity: '' }));
                      }} 
                      style={{
                        ...fieldStyle,
                        border: fieldErrors.quantity ? '1px solid #dc2626' : '1px solid var(--dash-border)',
                        background: fieldErrors.quantity ? 'rgba(239,68,68,0.05)' : 'white'
                      }}
                    />
                    {fieldErrors.quantity && (
                      <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem', display: 'block' }}>
                        {fieldErrors.quantity}
                      </span>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Price *</label>
                    <input 
                      type="number" 
                      min="0" 
                      value={price} 
                      onChange={(event) => {
                        setPrice(event.target.value);
                        setFieldErrors(prev => ({ ...prev, price: '' }));
                      }} 
                      style={{
                        ...fieldStyle,
                        border: fieldErrors.price ? '1px solid #dc2626' : '1px solid var(--dash-border)',
                        background: fieldErrors.price ? 'rgba(239,68,68,0.05)' : 'white'
                      }}
                    />
                    {fieldErrors.price && (
                      <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem', display: 'block' }}>
                        {fieldErrors.price}
                      </span>
                    )}
                  </div>
                  <div style={{ padding: '0.9rem 1rem', borderRadius: 14, background: 'var(--dash-bg)', border: '1px solid var(--dash-border)' }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 700 }}>Total Price</div>
                    <div style={{ fontSize: '0.92rem', color: 'var(--navy)', fontWeight: 700, marginTop: 4 }}>PKR {totalPrice.toLocaleString()}</div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Notes</label>
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
                </div>

                {selectedLine && (
                  <div style={{ padding: '1rem', borderRadius: 14, background: '#f8fafc', border: '1px solid var(--dash-border)', display: 'grid', gap: '0.4rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '0.95rem' }}>{selectedLine.name}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--gray-600)' }}>
                      Batch: <span style={{ fontWeight: 600 }}>{selectedLine.batchNumber}</span> | 
                      Bale: <span style={{ fontWeight: 600 }}>{selectedLine.bale || '-'}</span> | 
                      Expiry: <span style={{ fontWeight: 600, color: selectedLine.productExpiry ? '#d97706' : 'inherit' }}>
                        {selectedLine.productExpiry || '-'}
                      </span>
                    </div>
                  </div>
                )}

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
                  {isSaving ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
