// Storefront Refund Page — customer can view eligible orders and submit return requests (14-day rule)
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getCustomerOrders } from '../../services/storefrontOrderService';
import axios from 'axios';
import {
  Package, RotateCcw, CheckCircle, Clock, XCircle,
  ChevronDown, ChevronUp, AlertCircle, ArrowLeft, Loader2
} from 'lucide-react';

const API = 'http://localhost:5005/api';

function daysSince(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

function RefundStatusBadge({ status }) {
  const map = {
    pending:  { bg: 'rgba(245,158,11,0.15)', color: '#b45309', icon: <Clock size={13}/>,        label: 'Refund Pending' },
    refunded: { bg: 'rgba(16,185,129,0.15)',  color: '#047857', icon: <CheckCircle size={13}/>, label: 'Refunded'       },
    rejected: { bg: 'rgba(220,38,38,0.15)',   color: '#b91c1c', icon: <XCircle size={13}/>,     label: 'Rejected'       },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:999, background:s.bg, color:s.color, fontSize:'0.75rem', fontWeight:700 }}>
      {s.icon}{s.label}
    </span>
  );
}

export default function RefundPage() {
  const { user } = useAuth();

  // orders eligible for return
  const [orders,        setOrders]        = useState([]);
  const [myReturns,     setMyReturns]     = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingReturns,setLoadingReturns]= useState(true);
  const [activeTab,     setActiveTab]     = useState('new');   // 'new' | 'history'

  // per-order expand/return state
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [returnQtys,    setReturnQtys]    = useState({});      // { [invoiceId_productId]: qty }
  const [returnReason,  setReturnReason]  = useState({});      // { [invoiceId]: string }
  const [submitting,    setSubmitting]    = useState(null);    // invoiceId being submitted
  const [success,       setSuccess]       = useState(null);    // returnNumber after success
  const [error,         setError]         = useState(null);

  const authHeader = user?.token ? { Authorization: `Bearer ${user.token}` } : {};

  // ── fetch orders ───────────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    if (!user) { setLoadingOrders(false); return; }
    setLoadingOrders(true);
    try {
      const res  = await getCustomerOrders(user.id, user.email, user.phone);
      const raw  = res.data?.orders || [];
      // Only delivered orders placed within 14 days, not already returned
      const eligible = raw.filter(o =>
        o.delivery_status === 'delivered' &&
        daysSince(o.created_at) <= 14
      );
      // Fetch items for each eligible order
      const withItems = await Promise.all(eligible.map(async o => {
        try {
          const r = await axios.get(`${API}/orders/${o.invoice_id}`);
          return { ...o, items: r.data?.data?.items || [] };
        } catch { return { ...o, items: [] }; }
      }));
      setOrders(withItems);
    } catch { setOrders([]); }
    finally { setLoadingOrders(false); }
  }, [user]);

  // ── fetch existing returns ─────────────────────────────────────────────────
  const loadReturns = useCallback(async () => {
    if (!user?.token) { setLoadingReturns(false); return; }
    setLoadingReturns(true);
    try {
      const res = await axios.get(`${API}/invoice/customer-returns`, { headers: authHeader });
      setMyReturns(res.data?.data || []);
    } catch { setMyReturns([]); }
    finally { setLoadingReturns(false); }
  }, [user]);

  useEffect(() => { loadOrders(); loadReturns(); }, [loadOrders, loadReturns]);

  // ── helpers ────────────────────────────────────────────────────────────────
  const qtyKey  = (invoiceId, productId) => `${invoiceId}_${productId}`;
  const getQty  = (invoiceId, productId) => returnQtys[qtyKey(invoiceId, productId)] || 0;
  const setQty  = (invoiceId, productId, val, max) => {
    const v = Math.max(0, Math.min(Number(val), max));
    setReturnQtys(p => ({ ...p, [qtyKey(invoiceId, productId)]: v }));
  };

  const hasSelection = (order) =>
    (order.items || []).some(it => getQty(order.invoice_id, it.product_id || it.productId) > 0);

  const returnTotal = (order) =>
    (order.items || []).reduce((s, it) => {
      const qty = getQty(order.invoice_id, it.product_id || it.productId);
      return s + qty * Number(it.unit_price || it.unitPrice || 0);
    }, 0);

  // ── submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (order) => {
    const items = (order.items || [])
      .map(it => ({
        productId:   it.product_id  || it.productId,
        name:        it.product_title || it.name,
        qty:         getQty(order.invoice_id, it.product_id || it.productId),
        unitPrice:   Number(it.unit_price || it.unitPrice || 0),
        purchasePrice: Number(it.purchase_price || it.purchasePrice || 0),
      }))
      .filter(it => it.qty > 0);

    if (items.length === 0) { setError('Select at least one item to return.'); return; }

    setError(null);
    setSubmitting(order.invoice_id);
    try {
      const res = await axios.post(`${API}/invoice/customer-return`, {
        linkedInvoiceId: order.invoice_id,
        items,
        description: returnReason[order.invoice_id] || 'Customer return request',
      }, { headers: authHeader });
      setSuccess(res.data.data?.returnNumber);
      setActiveTab('history');
      await loadOrders();
      await loadReturns();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to submit return. Please try again.');
    } finally {
      setSubmitting(null);
    }
  };

  // ── already-returned invoice IDs ───────────────────────────────────────────
  const returnedInvoiceIds = new Set(myReturns.map(r => String(r.linked_invoice_id)));

  // ── UI ─────────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="storefront-shell">
        <div className="sf-card sf-section-card" style={{ textAlign:'center', padding:'3rem 1rem' }}>
          <RotateCcw size={48} color="var(--sf-muted)" style={{ margin:'0 auto 1rem', display:'block' }}/>
          <h2>Returns & Refunds</h2>
          <p className="sf-muted">Sign in to request a return or view your refund history.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="storefront-shell">
      {/* ── Page header ── */}
      <div className="sf-card sf-section-card" style={{ marginBottom:'1.25rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'0.25rem' }}>
          <Link to="/orders" style={{ color:'var(--sf-muted)', display:'flex', alignItems:'center', gap:4, fontSize:'0.82rem', textDecoration:'none' }}>
            <ArrowLeft size={14}/> Back to Orders
          </Link>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          <RotateCcw size={28} color="var(--sf-primary)"/>
          <div>
            <h1 style={{ margin:0, fontFamily:'var(--font-display)', fontSize:'1.5rem', fontWeight:800 }}>Returns &amp; Refunds</h1>
            <p className="sf-muted" style={{ margin:0, fontSize:'0.85rem' }}>Returns accepted within <strong>14 days</strong> of delivery</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:'0.5rem', marginTop:'1.25rem', borderBottom:'2px solid var(--sf-border)' }}>
          {[{ id:'new', label:'Request Return' }, { id:'history', label:`My Returns (${myReturns.length})` }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding:'0.55rem 1.1rem', border:'none', background:'none', fontWeight:700, fontSize:'0.85rem', cursor:'pointer',
                color: activeTab===tab.id ? 'var(--sf-primary)' : 'var(--sf-muted)',
                borderBottom: activeTab===tab.id ? '2px solid var(--sf-primary)' : '2px solid transparent',
                marginBottom:'-2px', transition:'all 0.15s' }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Success banner ── */}
      {success && (
        <div style={{ background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.4)', borderRadius:12, padding:'1rem 1.25rem', marginBottom:'1rem', display:'flex', alignItems:'center', gap:'0.75rem' }}>
          <CheckCircle size={22} color="#059669"/>
          <div>
            <strong style={{ color:'#047857', display:'block' }}>Return submitted — {success}</strong>
            <span style={{ fontSize:'0.82rem', color:'#065f46' }}>Your refund will be processed within 3–5 business days.</span>
          </div>
          <button onClick={() => setSuccess(null)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'#047857', fontWeight:700 }}>✕</button>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div style={{ background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.3)', borderRadius:12, padding:'1rem 1.25rem', marginBottom:'1rem', display:'flex', alignItems:'center', gap:'0.75rem' }}>
          <AlertCircle size={20} color="#dc2626"/>
          <span style={{ fontSize:'0.85rem', color:'#b91c1c' }}>{error}</span>
          <button onClick={() => setError(null)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'#b91c1c', fontWeight:700 }}>✕</button>
        </div>
      )}

      {/* ══════════════════ TAB: REQUEST RETURN ══════════════════ */}
      {activeTab === 'new' && (
        <div>
          {loadingOrders ? (
            <div style={{ textAlign:'center', padding:'3rem' }}>
              <Loader2 size={32} color="var(--sf-primary)" style={{ animation:'spin 1s linear infinite', margin:'0 auto 0.75rem', display:'block' }}/>
              <p className="sf-muted">Loading eligible orders…</p>
            </div>
          ) : orders.filter(o => !returnedInvoiceIds.has(String(o.invoice_id))).length === 0 ? (
            <div className="sf-card sf-section-card" style={{ textAlign:'center', padding:'3rem 1rem' }}>
              <Package size={48} color="var(--sf-muted)" style={{ margin:'0 auto 1rem', display:'block', opacity:0.4 }}/>
              <h3 style={{ marginBottom:'0.5rem' }}>No Eligible Orders</h3>
              <p className="sf-muted" style={{ fontSize:'0.9rem', maxWidth:360, margin:'0 auto' }}>
                Only delivered orders placed within the last 14 days are eligible for return.
              </p>
              <Link to="/orders" style={{ display:'inline-block', marginTop:'1rem' }} className="sf-button">View All Orders</Link>
            </div>
          ) : (
            <div style={{ display:'grid', gap:'1rem' }}>
              {orders
                .filter(o => !returnedInvoiceIds.has(String(o.invoice_id)))
                .map(order => {
                  const days     = daysSince(order.created_at);
                  const daysLeft = 14 - days;
                  const isOpen   = expandedOrder === order.invoice_id;
                  const total    = returnTotal(order);

                  return (
                    <article key={order.invoice_id} className="sf-card" style={{ borderRadius:16, overflow:'hidden', border:'2px solid var(--sf-border)' }}>
                      {/* Order header */}
                      <div
                        onClick={() => setExpandedOrder(isOpen ? null : order.invoice_id)}
                        style={{ padding:'1.1rem 1.25rem', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--sf-surface)' }}
                      >
                        <div>
                          <strong style={{ display:'block', fontSize:'1rem' }}>Order {order.invoice_number}</strong>
                          <span className="sf-muted" style={{ fontSize:'0.82rem' }}>
                            {new Date(order.created_at).toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' })}
                            &nbsp;·&nbsp;PKR {parseFloat(order.total_amount).toLocaleString()}
                            &nbsp;·&nbsp;{order.items?.length || 0} item(s)
                          </span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                          <span style={{
                            padding:'3px 10px', borderRadius:999, fontSize:'0.72rem', fontWeight:700,
                            background: daysLeft <= 3 ? 'rgba(220,38,38,0.12)' : 'rgba(16,185,129,0.12)',
                            color:       daysLeft <= 3 ? '#b91c1c' : '#047857'
                          }}>
                            {daysLeft} day{daysLeft!==1?'s':''} left
                          </span>
                          {isOpen ? <ChevronUp size={18} color="var(--sf-muted)"/> : <ChevronDown size={18} color="var(--sf-muted)"/>}
                        </div>
                      </div>

                      {/* Expanded: item selection */}
                      {isOpen && (
                        <div style={{ padding:'1.25rem', borderTop:'1px solid var(--sf-border)', background:'var(--sf-surface-alt)' }}>
                          <p style={{ fontWeight:700, fontSize:'0.85rem', marginBottom:'0.75rem', color:'var(--sf-text)' }}>
                            Select items to return:
                          </p>
                          <div style={{ display:'grid', gap:'0.65rem', marginBottom:'1rem' }}>
                            {(order.items || []).map((item, idx) => {
                              const pid  = item.product_id || item.productId;
                              const qty  = getQty(order.invoice_id, pid);
                              const maxQ = Number(item.quantity);
                              return (
                                <div key={idx} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.75rem 1rem', background:'white', borderRadius:10, border:'1px solid var(--sf-border)', gap:'0.5rem', flexWrap:'wrap' }}>
                                  <div style={{ flex:1 }}>
                                    <strong style={{ display:'block', fontSize:'0.88rem' }}>{item.product_title || item.name}</strong>
                                    <span className="sf-muted" style={{ fontSize:'0.78rem' }}>
                                      PKR {Number(item.unit_price || item.unitPrice || 0).toLocaleString()} × {maxQ} ordered
                                    </span>
                                  </div>
                                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                    <span className="sf-muted" style={{ fontSize:'0.75rem' }}>Return qty:</span>
                                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                      <button onClick={() => setQty(order.invoice_id, pid, qty-1, maxQ)}
                                        style={{ width:28, height:28, borderRadius:6, border:'1px solid var(--sf-border)', background:'white', cursor:'pointer', fontWeight:700, fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
                                      <input type="number" min={0} max={maxQ} value={qty}
                                        onChange={e => setQty(order.invoice_id, pid, e.target.value, maxQ)}
                                        style={{ width:44, textAlign:'center', border:'1px solid var(--sf-border)', borderRadius:6, padding:'4px', fontSize:'0.88rem' }}/>
                                      <button onClick={() => setQty(order.invoice_id, pid, qty+1, maxQ)}
                                        style={{ width:28, height:28, borderRadius:6, border:'1px solid var(--sf-border)', background:'white', cursor:'pointer', fontWeight:700, fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                                    </div>
                                    <span style={{ fontSize:'0.78rem', color: qty>0?'#047857':'var(--sf-muted)', fontWeight:700, minWidth:50, textAlign:'right' }}>
                                      {qty>0 ? `PKR ${(qty * Number(item.unit_price||item.unitPrice||0)).toLocaleString()}` : '—'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Reason */}
                          <div style={{ marginBottom:'1rem' }}>
                            <label style={{ display:'block', fontWeight:700, fontSize:'0.82rem', marginBottom:'0.35rem', color:'var(--sf-text)' }}>
                              Reason for return <span style={{ color:'#dc2626' }}>*</span>
                            </label>
                            <textarea
                              value={returnReason[order.invoice_id] || ''}
                              onChange={e => setReturnReason(p => ({ ...p, [order.invoice_id]: e.target.value }))}
                              placeholder="e.g. Wrong item, damaged product, changed mind…"
                              rows={2}
                              style={{ width:'100%', padding:'0.6rem 0.75rem', borderRadius:8, border:'1px solid var(--sf-border)', fontSize:'0.85rem', resize:'vertical', boxSizing:'border-box' }}
                            />
                          </div>

                          {/* Summary + submit */}
                          {hasSelection(order) && (
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.75rem 1rem', background:'rgba(79,70,229,0.06)', borderRadius:10, marginBottom:'1rem' }}>
                              <span style={{ fontWeight:700, fontSize:'0.88rem' }}>Refund estimate:</span>
                              <span style={{ fontWeight:800, fontSize:'1rem', color:'var(--sf-primary)' }}>PKR {total.toLocaleString()}</span>
                            </div>
                          )}

                          <button
                            onClick={() => handleSubmit(order)}
                            disabled={!hasSelection(order) || !!submitting || !returnReason[order.invoice_id]?.trim()}
                            style={{
                              width:'100%', padding:'0.8rem', borderRadius:10, border:'none',
                              background: (!hasSelection(order) || !returnReason[order.invoice_id]?.trim()) ? 'var(--sf-border)' : 'var(--sf-primary)',
                              color: (!hasSelection(order) || !returnReason[order.invoice_id]?.trim()) ? 'var(--sf-muted)' : 'white',
                              fontWeight:700, fontSize:'0.92rem', cursor: (!hasSelection(order)||!!submitting) ? 'not-allowed' : 'pointer',
                              display:'flex', alignItems:'center', justifyContent:'center', gap:8
                            }}
                          >
                            {submitting === order.invoice_id
                              ? <><Loader2 size={16} style={{ animation:'spin 1s linear infinite' }}/> Submitting…</>
                              : <><RotateCcw size={16}/> Submit Return Request</>}
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ TAB: RETURN HISTORY ══════════════════ */}
      {activeTab === 'history' && (
        <div>
          {loadingReturns ? (
            <div style={{ textAlign:'center', padding:'3rem' }}>
              <Loader2 size={32} color="var(--sf-primary)" style={{ animation:'spin 1s linear infinite', margin:'0 auto 0.75rem', display:'block' }}/>
              <p className="sf-muted">Loading return history…</p>
            </div>
          ) : myReturns.length === 0 ? (
            <div className="sf-card sf-section-card" style={{ textAlign:'center', padding:'3rem 1rem' }}>
              <RotateCcw size={48} color="var(--sf-muted)" style={{ margin:'0 auto 1rem', display:'block', opacity:0.4 }}/>
              <h3>No Returns Yet</h3>
              <p className="sf-muted" style={{ fontSize:'0.9rem' }}>You haven't submitted any return requests.</p>
            </div>
          ) : (
            <div style={{ display:'grid', gap:'1rem' }}>
              {myReturns.map(ret => (
                <article key={ret.return_id} style={{ background:'var(--sf-surface)', border:'2px solid var(--sf-border)', borderRadius:16, padding:'1.25rem' }}>
                  {/* Header */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.85rem', paddingBottom:'0.85rem', borderBottom:'1px solid var(--sf-border)' }}>
                    <div>
                      <strong style={{ display:'block', fontSize:'1rem' }}>{ret.return_number}</strong>
                      <span className="sf-muted" style={{ fontSize:'0.8rem' }}>
                        Linked to {ret.linked_invoice_number} &nbsp;·&nbsp;
                        {new Date(ret.created_at).toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' })}
                      </span>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <strong style={{ display:'block', color:'var(--sf-primary)', fontSize:'1rem' }}>PKR {Number(ret.total_amount || 0).toLocaleString()}</strong>
                      <div style={{ marginTop:4 }}><RefundStatusBadge status={ret.refund_status}/></div>
                    </div>
                  </div>

                  {/* Items */}
                  <div style={{ marginBottom:'0.75rem' }}>
                    <p style={{ fontWeight:700, fontSize:'0.8rem', color:'var(--sf-muted)', marginBottom:'0.5rem', textTransform:'uppercase', letterSpacing:'0.04em' }}>Returned Items</p>
                    <div style={{ display:'grid', gap:'0.4rem' }}>
                      {(ret.items || []).map((it, idx) => (
                        <div key={idx} style={{ display:'flex', justifyContent:'space-between', padding:'0.5rem 0.75rem', background:'var(--sf-surface-alt)', borderRadius:8, fontSize:'0.85rem' }}>
                          <span>{it.product_name} × {it.quantity}</span>
                          <span style={{ fontWeight:600 }}>PKR {Number(it.total_price).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Reason */}
                  {ret.return_description && (
                    <p style={{ fontSize:'0.82rem', color:'var(--sf-muted)', fontStyle:'italic', margin:0 }}>
                      "{ret.return_description}"
                    </p>
                  )}

                  {/* Status info */}
                  {ret.refund_status === 'pending' && (
                    <div style={{ marginTop:'0.75rem', padding:'0.65rem 0.85rem', background:'rgba(245,158,11,0.08)', borderRadius:8, fontSize:'0.8rem', color:'#92400e' }}>
                      ⏳ Your refund is being processed. Expected within 3–5 business days.
                    </div>
                  )}
                  {ret.refund_status === 'refunded' && (
                    <div style={{ marginTop:'0.75rem', padding:'0.65rem 0.85rem', background:'rgba(16,185,129,0.08)', borderRadius:8, fontSize:'0.8rem', color:'#065f46' }}>
                      ✓ Refund has been completed. Amount credited to your account.
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
