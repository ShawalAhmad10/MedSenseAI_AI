import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ClipboardList, RotateCcw, Warehouse, X } from 'lucide-react';
import { formatDate, formatTimeAgo } from '../../utils/formatters';

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.84rem', color: 'var(--gray-600)' }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700, color: 'var(--navy)', textAlign: 'right' }}>{value || '-'}</span>
    </div>
  );
}

export default function StockDetailModal({ isOpen, onClose, entry, onUpdateBatch }) {
  const [editing, setEditing] = useState(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setEditing(null); setError(''); }, [entry?.stockNumber, isOpen]);
  if (!entry) return null;

  const isBatch = entry.mode === 'stock-batch';
  const isReturn = entry.mode === 'stock-return';
  const isOpening = entry.mode === 'stock-opening';

  const title = isBatch
    ? `Stock Batch ${entry.stockNumber}`
    : isReturn
      ? `Stock Return ${entry.returnNumber}`
      : `Stock Opening ${entry.openingNumber || entry.id}`;

  const icon = isBatch ? <Warehouse size={18} /> : isReturn ? <RotateCcw size={18} /> : <ClipboardList size={18} />;

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
              width: 'min(1040px, 100%)',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'white',
              borderRadius: 'var(--dash-radius)',
              border: '1px solid var(--dash-border)',
              boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--dash-bg)', color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {icon}
                </div>
                <div>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy)' }}>{title}</h2>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                    {formatDate(entry.createdAt || entry.creationDate)} | {formatTimeAgo(entry.createdAt || entry.creationDate)}
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'grid', gap: '1.5rem' }}>
              {editing && <form onSubmit={async event => {
                event.preventDefault(); setSaving(true); setError('');
                try { await onUpdateBatch(editing.item, { [editing.field]: Number(value) }); setEditing(null); }
                catch (err) { setError(err.response?.data?.message || err.message); }
                finally { setSaving(false); }
              }} style={{ padding: 14, border: '1px solid var(--dash-border)', borderRadius: 10 }}>
                <label>{editing.field === 'salePrice' ? 'Edit Batch Sale Price' : 'Edit Batch Stock'} — {editing.item.batchNumber}
                  <input type="number" required min={editing.field === 'salePrice' ? '0.01' : '0'}
                    step={editing.field === 'salePrice' ? '0.01' : '1'} value={value}
                    onChange={event => setValue(event.target.value)} style={{ margin: '0 10px', padding: 8, width: 100 }} />
                </label>
                <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                <button type="button" disabled={saving} onClick={() => setEditing(null)} style={{ marginLeft: 8 }}>Cancel</button>
                <p style={{ marginBottom: 0 }}>Only this batch changes. Purchase cost and completed invoices stay recorded.</p>
                {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
              </form>}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem' }}>
                <div style={{ border: '1px solid var(--dash-border)', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '0.95rem 1rem', borderBottom: '1px solid var(--dash-border)', background: 'var(--dash-bg)', fontWeight: 700, color: 'var(--navy)' }}>
                    {isOpening ? 'Adjustment Snapshot' : 'Line Items'}
                  </div>
                  {isOpening ? (
                    <div style={{ padding: '1rem', display: 'grid', gap: '0.7rem' }}>
                      <SummaryRow label="Stock Number" value={entry.stockNumber} />
                      <SummaryRow label="Batch Number" value={entry.batchNumber} />
                      <SummaryRow label="Product" value={entry.productName} />
                      <SummaryRow label="Quantity" value={entry.quantity} />
                      <SummaryRow label="Price" value={`PKR ${Number(entry.price || 0).toLocaleString()}`} />
                      <SummaryRow label="Total" value={`PKR ${Number(entry.totalPrice || 0).toLocaleString()}`} />
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--dash-border)' }}>
                            {(isBatch
                              ? ['Batch', 'Product', 'Bale', 'Qty', 'Bonus', 'Purchase Cost', 'Sale Price', 'Discount', 'Sales Tax', 'Advance Tax', 'Expiry', 'Total', 'Stock', 'Actions']
                              : ['Product', 'Quantity', 'Price', 'Expiry', 'Total']
                            ).map((heading) => (
                              <th key={heading} style={{ padding: '0.8rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-400)' }}>
                                {heading}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(entry.items ?? []).map((item, index) => (
                            <tr key={`${item.id}-${index}`} style={{ borderTop: '1px solid var(--dash-border)' }}>
                              {isBatch ? (
                                <>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--navy)', fontWeight: 700 }}>{item.batchNumber}
                                    {item.activeForCustomers && <small style={{ display: 'block', color: '#059669' }}>Active for Customers</small>}
                                  </td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--navy)' }}>{item.name}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>{item.bale || '-'} / {item.baleSize || '-'}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>{item.qty}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>{item.bonus}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>PKR {Number(item.purchasePrice || 0).toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>PKR {Number(item.salePrice || 0).toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: '#d97706' }}>PKR {Number(item.discount || 0).toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>PKR {Number(item.salesTax || 0).toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>PKR {Number(item.advanceTax || 0).toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>{item.productExpiry || '-'}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--navy)', fontWeight: 700 }}>PKR {Number(item.totalPrice || 0).toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem 0.75rem' }}>{item.remainingQty ?? item.totalQty ?? 0}
                                    {Number(item.remainingQty ?? item.totalQty ?? 0) === 0 && <small style={{ display: 'block' }}>Inactive / Out of stock</small>}
                                  </td>
                                  <td style={{ padding: '0.8rem 0.75rem' }}>{onUpdateBatch && <>
                                    <small style={{ display: 'block' }}>Price preserved · Add New Batch for a new price</small>
                                    <button type="button" onClick={() => { setEditing({ item, field: 'stock' }); setValue(String(item.remainingQty ?? 0)); setError(''); }}>Edit Stock</button>
                                  </>}</td>
                                </>
                              ) : (
                                <>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--navy)', fontWeight: 700 }}>{item.name}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>{item.quantity}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>PKR {Number(item.price || 0).toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--gray-600)' }}>{item.expiry || '-'}</td>
                                  <td style={{ padding: '0.8rem 0.75rem', color: 'var(--navy)', fontWeight: 700 }}>PKR {Number(item.totalPrice || 0).toLocaleString()}</td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div style={{ border: '1px solid var(--dash-border)', borderRadius: 16, padding: '1rem', display: 'grid', gap: '0.75rem', alignContent: 'start' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--navy)' }}>
                    {isBatch ? 'Batch Meta' : isReturn ? 'Return Meta' : 'Opening Meta'}
                  </div>
                  {isBatch && (
                    <>
                      <SummaryRow label="Supplier" value={entry.supplierName} />
                      <SummaryRow label="Bill No" value={entry.billNumber || entry.billNo} />
                      <SummaryRow label="Builty No" value={entry.builtyNo} />
                      <SummaryRow label="Created By" value={entry.createdBy} />
                      <SummaryRow label="Stock Price" value={`PKR ${Number(entry.stockPrice || 0).toLocaleString()}`} />
                    </>
                  )}
                  {isReturn && (
                    <>
                      <SummaryRow label="Supplier" value={entry.supplierName} />
                      <SummaryRow label="Linked Stock" value={entry.stockNumber} />
                      <SummaryRow label="Return Type" value={entry.returnType} />
                      <SummaryRow label="Created By" value={entry.createdBy} />
                      <SummaryRow label="Return Total" value={`PKR ${Number(entry.returnTotal || 0).toLocaleString()}`} />
                      <div style={{ marginTop: '0.4rem', paddingTop: '0.8rem', borderTop: '1px solid var(--dash-border)' }}>
                        <div style={{ fontSize: '0.74rem', color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem' }}>Description</div>
                        <div style={{ fontSize: '0.84rem', color: 'var(--navy)', lineHeight: 1.5 }}>{entry.description || 'No notes added.'}</div>
                      </div>
                    </>
                  )}
                  {isOpening && (
                    <>
                      <SummaryRow label="Adjustment Type" value={entry.adjustmentType} />
                      <SummaryRow label="User" value={entry.user} />
                      <div style={{ marginTop: '0.4rem', paddingTop: '0.8rem', borderTop: '1px solid var(--dash-border)' }}>
                        <div style={{ fontSize: '0.74rem', color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem' }}>Notes</div>
                        <div style={{ fontSize: '0.84rem', color: 'var(--navy)', lineHeight: 1.5 }}>{entry.notes || 'No notes added.'}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
