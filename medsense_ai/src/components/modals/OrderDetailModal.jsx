import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, Clock, Home, Package, Printer, RotateCcw, Truck, X } from 'lucide-react';
import { formatDate, formatTimeAgo } from '../../utils/formatters';

const STATUS_STEPS = [
  { id: 'pending',    icon: Clock,        label: 'Placed'     },
  { id: 'processing', icon: Package,      label: 'Processing' },
  { id: 'ready',      icon: CheckCircle,  label: 'Ready'      },
  { id: 'dispatched', icon: Truck,        label: 'Dispatched' },
  { id: 'delivered',  icon: Home,         label: 'Delivered'  },
];

const getStatusColor = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'paid':
    case 'delivered':
    case 'approved':
      return { bg: 'rgba(16,185,129,0.15)', color: '#10b981' };
    case 'pending':
    case 'processing':
    case 'ready':
    case 'dispatched':
    case 'posted':
      return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' };
    case 'failed':
    case 'cancelled':
    case 'rejected':
      return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
    case 'refunded':
    case 'unpaid':
      return { bg: '#f1f5f9', color: '#64748b' };
    default:
      return { bg: 'var(--dash-bg)', color: 'var(--navy)' };
  }
};

function KVRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.86rem', color: 'var(--gray-600)' }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700, color: 'var(--navy)', textAlign: 'right' }}>{value || '-'}</span>
    </div>
  );
}

