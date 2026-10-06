import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import {
  AlertCircle, CheckCircle, DollarSign, Edit3, Loader2,
  Plus, Power, RefreshCw, Search, Trash2, Truck, X
} from 'lucide-react';
import SupplierMasterModal from '../../components/modals/SupplierMasterModal';
import {
  createSupplier, deleteSupplier, listSuppliers,
  toggleSupplierStatus, updateSupplier
} from '../../services/supplierService';
import api from '../../services/api';
import { listProducts } from '../../services/productService';
import { formatDate } from '../../utils/formatters';

// ── helpers ─────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  return (
    <div style={{ position:'fixed', top:'1.5rem', right:'1.5rem', zIndex:10000, minWidth:320, maxWidth:480,
      background:'white', borderRadius:12, border:`2px solid ${type==='error'?'#ef4444':'#10b981'}`,
      boxShadow:'0 10px 40px rgba(0,0,0,0.15)', padding:'1rem 1.25rem',
      display:'flex', alignItems:'center', gap:'0.75rem' }}>
      {type==='error' ? <AlertCircle size={22} color="#ef4444"/> : <CheckCircle size={22} color="#10b981"/>}
      <span style={{ flex:1, fontSize:'0.88rem', fontWeight:500, color:'var(--navy)' }}>{msg}</span>
      <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray-400)' }}>
        <X size={18}/>
      </button>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background:'white', borderRadius:16, border:'1px solid var(--dash-border)', padding:'1.25rem 1.5rem' }}>
      <div style={{ fontSize:'0.72rem', fontWeight:600, textTransform:'uppercase', color:'var(--gray-400)', marginBottom:'0.5rem' }}>{label}</div>
      <div style={{ fontSize:'1.6rem', fontWeight:800, color }}>{value}</div>
    </div>
  );
}

// ── supplier list item (shared between payment + refund panels) ──
function SupplierListItem({ s, selected, onClick, mode }) {
  const bal     = Number(s.currentBalance  || 0);
  const refPend = Number(s.refundPending   || 0);
  const isPayable      = bal > 0;
  const isRefundDue    = refPend > 0;   // goods returned, cash not yet received
  const isClear        = !isPayable && !isRefundDue;

  const statusColor = isPayable ? '#d97706' : isRefundDue ? '#7c3aed' : '#059669';
  const statusLabel = isPayable
    ? `Payable: PKR ${bal.toLocaleString()}`
    : isRefundDue
    ? `Refund Due: PKR ${refPend.toLocaleString()}`
    : 'Clear';

  const clickable = mode === 'payment' ? isPayable : mode === 'refund' ? isRefundDue : true;
  const accentColor = mode === 'payment' ? 'var(--navy)' : '#7c3aed';

  return (
    <button
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      style={{
        display:'flex', flexDirection:'column', width:'100%', padding:'0.85rem 1rem',
        border:'none', borderBottom:'1px solid var(--dash-border)',
        background: selected ? 'var(--dash-bg)' : 'white',
        cursor: clickable ? 'pointer' : 'default',
        textAlign:'left', opacity: clickable ? 1 : 0.45,
        borderLeft: selected ? `3px solid ${accentColor}` : '3px solid transparent'
      }}>
      <div style={{ fontWeight:700, color:'var(--navy)', fontSize:'0.84rem' }}>{s.name}</div>
      <div style={{ fontSize:'0.72rem', color: statusColor, fontWeight:600 }}>
        {statusLabel}
        {isClear && <span style={{ marginLeft:6, background:'rgba(16,185,129,0.12)', color:'#059669', borderRadius:999, padding:'1px 7px', fontSize:'0.68rem', fontWeight:700 }}>✓ Clear</span>}
      </div>
    </button>
  );
}