export default function OrderDetailModal({ isOpen, onClose, order }) {
  if (!order) return null;

  const detailMode       = order.mode ?? 'order';
  const isInvoice        = detailMode === 'invoice';
  const isInvoiceReturn  = detailMode === 'invoice-return';
  const isOrder          = !isInvoice && !isInvoiceReturn;

  const items    = order.items ?? [];
  const subtotal = isOrder
    ? (Number(order.subtotalAmount) > 0
        ? Number(order.subtotalAmount)
        : items.reduce((s, i) => s + Number(i.qty) * Number(i.unitPrice), 0))
    : items.reduce((s, i) => s + Number(i.totalPrice ?? (i.qty || 0) * (i.unitPrice || 0)), 0);

  const discount = Number(order.discountAmount ?? order.discount ?? 0);
  const tax      = Number(order.taxAmount ?? 0);
  const total    = isInvoiceReturn
    ? Number(order.returnTotal ?? subtotal)
    : isInvoice
      ? Number(order.invoiceTotal ?? subtotal)
      : Number(order.totalAmount ?? (subtotal - discount + tax));

  const totalProfit = isInvoice
    ? Number(order.totalProfit || items.reduce((s, i) => s + Number(i.profit || 0), 0))
    : 0;

  const paymentStyle  = getStatusColor(order.paymentStatus);
  const deliveryStyle = getStatusColor(order.deliveryStatus);
  // Use orderNumber / invoiceNumber first, then id — never show "undefined"
  const orderLabel    = order.orderNumber ?? order.invoice_number ?? order.id ?? '—';
  const title         = isInvoice
    ? `Invoice ${order.invoiceNumber ?? order.invoice_number ?? order.id ?? '—'}`
    : isInvoiceReturn
      ? `Return ${order.returnNumber ?? order.id ?? '—'}`
      : `Order ${orderLabel}`;
  const badge    = isInvoiceReturn ? order.paymentStatus : order.deliveryStatus;
  const dateVal  = order.createdAt ?? order.created_at ?? order.date;
  const stepIdx  = STATUS_STEPS.findIndex(s => s.id.toLowerCase() === String(order.deliveryStatus || '').toLowerCase());
  const cancelled = String(order.deliveryStatus || '').toLowerCase() === 'cancelled';

  // Invoice line-item columns — Qty only (Pack removed), Pack Size shows actual pack info
  const invoiceHeadings = isInvoice
    ? ['Product', 'Pack Size', 'Qty', 'Price', 'Discount', 'Total', 'Profit']
    : isInvoiceReturn
      ? ['Product', 'Qty', 'Price', 'Total', 'Profit']   // ← Profit added for returns
      : ['Product', 'Qty', 'Price', 'Total'];

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={onClose} className="no-print"
            style={{ position:'absolute', inset:0, background:'rgba(13,17,23,0.4)', backdropFilter:'blur(4px)' }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity:0, scale:0.95, y:20 }}
            animate={{ opacity:1, scale:1, y:0 }}
            exit={{ opacity:0, scale:0.95, y:20 }}
            transition={{ type:'spring', damping:25, stiffness:300 }}
            className="print-container"
            style={{ position:'relative', width:'100%', maxWidth:1040, background:'var(--dash-card)', borderRadius:'var(--dash-radius)', boxShadow:'0 24px 48px rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', maxHeight:'92vh' }}
          >
            {/* Header */}
            <div className="no-print" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1.5rem', borderBottom:'1px solid var(--dash-border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
                <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.4rem', color:'var(--navy)', margin:0 }}>{title}</h2>
                <span style={{ padding:'4px 10px', borderRadius:100, fontSize:'0.75rem', fontWeight:600, background:deliveryStyle.bg, color:deliveryStyle.color, textTransform:'capitalize' }}>
                  {badge || 'Open'}
                </span>
              </div>
              <div style={{ display:'flex', gap:'0.5rem' }}>
                <motion.button whileHover={{ y:-2 }} whileTap={{ scale:0.95 }} onClick={() => window.print()}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'0.5rem 1rem', borderRadius:100, border:'1px solid var(--dash-border)', background:'white', color:'var(--navy)', fontSize:'0.82rem', fontWeight:600, cursor:'pointer' }}>
                  <Printer size={16} /> Print Slip
                </motion.button>
                <motion.button whileHover={{ background:'var(--dash-bg)', scale:1.1 }} whileTap={{ scale:0.9 }} onClick={onClose}
                  style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--gray-600)' }}>
                  <X size={20} />
                </motion.button>
              </div>
            </div>

            {/* Print header */}
            <div className="print-only" style={{ display:'none', padding:'2rem 1.5rem 0', textAlign:'center' }}>
              <h1 style={{ fontFamily:'var(--font-display)', fontSize:'2rem', margin:0 }}>MedSense Pharmacy</h1>
              <p style={{ color:'var(--gray-600)', margin:'0.5rem 0' }}>{title} | {formatDate(dateVal)}</p>
              <hr style={{ border:'none', borderTop:'1px solid var(--dash-border)', margin:'1rem 0' }} />
            </div>

            {/* Body */}
            <div className="print-body" style={{ flex:1, overflowY:'auto', padding:'1.5rem', display:'flex', gap:'2rem' }}>

              {/* LEFT — customer + items */}
              <div style={{ flex:2, display:'flex', flexDirection:'column', gap:'1.5rem' }}>

                {/* Customer Info (single card — no Branch card) */}
                <div style={{ background:'var(--dash-bg)', padding:'1.25rem', borderRadius:16 }}>
                  <p style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--gray-400)', textTransform:'uppercase', margin:0 }}>
                    {isOrder ? 'Patient Info' : 'Customer Info'}
                  </p>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginTop:'0.75rem' }}>
                    <div className="no-print" style={{ width:40, height:40, borderRadius:'50%', background:'var(--navy)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'0.9rem' }}>
                      {(order.patient?.name ?? order.customerName ?? 'U').split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ margin:0, fontWeight:700, color:'var(--navy)' }}>
                        {order.patient?.name ?? order.customerName ?? 'Walk-in Customer'}
                      </p>
                      <p style={{ margin:0, fontSize:'0.8rem', color:'var(--gray-600)' }}>
                        {order.patient?.phone ?? order.customerContact ?? '-'}
                      </p>
                      {(order.deliveryAddress || order.address) && (
                        <p style={{ margin:0, fontSize:'0.8rem', color:'var(--gray-600)' }}>
                          {order.deliveryAddress ?? order.address}
                        </p>
                      )}
                      {isInvoiceReturn && (
                        <p style={{ margin:'0.25rem 0 0', fontSize:'0.82rem', color:'var(--navy)', fontWeight:600 }}>
                          Invoice: {order.invoiceNumber ?? order.linkedInvoiceId}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <h3 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.1rem', color:'var(--navy)', marginBottom:'1rem' }}>
                    {isInvoiceReturn ? 'Returned Items' : isInvoice ? 'Invoice Line Items' : 'Order Items'}
                  </h3>

                  <div style={{ border:'1px solid var(--dash-border)', borderRadius:16, overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', textAlign:'left' }}>
                      <thead>
                        <tr style={{ background:'var(--dash-bg)' }}>
                          {invoiceHeadings.map(h => (
                            <th key={h} style={{ padding:'0.75rem 1rem', fontSize:'0.75rem', fontWeight:600, color:'var(--gray-400)', textTransform:'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <tr key={`${item.id || item.productId || item.name}-${idx}`} style={{ borderTop:'1px solid var(--dash-border)' }}>
                            {isInvoice ? (
                              <>
                                <td style={{ padding:'1rem', fontSize:'0.9rem', fontWeight:600, color:'var(--navy)' }}>{item.name}</td>
                                {/* Pack Size — shows product_pack_description e.g. "Strip of 10", "10 tablets" */}
                                <td style={{ padding:'1rem', fontSize:'0.82rem', color:'var(--gray-600)' }}>
                                  {item.packDescription
                                    ? item.packDescription
                                    : item.packSize
                                      ? `${item.packSize} units`
                                      : '-'}
                                </td>
                                <td style={{ padding:'1rem', fontSize:'0.85rem', color:'var(--gray-600)' }}>{item.qty}</td>
                                <td style={{ padding:'1rem', fontSize:'0.85rem', color:'var(--gray-600)' }}>PKR {Number(item.unitPrice).toLocaleString()}</td>
                                <td style={{ padding:'1rem', fontSize:'0.85rem', color:'#d97706' }}>PKR {Number(item.discount || 0).toLocaleString()}</td>
                                <td style={{ padding:'1rem', fontSize:'0.85rem', fontWeight:700, color:'var(--navy)' }}>
                                  PKR {Number(item.totalPrice ?? (item.qty || 0) * (item.unitPrice || 0)).toLocaleString()}
                                </td>
                                <td style={{ padding:'1rem', fontSize:'0.85rem', fontWeight:700, color:'#059669' }}>
                                  PKR {Number(item.profit || 0).toLocaleString()}
                                </td>
                              </>
                            ) : isInvoiceReturn ? (
                              <>
                                <td style={{ padding:'1rem', fontSize:'0.9rem', fontWeight:600, color:'var(--navy)' }}>{item.name}</td>
                                <td style={{ padding:'1rem', fontSize:'0.9rem', color:'var(--gray-600)' }}>{item.qty}</td>
                                <td style={{ padding:'1rem', fontSize:'0.9rem', color:'var(--gray-600)' }}>PKR {Number(item.unitPrice || 0).toLocaleString()}</td>
                                <td style={{ padding:'1rem', fontSize:'0.9rem', fontWeight:700, color:'var(--navy)' }}>
                                  PKR {Number(item.totalPrice ?? (item.qty || 0) * (item.unitPrice || 0)).toLocaleString()}
                                </td>
                                <td style={{ padding:'1rem', fontSize:'0.85rem', fontWeight:700, color: Number(item.product_profit||item.profit||0) >= 0 ? '#059669' : '#dc2626' }}>
                                  PKR {Number(item.product_profit ?? item.profit ?? 0).toLocaleString()}
                                </td>
                              </>
                            ) : (
                              <>
                                <td style={{ padding:'1rem', fontSize:'0.9rem', fontWeight:500, color:'var(--navy)' }}>
                                  {item.name || item.product_title || item.productTitle || '—'}
                                </td>
                                <td style={{ padding:'1rem', fontSize:'0.9rem', color:'var(--gray-600)' }}>
                                  x{item.qty ?? item.quantity ?? 0}
                                </td>
                                <td style={{ padding:'1rem', fontSize:'0.9rem', color:'var(--gray-600)' }}>
                                  PKR {Number(item.unitPrice ?? item.unit_price ?? 0).toLocaleString()}
                                </td>
                                <td style={{ padding:'1rem', fontSize:'0.9rem', fontWeight:600, color:'var(--navy)' }}>
                                  PKR {Number(
                                    item.totalPrice ?? item.total_price ??
                                    ((item.qty ?? item.quantity ?? 0) * (item.unitPrice ?? item.unit_price ?? 0))
                                  ).toLocaleString()}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                        {items.length === 0 && (
                          <tr>
                            <td colSpan={invoiceHeadings.length} style={{ padding:'1.5rem', textAlign:'center', color:'var(--gray-400)', fontSize:'0.85rem' }}>
                              No items found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'1.5rem' }}>
                    <div style={{ width:290, display:'grid', gap:'0.5rem' }}>
                      <KVRow label="Subtotal" value={`PKR ${subtotal.toLocaleString()}`} />
                      {discount > 0 && <KVRow label="Discount" value={`- PKR ${discount.toLocaleString()}`} />}
                      {tax > 0       && <KVRow label="Tax"      value={`PKR ${tax.toLocaleString()}`} />}
                      {isInvoice && totalProfit > 0 && (
                        <KVRow label="Total Profit" value={`PKR ${totalProfit.toLocaleString()}`} />
                      )}
                      <div style={{ display:'flex', justifyContent:'space-between', marginTop:'0.75rem', paddingTop:'0.75rem', borderTop:'1px solid var(--dash-border)', fontSize:'1.2rem', fontWeight:800, color:'var(--navy)' }}>
                        <span>{isInvoiceReturn ? 'Return Total' : isInvoice ? 'Invoice Total' : 'Total'}</span>
                        <span>PKR {total.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT — payment info / timeline */}
              <div className="no-print" style={{ flex:1, display:'flex', flexDirection:'column', gap:'1.5rem', borderLeft:'1px solid var(--dash-border)', paddingLeft:'2rem' }}>

                {/* Billing / Payment Snapshot */}
                <div>
                  <h3 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.1rem', color:'var(--navy)', marginBottom:'1rem' }}>
                    {isInvoiceReturn ? 'Return Snapshot' : isInvoice ? 'Billing Snapshot' : 'Payment Info'}
                  </h3>
                  <div style={{ border:'1px solid var(--dash-border)', borderRadius:16, padding:'1rem', display:'grid', gap:'0.7rem' }}>
                    <KVRow label="Method"  value={order.paymentMethod ?? 'cash'} />
                    <KVRow label={isInvoiceReturn ? 'Refund Status' : 'Payment Status'} value={order.paymentStatus ?? 'unpaid'} />
                    {isInvoice && <KVRow label="Created By" value={order.createdBy} />}
                    {isInvoiceReturn && <KVRow label="Invoice Type" value={order.invoiceType} />}
                    <div style={{ display:'inline-flex', padding:'4px 8px', borderRadius:100, fontSize:'0.75rem', fontWeight:600, background:paymentStyle.bg, color:paymentStyle.color, width:'fit-content', textTransform:'capitalize' }}>
                      {order.paymentStatus ?? 'unpaid'}
                    </div>
                  </div>
                </div>

                {/* Order Timeline OR Invoice Meta */}
                {isOrder ? (
                  <div style={{ flex:1 }}>
                    <h3 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.1rem', color:'var(--navy)', marginBottom:'1rem' }}>Order Timeline</h3>
                    <div style={{ position:'relative' }}>
                      {cancelled ? (
                        <div style={{ display:'flex', gap:'1rem', alignItems:'flex-start' }}>
                          <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(239,68,68,0.15)', color:'#ef4444', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <X size={16} />
                          </div>
                          <div style={{ paddingTop:4 }}>
                            <p style={{ margin:0, fontWeight:700, color:'#ef4444', fontSize:'0.95rem' }}>Order Cancelled</p>
                          </div>
                        </div>
                      ) : (
                        STATUS_STEPS.map((step, i) => {
                          const done    = stepIdx >= i;
                          const current = stepIdx === i;
                          return (
                            <div key={step.id} style={{ display:'flex', gap:'1rem', alignItems:'flex-start', marginBottom: i === STATUS_STEPS.length-1 ? 0 : '1.5rem', position:'relative' }}>
                              {i !== STATUS_STEPS.length-1 && (
                                <div style={{ position:'absolute', left:15, top:32, bottom:-24, width:2, background: done ? 'var(--blue)' : 'var(--dash-border)', zIndex:0 }} />
                              )}
                              <div style={{ width:32, height:32, borderRadius:'50%', background: current||done ? 'var(--blue)' : 'var(--dash-bg)', color: current||done ? 'white' : 'var(--gray-400)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1, boxShadow: current ? '0 0 0 4px rgba(37,99,235,0.2)' : 'none' }}>
                                <step.icon size={16} />
                              </div>
                              <div style={{ paddingTop:6 }}>
                                <p style={{ margin:0, fontWeight: current ? 700 : 500, color: done||current ? 'var(--navy)' : 'var(--gray-400)', fontSize:'0.95rem' }}>{step.label}</p>
                                {i === 0 && <p style={{ margin:0, fontSize:'0.8rem', color:'var(--gray-400)', marginTop:2 }}>{formatTimeAgo(dateVal)}</p>}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ flex:1 }}>
                    <h3 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.1rem', color:'var(--navy)', marginBottom:'1rem' }}>
                      {isInvoiceReturn ? 'Return Notes' : 'Invoice Info'}
                    </h3>
                    <div style={{ border:'1px solid var(--dash-border)', borderRadius:16, padding:'1rem', display:'grid', gap:'0.7rem' }}>
                      <KVRow label="Created On" value={formatDate(dateVal)} />
                      <KVRow label="Created By" value={order.createdBy} />
                      {isInvoiceReturn && <KVRow label="Linked Invoice" value={order.invoiceNumber || order.linkedInvoiceId || order.linked_invoice_number} />}
                      {isInvoiceReturn && <KVRow label="Return Type"   value={order.invoiceType || order.invoice_type || 'Normal'} />}
                      {/* Return Description / Notes */}
                      {(order.return_description || order.returnDescription || order.description || order.notes) && (
                        <div style={{ marginTop:'0.4rem', paddingTop:'0.8rem', borderTop:'1px solid var(--dash-border)' }}>
                          <p style={{ margin:'0 0 0.35rem', fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', color:'var(--gray-400)' }}>
                            {isInvoiceReturn ? 'Return Description' : 'Notes'}
                          </p>
                          <p style={{ margin:0, fontSize:'0.86rem', color:'var(--navy)', lineHeight:1.5 }}>
                            {order.return_description || order.returnDescription || order.description || order.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Print footer */}
            <div className="print-only" style={{ display:'none', padding:'2rem 1.5rem', textAlign:'center', borderTop:'1px solid var(--dash-border)', marginTop:'2rem' }}>
              <p style={{ fontWeight:700, fontSize:'1.2rem', margin:'0 0 0.5rem' }}>Thank you for choosing MedSense Pharmacy</p>
              <p style={{ color:'var(--gray-600)', margin:0 }}>MedSense Pharmacy | +92 300 1234567 | info@medsense.ai</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