// ── main component ───────────────────────────────────────────────
export default function SupplierManagement() {
  const [surface,   setSurface]   = useState('master');
  const [suppliers, setSuppliers] = useState([]);
  const [supWithAcc,setSupWithAcc]= useState([]);
  const [products,  setProducts]  = useState([]);
  const [stats,     setStats]     = useState({ totalSuppliers:0, totalPayable:0, totalPayments:0 });
  const [search,    setSearch]    = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [toast,     setToast]     = useState(null);

  // Master modal
  const [isOpen,  setIsOpen]  = useState(false);
  const [editing, setEditing] = useState(null);

  // Ledger panel
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [ledgerEntries,    setLedgerEntries]     = useState([]);
  const [ledgerLoading,    setLedgerLoading]     = useState(false);

  // Payment
  const [paySupplier, setPaySupplier] = useState(null);
  const [payForm,     setPayForm]     = useState({ amount:'', description:'', referenceNumber:'' });
  const [payLoading,  setPayLoading]  = useState(false);

  // Refund
  const [refundSupplier, setRefundSupplier] = useState(null);
  const [refundForm,     setRefundForm]     = useState({ amount:'', description:'', referenceNumber:'' });
  const [refundLoading,  setRefundLoading]  = useState(false);

  const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(()=>setToast(null),4000); };

  // ── Data fetching ──────────────────────────────────────────────
  const refreshMaster = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const [list, prodList] = await Promise.all([listSuppliers(), listProducts()]);
      setSuppliers(Array.isArray(list) ? list : (list?.data || []));
      setProducts(prodList);
    } catch(e) { showToast(e.message,'error'); }
    finally { if (!quiet) setIsLoading(false); }
  },[]);

  const refreshAccounts = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const r = await api.get('/suppliers/with-accounts');
      const d = r.data?.data || {};
      setSupWithAcc(d.suppliers || []);
      setStats(d.stats || {});
      setSelectedSupplier(previous => previous
        ? (d.suppliers || []).find(row => row.supplierId === previous.supplierId) || null
        : null);
    } catch(e) { showToast(e.message,'error'); }
    finally { if (!quiet) setIsLoading(false); }
  },[]);

  const refreshLedger = useCallback(async (supplierId) => {
    if (!supplierId) return;
    setLedgerLoading(true);
    try {
      const r = await api.get(`/suppliers/${supplierId}/ledger`);
      setLedgerEntries(r.data?.data || []);
    } catch(e) { showToast(e.message,'error'); }
    finally { setLedgerLoading(false); }
  },[]);

  useEffect(() => {
    if (surface === 'master') refreshMaster();
    if (['accounts','ledger','payment','refund'].includes(surface)) {
      refreshAccounts();
    }
  },[surface, refreshMaster, refreshAccounts]);
  useLiveDataRefresh(async () => {
    if (surface === 'master') await refreshMaster(true);
    else await refreshAccounts(true);
    if (surface === 'ledger' && selectedSupplier) await refreshLedger(selectedSupplier.supplierId);
  });

  // ── Filtered supplier list ─────────────────────────────────────
  const filtered = useMemo(() => {
    const src = surface === 'master' ? suppliers : supWithAcc;
    return src.filter(s => {
      const hay = [s.name, s.contact, s.city].join(' ').toLowerCase();
      const matchSearch = hay.includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  },[suppliers, supWithAcc, search, statusFilter, surface]);

  // ── Master CRUD ────────────────────────────────────────────────
  const save = async (payload) => {
    try {
      if (editing) { await updateSupplier(editing.id, payload); showToast(`"${payload.name}" updated`); }
      else         { await createSupplier(payload);             showToast(`"${payload.name}" created`); }
      setEditing(null); refreshMaster();
    } catch(e) { showToast(e.response?.data?.message||e.message,'error'); throw e; }
  };
  const toggle = async (s) => { try { await toggleSupplierStatus(s.id); showToast('Status updated'); refreshMaster(); } catch(e) { showToast(e.message,'error'); } };
  const remove = async (s) => {
    if (!window.confirm(`Delete ${s.name}?`)) return;
    try { await deleteSupplier(s.id); showToast(`"${s.name}" deleted`); refreshMaster(); } catch(e) { showToast(e.message,'error'); }
  };

  // ── Payment submit ─────────────────────────────────────────────
  const handlePaySubmit = async (e) => {
    e.preventDefault();
    if (!paySupplier || !payForm.amount || Number(payForm.amount)<=0) { showToast('Select a supplier and enter valid amount','error'); return; }
    setPayLoading(true);
    try {
      await api.post(`/suppliers/${paySupplier.supplierId||paySupplier.id}/payment`, {
        amount: Number(payForm.amount), description: payForm.description, referenceNumber: payForm.referenceNumber||undefined
      });
      showToast('Payment recorded successfully');
      setPayForm({ amount:'', description:'', referenceNumber:'' });
      setPaySupplier(null);
      refreshAccounts();
    } catch(e) { showToast(e.response?.data?.message||e.message,'error'); }
    finally { setPayLoading(false); }
  };

  // ── Refund submit ──────────────────────────────────────────────
  const handleRefundSubmit = async (e) => {
    e.preventDefault();
    if (!refundSupplier || !refundForm.amount || Number(refundForm.amount)<=0) { showToast('Select a supplier and enter valid refund amount','error'); return; }
    setRefundLoading(true);
    try {
      await api.post(`/suppliers/${refundSupplier.supplierId||refundSupplier.id}/refund`, {
        amount: Number(refundForm.amount), description: refundForm.description, referenceNumber: refundForm.referenceNumber||undefined
      });
      showToast('Refund recorded successfully');
      setRefundForm({ amount:'', description:'', referenceNumber:'' });
      // Refresh accounts list first
      const r = await api.get('/suppliers/with-accounts');
      const d = r.data?.data || {};
      const freshList = d.suppliers || [];
      setSupWithAcc(freshList);
      setStats(d.stats || {});
      // Keep refundSupplier selected but with fresh data so UI updates immediately
      const freshSupplier = freshList.find(s => (s.supplierId||s.id) === (refundSupplier.supplierId||refundSupplier.id));
      if (freshSupplier) setRefundSupplier(freshSupplier);
      else setRefundSupplier(null);
    } catch(e) { showToast(e.response?.data?.message||e.message,'error'); }
    finally { setRefundLoading(false); }
  };

  // ── Surfaces ───────────────────────────────────────────────────
  const surfaces = [
    { id:'master',   label:'Supplier Master' },
    { id:'accounts', label:'Supplier Accounts' },
    { id:'ledger',   label:'Supplier Ledger' },
    { id:'payment',  label:'Record Payment' },
    { id:'refund',   label:'Receive Refund' },
  ];

  const baseFieldStyle = { width:'100%', padding:'0.72rem 0.9rem', borderRadius:10,
    border:'1px solid var(--dash-border)', background:'white', fontSize:'0.84rem', outline:'none', boxSizing:'border-box' };

  // ── Shared: supplier panel + form layout ───────────────────────
  const renderSupplierPanel = (mode) => (
    <div style={{ background:'white', borderRadius:'var(--dash-radius)', border:'1px solid var(--dash-border)', overflow:'hidden', maxHeight:680 }}>
      <div style={{ padding:'1rem', borderBottom:'1px solid var(--dash-border)', fontWeight:700, color:'var(--navy)' }}>
        {mode==='payment' ? 'Suppliers' : 'Suppliers'}
      </div>
      <div style={{ overflowY:'auto', maxHeight:630 }}>
        {supWithAcc.length===0
          ? <div style={{ padding:'2rem', textAlign:'center', color:'var(--gray-400)', fontSize:'0.82rem' }}>No suppliers found</div>
          : supWithAcc.map(s => (
            <SupplierListItem
              key={s.supplierId}
              s={s}
              mode={mode}
              selected={mode==='payment' ? paySupplier?.supplierId===s.supplierId : refundSupplier?.supplierId===s.supplierId}
              onClick={() => mode==='payment' ? setPaySupplier(s) : setRefundSupplier(s)}
            />
          ))
        }
      </div>
    </div>
  );

  return (
    <div style={{ padding:'1.5rem', width:'100%', maxWidth:1600, margin:'0 auto' }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem', gap:'1rem', flexWrap:'wrap' }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.6rem', color:'var(--navy)', marginBottom:2 }}>Supplier Management</h1>
          <p style={{ fontSize:'0.78rem', color:'var(--gray-400)', margin:0 }}>Manage suppliers, accounts, ledger, payments and refunds</p>
        </div>
        <div style={{ display:'flex', gap:'0.75rem' }}>
          {surface==='master' && (
            <button onClick={()=>{ setEditing(null); setIsOpen(true); }}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'0.55rem 1rem', borderRadius:999, border:'none', background:'var(--navy)', color:'white', fontSize:'0.82rem', fontWeight:700, cursor:'pointer' }}>
              <Plus size={15}/> Add Supplier
            </button>
          )}
          {surface==='payment' && (
            <button onClick={()=>{ setPaySupplier(null); setPayForm({amount:'',description:'',referenceNumber:''}); }}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'0.55rem 1rem', borderRadius:999, border:'none', background:'#10b981', color:'white', fontSize:'0.82rem', fontWeight:700, cursor:'pointer' }}>
              <DollarSign size={15}/> New Payment
            </button>
          )}
          {surface==='refund' && (
            <button onClick={()=>{ setRefundSupplier(null); setRefundForm({amount:'',description:'',referenceNumber:''}); }}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'0.55rem 1rem', borderRadius:999, border:'none', background:'#7c3aed', color:'white', fontSize:'0.82rem', fontWeight:700, cursor:'pointer' }}>
              <DollarSign size={15}/> New Refund
            </button>
          )}
          <button onClick={()=>surface==='master'?refreshMaster():refreshAccounts()}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'0.5rem 1rem', borderRadius:999, border:'1px solid var(--dash-border)', background:'white', color:'var(--navy)', fontSize:'0.82rem', fontWeight:600, cursor:'pointer' }}>
            {isLoading ? <Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/> : <RefreshCw size={14}/>}
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'1rem' }}>
        {surfaces.map(btn => (
          <button key={btn.id} onClick={()=>setSurface(btn.id)}
            style={{ padding:'0.56rem 1rem', borderRadius:999, border:'1px solid var(--dash-border)',
              background: surface===btn.id ? 'var(--navy)' : 'white',
              color: surface===btn.id ? 'white' : 'var(--gray-600)',
              fontSize:'0.82rem', fontWeight:700, cursor:'pointer' }}>
            {btn.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      {(surface==='accounts'||surface==='ledger') && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
          <StatCard label="Suppliers"     value={stats.totalSuppliers||supWithAcc.length}                                                       color="#1d4ed8"/>
          <StatCard label="Total Payable" value={`PKR ${Number(stats.totalPayable||0).toLocaleString()}`}                                       color="#f59e0b"/>
          <StatCard label="Total Paid"    value={`PKR ${Number(stats.totalPayments||0).toLocaleString()}`}                                      color="#10b981"/>
          <StatCard label="Outstanding"   value={`PKR ${Math.max(0,Number(stats.totalPayable||0)-Number(stats.totalPayments||0)).toLocaleString()}`} color="#dc2626"/>
        </div>
      )}

      {/* Search + filter */}
      {(surface==='master'||surface==='accounts') && (
        <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', flexWrap:'wrap' }}>
          <div style={{ position:'relative', flex:1, minWidth:220 }}>
            <Search size={16} style={{ position:'absolute', left:10, top:11, color:'var(--gray-400)' }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, contact, city..." style={{ ...baseFieldStyle, paddingLeft:34 }}/>
          </div>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{ ...baseFieldStyle, width:150 }}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      )}

      {/* ════ TAB 1: Master ════ */}
      {surface==='master' && (
        <div style={{ background:'white', borderRadius:'var(--dash-radius)', border:'1px solid var(--dash-border)', overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
              <thead>
                <tr style={{ background:'var(--dash-bg)', borderBottom:'1px solid var(--dash-border)' }}>
                  {['Supplier','Contact','City','Products','Status','Actions'].map(h=>(
                    <th key={h} style={{ padding:'0.875rem 0.75rem', fontSize:'0.72rem', fontWeight:600, color:'var(--gray-400)', textTransform:'uppercase', textAlign:'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} style={{ padding:'3rem', textAlign:'center', color:'var(--gray-400)' }}>Loading...</td></tr>
                ) : filtered.length===0 ? (
                  <tr><td colSpan={6} style={{ padding:'3rem', textAlign:'center', color:'var(--gray-400)' }}>
                    <Truck size={32} strokeWidth={1} style={{ margin:'0 auto 0.75rem', display:'block', opacity:0.4 }}/>No suppliers found
                  </td></tr>
                ) : filtered.map(s => {
                  const sid = s.id ? parseInt(s.id.toString().replace('sup-','')) : s.supplierId;
                  return (
                    <tr key={s.id||s.supplierId} style={{ borderBottom:'1px solid var(--dash-border)' }}>
                      <td style={{ padding:'0.875rem 0.75rem' }}><p style={{ margin:0, fontWeight:700, fontSize:'0.82rem', color:'var(--navy)' }}>{s.name}</p></td>
                      <td style={{ padding:'0.875rem 0.75rem', fontSize:'0.82rem', color:'var(--gray-600)' }}>{s.contact||'-'}</td>
                      <td style={{ padding:'0.875rem 0.75rem', fontSize:'0.82rem', color:'var(--gray-600)' }}>{s.city||'-'}</td>
                      <td style={{ padding:'0.875rem 0.75rem', fontSize:'0.82rem', color:'var(--gray-600)' }}>{products.filter(p=>p.supplierId===sid).length}</td>
                      <td style={{ padding:'0.875rem 0.75rem' }}>
                        <span style={{ padding:'4px 10px', borderRadius:999, fontSize:'0.72rem', fontWeight:700,
                          background: s.status==='active'?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.12)',
                          color: s.status==='active'?'#059669':'#dc2626', textTransform:'capitalize' }}>{s.status}</span>
                      </td>
                      <td style={{ padding:'0.875rem 0.75rem' }}>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={()=>{ setEditing(s); setIsOpen(true); }} style={{ width:32,height:32,borderRadius:8,border:'1px solid var(--dash-border)',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}><Edit3 size={14}/></button>
                          <button onClick={()=>toggle(s)} style={{ width:32,height:32,borderRadius:8,border:'1px solid var(--dash-border)',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}><Power size={14}/></button>
                          <button onClick={()=>remove(s)} style={{ width:32,height:32,borderRadius:8,border:'1px solid var(--dash-border)',background:'white',color:'#dc2626',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════ TAB 2: Accounts ════ */}
      {surface==='accounts' && (
        <div style={{ background:'white', borderRadius:'var(--dash-radius)', border:'1px solid var(--dash-border)', overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
              <thead>
                <tr style={{ background:'var(--dash-bg)', borderBottom:'1px solid var(--dash-border)' }}>
                  {['Supplier','Total Stock Value','Total Paid','Return Value','Balance','Status','Actions'].map(h=>(
                    <th key={h} style={{ padding:'0.875rem 0.75rem', fontSize:'0.72rem', fontWeight:600, color:'var(--gray-400)', textTransform:'uppercase', textAlign:'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} style={{ padding:'3rem', textAlign:'center', color:'var(--gray-400)' }}>Loading...</td></tr>
                ) : filtered.map(s => {
                  const bal     = Number(s.currentBalance||0);
                  const ret     = Number(s.totalReturn||0);
                  const refPend = Number(s.refundPending||0);
                  const refRecv = Number(s.refundReceived||0);
                  const isPayable   = bal > 0;
                  const isRefundDue = refPend > 0;
                  const isClear     = !isPayable && !isRefundDue;
                  const statusLabel = isPayable ? 'Payable' : isRefundDue ? 'Refund Due' : 'Clear';
                  const statusColor = isPayable ? '#d97706' : isRefundDue ? '#7c3aed' : '#059669';
                  const statusBg    = isPayable ? 'rgba(245,158,11,0.12)' : isRefundDue ? 'rgba(124,58,237,0.12)' : 'rgba(16,185,129,0.12)';
                  return (
                    <tr key={s.supplierId} style={{ borderBottom:'1px solid var(--dash-border)' }}>
                      <td style={{ padding:'0.875rem 0.75rem' }}>
                        <p style={{ margin:0, fontWeight:700, fontSize:'0.82rem', color:'var(--navy)' }}>{s.name}</p>
                        <p style={{ margin:0, fontSize:'0.7rem', color:'var(--gray-400)' }}>{s.contact||'-'}</p>
                      </td>
                      <td style={{ padding:'0.875rem 0.75rem', fontWeight:700, fontSize:'0.9rem', color:'#2563eb' }}>
                        PKR {Number(s.totalDebit||0).toLocaleString()}
                      </td>
                      <td style={{ padding:'0.875rem 0.75rem', fontWeight:700, fontSize:'0.82rem', color:'#10b981' }}>
                        PKR {Number(s.totalCredit||0).toLocaleString()}
                      </td>
                      <td style={{ padding:'0.875rem 0.75rem', fontSize:'0.82rem' }}>
                        {ret > 0 ? (
                          <div>
                            <div style={{ fontWeight:700, color:'#7c3aed' }}>PKR {ret.toLocaleString()}</div>
                            {refRecv > 0 && <div style={{ fontSize:'0.68rem', color:'#10b981' }}>Received: PKR {refRecv.toLocaleString()}</div>}
                            {refPend > 0 && <div style={{ fontSize:'0.68rem', color:'#dc2626' }}>Pending: PKR {refPend.toLocaleString()}</div>}
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ padding:'0.875rem 0.75rem', fontWeight:800, fontSize:'0.88rem',
                        color: isPayable ? '#f59e0b' : '#059669' }}>
                        PKR {bal.toLocaleString()}
                      </td>
                      <td style={{ padding:'0.875rem 0.75rem' }}>
                        <span style={{ padding:'4px 10px', borderRadius:999, fontSize:'0.72rem', fontWeight:700,
                          background: statusBg, color: statusColor }}>
                          {statusLabel}
                        </span>
                      </td>
                      <td style={{ padding:'0.875rem 0.75rem' }}>
                        {isPayable && (
                          <button onClick={()=>{ setPaySupplier(s); setSurface('payment'); }}
                            style={{ padding:'5px 12px', borderRadius:999, border:'none', background:'rgba(245,158,11,0.12)', color:'#d97706', fontSize:'0.74rem', fontWeight:700, cursor:'pointer' }}>
                            Pay
                          </button>
                        )}
                        {isRefundDue && (
                          <button onClick={()=>{ setRefundSupplier(s); setSurface('refund'); }}
                            style={{ padding:'5px 12px', borderRadius:999, border:'none', background:'rgba(124,58,237,0.12)', color:'#7c3aed', fontSize:'0.74rem', fontWeight:700, cursor:'pointer', marginLeft: isPayable ? '4px' : 0 }}>
                            Refund
                          </button>
                        )}
                        {isClear && (
                          <span style={{ fontSize:'0.74rem', color:'#059669', fontWeight:600 }}>✓ Clear</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════ TAB 3: Ledger ════ */}
      {surface==='ledger' && (
        <div style={{ display:'grid', gridTemplateColumns:'300px minmax(0,1fr)', gap:'1rem' }}>
          <div style={{ background:'white', borderRadius:'var(--dash-radius)', border:'1px solid var(--dash-border)', overflow:'hidden', maxHeight:680 }}>
            <div style={{ padding:'1rem', borderBottom:'1px solid var(--dash-border)', fontWeight:700, color:'var(--navy)' }}>Suppliers</div>
            <div style={{ overflowY:'auto', maxHeight:630 }}>
              {supWithAcc.map(s => (
                <SupplierListItem key={s.supplierId} s={s} mode="ledger"
                  selected={selectedSupplier?.supplierId===s.supplierId}
                  onClick={()=>{ setSelectedSupplier(s); refreshLedger(s.supplierId); }}/>
              ))}
            </div>
          </div>
          <div style={{ background:'white', borderRadius:'var(--dash-radius)', border:'1px solid var(--dash-border)', overflow:'hidden' }}>
            {!selectedSupplier ? (
              <div style={{ padding:'4rem', textAlign:'center', color:'var(--gray-400)' }}>
                <Truck size={48} strokeWidth={1} style={{ margin:'0 auto 1rem', display:'block', opacity:0.3 }}/>
                <p style={{ fontWeight:600 }}>Select a supplier to view ledger</p>
              </div>
            ) : (
              <>
                <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid var(--dash-border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:800, color:'var(--navy)', fontSize:'1rem' }}>{selectedSupplier.name}</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--gray-400)' }}>{selectedSupplier.contact||'No contact'}</div>
                  </div>
                  <div style={{ display:'flex', gap:'1.5rem', fontSize:'0.78rem' }}>
                    {[
                      { label:'Total Stock', val:`PKR ${Number(selectedSupplier.totalDebit||0).toLocaleString()}`, color:'#2563eb' },
                      { label:'Paid',        val:`PKR ${Number(selectedSupplier.totalCredit||0).toLocaleString()}`, color:'#10b981' },
                      { label:'Return',      val:`PKR ${Number(selectedSupplier.totalReturn||0).toLocaleString()}`,  color:'#7c3aed' },
                      { label:'Balance',     val: Number(selectedSupplier.currentBalance||0)<0
                          ? `CR: PKR ${Math.abs(Number(selectedSupplier.currentBalance||0)).toLocaleString()}`
                          : `PKR ${Number(selectedSupplier.currentBalance||0).toLocaleString()}`,
                        color: Number(selectedSupplier.currentBalance||0)<0?'#7c3aed':'#f59e0b' },
                    ].map(c=>(
                      <div key={c.label}>
                        <div style={{ color:'var(--gray-400)', fontSize:'0.7rem' }}>{c.label}</div>
                        <div style={{ fontWeight:700, color:c.color }}>{c.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ overflowX:'auto', maxHeight:560, overflowY:'auto' }}>
                  {ledgerLoading ? (
                    <div style={{ padding:'3rem', textAlign:'center', color:'var(--gray-400)' }}>Loading ledger...</div>
                  ) : ledgerEntries.length===0 ? (
                    <div style={{ padding:'3rem', textAlign:'center', color:'var(--gray-400)' }}>No ledger entries yet</div>
                  ) : (
                    <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
                      <thead style={{ position:'sticky', top:0, background:'var(--dash-bg)', zIndex:1 }}>
                        <tr style={{ borderBottom:'1px solid var(--dash-border)' }}>
                          {['Date','Type','Reference','Product','Qty','Price','Debit','Credit','Balance'].map(h=>(
                            <th key={h} style={{ padding:'0.75rem', fontSize:'0.72rem', fontWeight:600, color:'var(--gray-400)', textTransform:'uppercase', textAlign:'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerEntries.map((e,i)=>(
                          <tr key={e.id||i} style={{ borderBottom:'1px solid var(--dash-border)' }}>
                            <td style={{ padding:'0.75rem', fontSize:'0.78rem', color:'var(--gray-600)' }}>{formatDate(e.transactionDate||e.creationDay)}</td>
                            <td style={{ padding:'0.75rem' }}>
                              <span style={{ padding:'3px 8px', borderRadius:999, fontSize:'0.7rem', fontWeight:700,
                                background: e.transactionType==='payment'?'rgba(16,185,129,0.12)':e.transactionType==='stock_return'?'rgba(239,68,68,0.12)':e.transactionType==='refund'?'rgba(124,58,237,0.12)':'rgba(37,99,235,0.12)',
                                color: e.transactionType==='payment'?'#059669':e.transactionType==='stock_return'?'#dc2626':e.transactionType==='refund'?'#7c3aed':'#2563eb',
                                textTransform:'capitalize' }}>
                                {e.transactionType==='stock_receive'?'Stock In':e.transactionType==='payment'?'Payment':e.transactionType==='stock_return'?'Return':e.transactionType==='refund'?'💜 Refund':e.transactionType}
                              </span>
                            </td>
                            <td style={{ padding:'0.75rem', fontSize:'0.78rem', color:'#2563eb', fontWeight:600 }}>{e.referenceNumber||'-'}</td>
                            <td style={{ padding:'0.75rem', fontSize:'0.78rem', color:'var(--gray-600)' }}>{e.productTitle||(e.transactionType==='payment'?'(Cash payment)':e.transactionType==='refund'&&!e.productTitle?'(Refund received)':'-')}</td>
                            <td style={{ padding:'0.75rem', fontSize:'0.78rem', color:'var(--gray-600)' }}>{e.productQuantity||'-'}</td>
                            <td style={{ padding:'0.75rem', fontSize:'0.78rem', color:'var(--gray-600)' }}>{e.productPrice?`PKR ${Number(e.productPrice).toLocaleString()}`:'-'}</td>
                            <td style={{ padding:'0.75rem', fontWeight:700, color:'#dc2626', fontSize:'0.82rem' }}>{e.debitAmount>0?`PKR ${Number(e.debitAmount).toLocaleString()}`:'-'}</td>
                            <td style={{ padding:'0.75rem', fontWeight:700, color:'#10b981', fontSize:'0.82rem' }}>{e.creditAmount>0?`PKR ${Number(e.creditAmount).toLocaleString()}`:'-'}</td>
                            <td style={{ padding:'0.75rem', fontWeight:700, color:Number(e.balance||0)<0?'#7c3aed':'#f59e0b', fontSize:'0.82rem' }}>
                              {Number(e.balance||0)<0?`CR: PKR ${Math.abs(Number(e.balance||0)).toLocaleString()}`:`PKR ${Number(e.balance||0).toLocaleString()}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════ TAB 4: Record Payment ════ */}
      {surface==='payment' && (
        <div style={{ display:'grid', gridTemplateColumns:'300px minmax(0,1fr)', gap:'1rem' }}>
          {renderSupplierPanel('payment')}
          <div style={{ background:'white', borderRadius:'var(--dash-radius)', border:'1px solid var(--dash-border)', overflow:'hidden' }}>
            {!paySupplier ? (
              <div style={{ padding:'4rem', textAlign:'center', color:'var(--gray-400)' }}>
                <DollarSign size={48} strokeWidth={1} style={{ margin:'0 auto 1rem', display:'block', opacity:0.3 }}/>
                <p style={{ fontWeight:600 }}>Select a supplier to record payment</p>
                <p style={{ fontSize:'0.78rem', margin:0 }}>Only suppliers with Payable balance are selectable</p>
              </div>
            ) : (
              <>
                <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid var(--dash-border)' }}>
                  <div style={{ display:'flex', gap:'0.8rem', alignItems:'center', marginBottom:'1rem' }}>
                    <div style={{ width:48,height:48,borderRadius:12,background:'#10b981',color:'white',display:'flex',alignItems:'center',justifyContent:'center' }}><DollarSign size={24}/></div>
                    <div>
                      <h2 style={{ margin:0, fontFamily:'var(--font-display)', fontSize:'1.15rem', fontWeight:800, color:'var(--navy)' }}>{paySupplier.name}</h2>
                      <p style={{ margin:'0.1rem 0 0', fontSize:'0.78rem', color:'var(--gray-400)' }}>{paySupplier.contact||''}</p>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.75rem' }}>
                    {[
                      { label:'Total Stock',  value:`PKR ${Number(paySupplier.totalDebit||0).toLocaleString()}`,                  color:'#2563eb' },
                      { label:'Already Paid', value:`PKR ${Number(paySupplier.totalCredit||0).toLocaleString()}`,                 color:'#10b981' },
                      { label:'Still to Pay', value:`PKR ${Math.max(0,Number(paySupplier.currentBalance||0)).toLocaleString()}`,  color:'#f59e0b' },
                    ].map(c=>(
                      <div key={c.label} style={{ background:'var(--dash-bg)', borderRadius:12, padding:'0.85rem 1rem' }}>
                        <div style={{ fontSize:'0.7rem', color:'var(--gray-400)', fontWeight:600 }}>{c.label}</div>
                        <div style={{ fontSize:'1.1rem', fontWeight:800, color:c.color }}>{c.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <form onSubmit={handlePaySubmit} style={{ padding:'1.5rem', display:'grid', gap:'1.25rem' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                    <div>
                      <label style={{ display:'block', fontSize:'0.76rem', fontWeight:700, color:'var(--gray-600)', marginBottom:'0.35rem' }}>Amount Paid *</label>
                      <input type="number" step="0.01" required value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} placeholder="PKR amount" style={baseFieldStyle}/>
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'0.76rem', fontWeight:700, color:'var(--gray-600)', marginBottom:'0.35rem' }}>Reference No</label>
                      <input type="text" value={payForm.referenceNumber} onChange={e=>setPayForm(p=>({...p,referenceNumber:e.target.value}))} placeholder="e.g. CHQ-001 (optional)" style={baseFieldStyle}/>
                    </div>
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:'0.76rem', fontWeight:700, color:'var(--gray-600)', marginBottom:'0.35rem' }}>Description</label>
                    <input type="text" value={payForm.description} onChange={e=>setPayForm(p=>({...p,description:e.target.value}))} placeholder="Payment note (optional)" style={baseFieldStyle}/>
                  </div>
                  <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem' }}>
                    <button type="button" onClick={()=>setPaySupplier(null)} style={{ padding:'0.72rem 1.2rem', borderRadius:999, border:'1px solid var(--dash-border)', background:'white', color:'var(--navy)', cursor:'pointer', fontWeight:700 }}>Cancel</button>
                    <button type="submit" disabled={payLoading} style={{ padding:'0.72rem 1.2rem', borderRadius:999, border:'none', background:'#10b981', color:'white', cursor:payLoading?'not-allowed':'pointer', fontWeight:700, opacity:payLoading?0.7:1 }}>
                      {payLoading ? 'Recording...' : 'Record Payment'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════ TAB 5: Receive Refund ════ */}
      {surface==='refund' && (
        <div style={{ display:'grid', gridTemplateColumns:'300px minmax(0,1fr)', gap:'1rem' }}>
          {renderSupplierPanel('refund')}
          <div style={{ background:'white', borderRadius:'var(--dash-radius)', border:'1px solid var(--dash-border)', overflow:'hidden' }}>
            {!refundSupplier ? (
              <div style={{ padding:'4rem', textAlign:'center', color:'var(--gray-400)' }}>
                <DollarSign size={48} strokeWidth={1} style={{ margin:'0 auto 1rem', display:'block', opacity:0.3 }}/>
                <p style={{ fontWeight:600 }}>Select a supplier to record refund</p>
                <p style={{ fontSize:'0.78rem', margin:0 }}>Only suppliers with Credit balance are selectable</p>
              </div>
            ) : (
              <>
                <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid var(--dash-border)' }}>
                  <div style={{ display:'flex', gap:'0.8rem', alignItems:'center', marginBottom:'1rem' }}>
                    <div style={{ width:48,height:48,borderRadius:12,background:'#7c3aed',color:'white',display:'flex',alignItems:'center',justifyContent:'center' }}><DollarSign size={24}/></div>
                    <div>
                      <h2 style={{ margin:0, fontFamily:'var(--font-display)', fontSize:'1.15rem', fontWeight:800, color:'var(--navy)' }}>{refundSupplier.name}</h2>
                      <p style={{ margin:'0.1rem 0 0', fontSize:'0.78rem', color:'var(--gray-400)' }}>{refundSupplier.contact||''}</p>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.75rem' }}>
                    {[
                      { label:'Total Returned',   value:`PKR ${Number(refundSupplier.totalReturn||0).toLocaleString()}`,     color:'#7c3aed' },
                      { label:'Refund Received',  value:`PKR ${Number(refundSupplier.refundReceived||0).toLocaleString()}`,   color:'#10b981' },
                      { label:'Refund Pending',   value:`PKR ${Number(refundSupplier.refundPending||0).toLocaleString()}`,    color: Number(refundSupplier.refundPending||0)>0?'#dc2626':'#059669' },
                    ].map(c=>(
                      <div key={c.label} style={{ background:'var(--dash-bg)', borderRadius:12, padding:'0.85rem 1rem' }}>
                        <div style={{ fontSize:'0.7rem', color:'var(--gray-400)', fontWeight:600 }}>{c.label}</div>
                        <div style={{ fontSize:'1.1rem', fontWeight:800, color:c.color }}>{c.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <form onSubmit={handleRefundSubmit} style={{ padding:'1.5rem', display:'grid', gap:'1.25rem' }}>
                  <div style={{ background:'rgba(124,58,237,0.06)', borderRadius:10, padding:'0.75rem 1rem', fontSize:'0.8rem', color:'#5b21b6', fontWeight:500 }}>
                    💜 Supplier owes you PKR {Number(refundSupplier.refundPending||0).toLocaleString()} refund for returned goods.
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                    <div>
                      <label style={{ display:'block', fontSize:'0.76rem', fontWeight:700, color:'var(--gray-600)', marginBottom:'0.35rem' }}>Refund Amount Received *</label>
                      <input type="number" step="0.01" required value={refundForm.amount} onChange={e=>setRefundForm(p=>({...p,amount:e.target.value}))} placeholder={`Max PKR ${Number(refundSupplier.refundPending||0).toLocaleString()}`} style={baseFieldStyle}/>
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'0.76rem', fontWeight:700, color:'var(--gray-600)', marginBottom:'0.35rem' }}>Reference No</label>
                      <input type="text" value={refundForm.referenceNumber} onChange={e=>setRefundForm(p=>({...p,referenceNumber:e.target.value}))} placeholder="e.g. REF-001 (optional)" style={baseFieldStyle}/>
                    </div>
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:'0.76rem', fontWeight:700, color:'var(--gray-600)', marginBottom:'0.35rem' }}>Description</label>
                    <input type="text" value={refundForm.description} onChange={e=>setRefundForm(p=>({...p,description:e.target.value}))} placeholder="Refund note (optional)" style={baseFieldStyle}/>
                  </div>
                  <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem' }}>
                    <button type="button" onClick={()=>setRefundSupplier(null)} style={{ padding:'0.72rem 1.2rem', borderRadius:999, border:'1px solid var(--dash-border)', background:'white', color:'var(--navy)', cursor:'pointer', fontWeight:700 }}>Cancel</button>
                    <button type="submit" disabled={refundLoading} style={{ padding:'0.72rem 1.2rem', borderRadius:999, border:'none', background:'#7c3aed', color:'white', cursor:refundLoading?'not-allowed':'pointer', fontWeight:700, opacity:refundLoading?0.7:1 }}>
                      {refundLoading ? 'Recording...' : '💜 Record Refund'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

    <SupplierMasterModal
      isOpen={isOpen}
      supplier={editing}
      onClose={()=>{ setIsOpen(false); setEditing(null); }}
      onSubmit={save}
    />
    </div>
  );
}
