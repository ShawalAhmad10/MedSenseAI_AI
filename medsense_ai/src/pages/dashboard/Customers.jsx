import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight, DollarSign, Edit, Eye, Loader2, RefreshCw,
  RotateCcw, Save, Search, TrendingDown, UserPlus,
} from 'lucide-react';
import {
  createCustomer, listCustomers, updateCustomer,
} from '../../services/customerService';
import AddCustomerModal from '../../components/modals/AddCustomerModal';
import { formatDate, formatTimeAgo } from '../../utils/formatters';
import api from '../../services/api';

/* ─── Tiny shared components ─────────────────────────────────── */
function StatCard({ label, value, color }) {
  return (
    <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', padding: '1.25rem', border: '1px solid var(--dash-border)' }}>
      <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', margin: '0 0 0.5rem' }}>{label}</p>
      <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color, margin: 0 }}>{value}</p>
    </div>
  );
}

function Btn({ onClick, label = 'View', icon: Icon = Eye, color = 'var(--navy)', bg = 'white' }) {
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.48rem 0.8rem', borderRadius: 999, border: '1px solid var(--dash-border)', background: bg, color, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
      <Icon size={14} />{label}
    </button>
  );
}

function StatusBadge({ value }) {
  const active = value === 'active';
  return (
    <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: active ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: active ? '#059669' : '#dc2626', textTransform: 'capitalize' }}>
      {value || 'active'}
    </span>
  );
}

/* transaction_type badge */
function TxBadge({ type }) {
  const cfg = {
    payment:         { bg: 'rgba(16,185,129,0.12)',  color: '#059669', label: 'Payment ↓'   },
    invoice:         { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626', label: 'Invoice ↑'   },
    opening_balance: { bg: 'rgba(99,102,241,0.12)',  color: '#4f46e5', label: 'Opening'     },
    refund:          { bg: 'rgba(245,158,11,0.12)',  color: '#d97706', label: 'Refund ↓'    },
  }[type] || { bg: 'var(--dash-bg)', color: 'var(--navy)', label: type || '—' };
  return (
    <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

const fieldStyle = {
  width: '100%', padding: '0.72rem 0.9rem', borderRadius: 10,
  border: '1px solid var(--dash-border)', background: 'white',
  fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box',
};

/* ─── Main Component ─────────────────────────────────────────── */
export default function Customers() {
  const [surface, setSurface] = useState('master');
  const [customers, setCustomers]           = useState([]);
  const [stats, setStats]                   = useState({ totalCustomers: 0, activeCustomers: 0, totalReceivable: 0, totalPayments: 0 });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [ledgerEntries, setLedgerEntries]   = useState([]);
  const [search, setSearch]                 = useState('');
  const [isLoading, setIsLoading]           = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [toast, setToast]                   = useState(null);

  /* ── Record Payment form ── */
  const emptyPayment = () => ({
    customerId: '', amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash', referenceNumber: '', notes: '',
    invoiceId: '', invoiceNumber: '',
  });
  const [paymentForm, setPaymentForm]               = useState(emptyPayment());
  const [paymentErrors, setPaymentErrors]           = useState({});
  const [isSavingPayment, setIsSavingPayment]       = useState(false);
  const [selectedPaymentCustomer, setSelectedPaymentCustomer] = useState(null);
  const [deliveredOrders, setDeliveredOrders]       = useState([]); // delivered+unpaid orders for selected customer

  /* ── Refund form ── */
  const emptyRefund = () => ({
    customerId: '', amount: '',
    refundDate: new Date().toISOString().split('T')[0],
    refundMethod: 'cash', referenceNumber: '', reason: '',
  });
  const [refundForm, setRefundForm]     = useState(emptyRefund());
  const [refundErrors, setRefundErrors] = useState({});
  const [isSavingRefund, setIsSavingRefund] = useState(false);
  const [selectedRefundCustomer, setSelectedRefundCustomer] = useState(null);

  /* ─── Toast helper ─── */
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  /* ─── Fetch customers list ─── */
  const refreshCustomers = async () => {
    setIsLoading(true);
    try {
      const data = await listCustomers({ search: '', status: 'all' });
      const freshList = data.customers || [];
      setCustomers(freshList);
      setStats(data.stats || { totalCustomers: 0, activeCustomers: 0, totalReceivable: 0, totalPayments: 0 });

      // Keep selectedCustomer fresh
      if (selectedCustomer) {
        const updated = freshList.find(c => c.id === selectedCustomer.id);
        if (updated) setSelectedCustomer(updated);
      }
    } catch (err) {
      showToast(err.message || 'Failed to fetch customers', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  /* ─── Fetch delivered+unpaid orders for payment ─── */
  const fetchDeliveredOrders = async (customerId) => {
    if (!customerId) return;
    try {
      const res = await api.get(`/orders?customer_id=${customerId}&limit=50&sortBy=created_at&sortDir=desc`);
      const orders = res.data?.data?.orders || [];
      // Only show delivered + unpaid (COD cash due)
      const due = orders.filter(o =>
        o.delivery_status === 'delivered' && o.payment_status === 'unpaid'
      );
      setDeliveredOrders(due);
    } catch { setDeliveredOrders([]); }
  };

  /* ─── Fetch single customer ledger ─── */
  const refreshLedger = async (customerId) => {
    if (!customerId) return;
    try {
      // Fetch fresh ledger from dedicated endpoint (includes both invoice + payment entries)
      const res = await api.get(`/customer/${customerId}/ledger`);
      const entries = res.data?.data || [];
      setLedgerEntries(entries.map(e => ({
        id:              e.ledger_id   || e.id,
        transactionDate: e.transaction_date || e.transactionDate,
        transactionType: e.transaction_type || e.transactionType,
        referenceNumber: e.reference_number || e.referenceNumber,
        debitAmount:     Number(e.debit_amount  || e.debitAmount  || 0),
        creditAmount:    Number(e.credit_amount || e.creditAmount || 0),
        balance:         Number(e.balance       || 0),
        paymentMethod:   e.payment_method || e.paymentMethod || 'cash',
        description:     e.description,
        performedBy:     e.performed_by || e.performedBy,
        createdAt:       e.created_at   || e.createdAt,
      })));

      // Also refresh the customer row so totals are up-to-date
      const detailRes = await api.get(`/customer/${customerId}`);
      const acct = detailRes.data?.data?.account;
      if (acct) {
        setSelectedCustomer(prev => prev ? {
          ...prev,
          currentBalance: Number(acct.currentBalance || acct.current_balance || 0),
          totalDebit:     Number(acct.totalDebit     || acct.total_debit     || 0),
          totalCredit:    Number(acct.totalCredit    || acct.total_credit    || 0),
          totalPaid:      Number(acct.totalCredit    || acct.total_credit    || 0),
        } : prev);
      }
    } catch (err) {
      showToast(err.message || 'Failed to fetch ledger', 'error');
    }
  };

  useEffect(() => { refreshCustomers(); }, []); // eslint-disable-line

  /* Auto-select first customer on ledger tab */
  useEffect(() => {
    if (surface === 'ledger' && customers.length > 0 && !selectedCustomer) {
      const first = customers[0];
      setSelectedCustomer(first);
      refreshLedger(first.id);
    }
  }, [surface, customers]); // eslint-disable-line

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      [c.name, c.phone, c.email, c.city].join(' ').toLowerCase().includes(q)
    );
  }, [customers, search]);

  /* ─── Save customer (create / update) ─── */
  const handleSaveCustomer = async (payload) => {
    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, payload);
        showToast('Customer updated successfully');
      } else {
        await createCustomer(payload);
        showToast('Customer created successfully');
      }
      setEditingCustomer(null);
      await refreshCustomers();
    } catch (err) {
      showToast(err.message || 'Failed to save customer', 'error');
      throw err;
    }
  };

  /* ─── Ledger helpers ─── */
  const handleViewLedger = (customer) => {
    setSelectedCustomer(customer);
    refreshLedger(customer.id);
    setSurface('ledger');
  };

  /* ─── Payment submit ─── */
  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!paymentForm.customerId)                       errs.customerId = 'Select a customer';
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) errs.amount = 'Enter a valid amount';
    if (!paymentForm.paymentDate)                      errs.paymentDate = 'Date required';
    if (Object.keys(errs).length) { setPaymentErrors(errs); return; }

    setIsSavingPayment(true);
    try {
      // Record payment — pass invoiceId if specific order selected
      await api.post(`/customer/${paymentForm.customerId}/payments`, {
        amount:          Number(paymentForm.amount),
        paymentDate:     paymentForm.paymentDate,
        paymentMethod:   paymentForm.paymentMethod,
        referenceNumber: paymentForm.referenceNumber,
        notes:           paymentForm.notes,
        invoiceId:       paymentForm.invoiceId   || undefined,
        invoiceNumber:   paymentForm.invoiceNumber || undefined,
      });

      // If specific order selected, mark it as paid
      if (paymentForm.invoiceId) {
        await api.patch(`/orders/${paymentForm.invoiceId}/status`, {
          payment_status: 'paid',
          paid_amount:    Number(paymentForm.amount),
        }).catch(() => {}); // non-critical
      }

      showToast('Payment recorded successfully');
      const cid = parseInt(paymentForm.customerId);
      setPaymentForm(emptyPayment());
      setPaymentErrors({});
      setSelectedPaymentCustomer(null);
      setDeliveredOrders([]);
      await refreshCustomers();
      await refreshLedger(cid);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Failed to record payment', 'error');
    } finally {
      setIsSavingPayment(false);
    }
  };

  /* ─── Refund submit ─── */
  const handleRefundSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!refundForm.customerId)                        errs.customerId = 'Select a customer';
    if (!refundForm.amount || Number(refundForm.amount) <= 0) errs.amount = 'Enter a valid amount';
    if (!refundForm.refundDate)                        errs.refundDate = 'Date required';
    if (!refundForm.reason?.trim())                    errs.reason = 'Reason required';
    if (Object.keys(errs).length) { setRefundErrors(errs); return; }

    setIsSavingRefund(true);
    try {
      await api.post(`/customer/${refundForm.customerId}/payments`, {
        amount:          -Math.abs(Number(refundForm.amount)),
        paymentDate:     refundForm.refundDate,
        paymentMethod:   refundForm.refundMethod,
        referenceNumber: refundForm.referenceNumber,
        notes:           `REFUND: ${refundForm.reason}`,
        transactionType: 'refund',
      });
      showToast('Refund recorded successfully');
      const cid = parseInt(refundForm.customerId);

      // Refresh customers list to get updated balances
      const data = await listCustomers({ search: '', status: 'all' });
      const freshList = data.customers || [];
      setCustomers(freshList);
      setStats(data.stats || { totalCustomers: 0, activeCustomers: 0, totalReceivable: 0, totalPayments: 0 });

      // Update selectedRefundCustomer with fresh data
      const freshCustomer = freshList.find(c => c.id === cid);
      const newBalance = freshCustomer ? Number(freshCustomer.currentBalance || 0) : 0;

      if (freshCustomer && newBalance < 0) {
        // Still has refund due — update displayed amount
        setSelectedRefundCustomer(freshCustomer);
        setRefundForm({ ...emptyRefund(), customerId: cid.toString(), amount: String(Math.abs(newBalance)) });
      } else {
        // Fully refunded — deselect
        setSelectedRefundCustomer(null);
        setRefundForm(emptyRefund());
      }
      setRefundErrors({});
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Failed to record refund', 'error');
    } finally {
      setIsSavingRefund(false);
    }
  };

  /* ─── Stats cards ─── */
  const statsCards = [
    { label: 'Total Customers',  value: stats.totalCustomers  || 0,       color: '#2563eb' },
    { label: 'Active',           value: stats.activeCustomers || 0,       color: '#10b981' },
    { label: 'Total Receivable', value: `PKR ${(stats.totalReceivable || 0).toLocaleString()}`, color: '#d97706' },
    { label: 'Total Payments',   value: `PKR ${(stats.totalPayments   || 0).toLocaleString()}`, color: '#7c3aed' },
  ];

  /* ─── Surface tab definitions ─── */
  const surfaces = [
    { id: 'master',   label: 'Customer Master'   },
    { id: 'accounts', label: 'Customer Accounts' },
    { id: 'ledger',   label: 'Customer Ledger'   },
    { id: 'payment',  label: 'Record Payment'    },
    { id: 'refund',   label: 'Refund'            },
  ];

  /* ════════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: '1.5rem', width: '100%', maxWidth: 1600, margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '0.75rem 1.25rem', borderRadius: 12, background: toast.type === 'error' ? '#ef4444' : '#10b981', color: 'white', fontWeight: 600, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.6rem', color: 'var(--navy)', marginBottom: 2 }}>Customer Management</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--gray-400)', margin: 0 }}>Manage customers, COD accounts, payments and refunds</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {surface === 'master' && (
            <button onClick={() => { setEditingCustomer(null); setIsAddModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.55rem 1rem', borderRadius: 999, border: 'none', background: 'var(--navy)', color: 'white', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
              <UserPlus size={15} /> Add Customer
            </button>
          )}
          <button onClick={refreshCustomers} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
            {isLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />} Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {surfaces.map(s => (
          <button key={s.id} onClick={() => setSurface(s.id)} style={{ padding: '0.56rem 1rem', borderRadius: 999, border: '1px solid var(--dash-border)', background: surface === s.id ? 'var(--navy)' : 'white', color: surface === s.id ? 'white' : 'var(--gray-600)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {statsCards.map(c => <StatCard key={c.label} label={c.label} value={c.value} color={c.color} />)}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <Search size={16} color="var(--gray-400)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input type="text" placeholder="Search by name, phone, email, city…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.2rem', borderRadius: 8, border: '1px solid var(--dash-border)', fontSize: '0.85rem', outline: 'none' }} />
        </div>
      </div>

      {/* ── MASTER ─────────────────────────────────────────────── */}
      {surface === 'master' && (
        <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 1200 }}>
              <thead>
                <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                  {['Customer', 'Phone', 'Email', 'City', 'Address', 'Registered', 'Orders', 'Total Spent', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '0.875rem 0.75rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr><td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>No customers found</td></tr>
                ) : filteredCustomers.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                    <td style={{ padding: '0.875rem 0.75rem' }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: 'var(--navy)' }}>{c.name}</p>
                      <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--gray-400)' }}>ID: {c.customerId || c.id}</p>
                    </td>
                    <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.82rem' }}>{c.phone || c.contact || '—'}</td>
                    <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.75rem' }}>{c.email || '—'}</td>
                    <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.82rem' }}>{c.city || '—'}</td>
                    <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.75rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address || '—'}</td>
                    <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.75rem', color: 'var(--gray-500)' }}>{c.createdAt ? formatDate(c.createdAt) : '—'}</td>
                    <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, fontSize: '0.82rem', color: 'var(--navy)' }}>{c.totalOrders || 0}</td>
                    <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, fontSize: '0.82rem', color: '#10b981' }}>PKR {Number(c.totalSpent || 0).toLocaleString()}</td>
                    <td style={{ padding: '0.875rem 0.75rem' }}><StatusBadge value={c.accountStatus || c.status || 'active'} /></td>
                    <td style={{ padding: '0.875rem 0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <Btn onClick={() => { setEditingCustomer(c); setIsAddModalOpen(true); }} label="Edit" icon={Edit} />
                        <Btn onClick={() => handleViewLedger(c)} label="Ledger" icon={ArrowLeftRight} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ACCOUNTS ───────────────────────────────────────────── */}
      {surface === 'accounts' && (
        <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                  {['Customer', 'Total Invoiced', 'Payment Received', 'Balance / Refund Due', 'Account Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '0.875rem 0.75rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>No customers found</td></tr>
                ) : filteredCustomers.map(c => {
                  // totalDebit = total invoiced, totalCredit/totalPaid = cash received, currentBalance = outstanding
                  const invoiced    = Number(c.totalDebit    || c.totalSpent  || 0);
                  const received    = Number(c.totalCredit   || c.totalPaid   || 0);
                  const outstanding = Number(c.currentBalance || (invoiced - received) || 0);
                  const isPending   = outstanding > 0;           // customer owes us
                  const isRefundDue = outstanding < 0;           // we owe customer (overpaid / invoice returned)
                  const isClear     = outstanding === 0 && invoiced === 0;

                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: 'var(--navy)' }}>{c.name}</p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--gray-400)' }}>{c.phone || c.contact || '—'}</p>
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, fontSize: '0.9rem', color: '#2563eb' }}>
                        PKR {invoiced.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, fontSize: '0.82rem', color: '#10b981' }}>
                        PKR {received.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, fontSize: '0.88rem', color: isPending ? '#f59e0b' : isRefundDue ? '#7c3aed' : '#059669' }}>
                        {isRefundDue ? `CR PKR ${Math.abs(outstanding).toLocaleString()}` : `PKR ${outstanding.toLocaleString()}`}
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                          background: isPending ? 'rgba(245,158,11,0.12)' : isRefundDue ? 'rgba(124,58,237,0.12)' : 'rgba(16,185,129,0.12)',
                          color: isPending ? '#d97706' : isRefundDue ? '#7c3aed' : '#059669' }}>
                          {isPending ? 'Pending' : isRefundDue ? 'Refund Due' : 'Paid'}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <Btn onClick={() => handleViewLedger(c)} label="Ledger" icon={ArrowLeftRight} />
                          {/* Pay button: shows for both pending payment AND refund due */}
                          {isPending && (
                            <Btn
                              onClick={() => {
                                setSelectedPaymentCustomer(c);
                                setPaymentForm({ ...emptyPayment(), customerId: c.id.toString() });
                                fetchDeliveredOrders(c.id);
                                setSurface('payment');
                              }}
                              label="$ Pay" icon={DollarSign} color="white" bg="#10b981"
                            />
                          )}
                          {isRefundDue && (
                            <Btn
                              onClick={() => {
                                setSelectedRefundCustomer(c);
                                setRefundForm({ ...emptyRefund(), customerId: c.id.toString() });
                                setSurface('refund');
                              }}
                              label="Refund" icon={RotateCcw} color="white" bg="#7c3aed"
                            />
                          )}
                          {!isPending && !isRefundDue && invoiced > 0 && (
                            <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>✓ Settled</span>
                          )}
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

      {/* ── LEDGER ─────────────────────────────────────────────── */}
      {surface === 'ledger' && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', gap: '1rem' }}>
          {/* Customer list sidebar */}
          <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', overflow: 'hidden', maxHeight: 720 }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--dash-border)', fontWeight: 700, color: 'var(--navy)' }}>Customers</div>
            <div style={{ overflowY: 'auto', maxHeight: 660 }}>
              {filteredCustomers.map(c => {
                const outstanding = Number(c.currentBalance || 0);
                return (
                  <button key={c.id} onClick={() => { setSelectedCustomer(c); refreshLedger(c.id); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', width: '100%', padding: '0.85rem 1rem', border: 'none', borderBottom: '1px solid var(--dash-border)', background: selectedCustomer?.id === c.id ? 'var(--dash-bg)' : 'white', cursor: 'pointer', textAlign: 'left' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '0.84rem' }}>{c.name}</div>
                      <div style={{ fontSize: '0.72rem', color: outstanding > 0 ? '#d97706' : '#059669', fontWeight: 600 }}>
                        {outstanding > 0 ? `Due: PKR ${outstanding.toLocaleString()}` : 'Settled'}
                      </div>
                    </div>
                    <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: outstanding > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)', color: outstanding > 0 ? '#d97706' : '#059669' }}>
                      {outstanding > 0 ? 'Due' : 'OK'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ledger entries panel */}
          <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: '1rem' }}>{selectedCustomer?.name || 'Select a customer'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                  {selectedCustomer ? `${selectedCustomer.phone || selectedCustomer.contact || 'No phone'} · ${selectedCustomer.email || 'No email'}` : 'Click a customer on the left'}
                </div>
              </div>
              {selectedCustomer && (
                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.78rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: 'var(--gray-400)', fontSize: '0.7rem' }}>Total Invoiced</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#2563eb' }}>PKR {Number(selectedCustomer.totalDebit || selectedCustomer.totalSpent || 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--gray-400)', fontSize: '0.7rem' }}>Received</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#10b981' }}>PKR {Number(selectedCustomer.totalCredit || selectedCustomer.totalPaid || 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--gray-400)', fontSize: '0.7rem' }}>Outstanding</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#f59e0b' }}>PKR {Number(selectedCustomer.currentBalance || 0).toLocaleString()}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto', maxHeight: 580, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 900 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--dash-bg)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid var(--dash-border)' }}>
                    {['Date', 'Type', 'Reference', 'Debit (Invoice)', 'Credit (Payment)', 'Balance', 'Method', 'Notes'].map(h => (
                      <th key={h} style={{ padding: '0.75rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!selectedCustomer ? (
                    <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>Select a customer to view ledger</td></tr>
                  ) : ledgerEntries.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>No ledger entries found</td></tr>
                  ) : ledgerEntries.map((e, idx) => (
                    <tr key={e.id || idx} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--navy)', fontWeight: 600 }}>{formatDate(e.transactionDate)}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>{formatTimeAgo(e.createdAt || e.transactionDate)}</div>
                      </td>
                      <td style={{ padding: '0.75rem' }}><TxBadge type={e.transactionType} /></td>
                      <td style={{ padding: '0.75rem', fontWeight: 700, fontSize: '0.78rem', color: '#2563eb' }}>{e.referenceNumber || '—'}</td>
                      <td style={{ padding: '0.75rem', fontWeight: 700, fontSize: '0.82rem', color: e.debitAmount > 0 ? '#dc2626' : 'var(--gray-400)' }}>
                        {e.debitAmount > 0 ? `PKR ${e.debitAmount.toLocaleString()}` : '—'}
                      </td>
                      <td style={{ padding: '0.75rem', fontWeight: 700, fontSize: '0.82rem', color: e.creditAmount > 0 ? '#10b981' : 'var(--gray-400)' }}>
                        {e.creditAmount > 0 ? `PKR ${e.creditAmount.toLocaleString()}` : '—'}
                      </td>
                      <td style={{ padding: '0.75rem', fontWeight: 700, fontSize: '0.82rem', color: Number(e.balance) > 0 ? '#f59e0b' : '#059669' }}>
                        PKR {Number(e.balance || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, background: 'var(--dash-bg)', color: 'var(--navy)', textTransform: 'capitalize' }}>
                          {e.paymentMethod || 'cash'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.77rem', color: 'var(--gray-600)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.description || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── RECORD PAYMENT ─────────────────────────────────────── */}
      {surface === 'payment' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px minmax(0,1fr)', gap: '1.5rem' }}>
          {/* Customer list */}
          <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', overflow: 'hidden', maxHeight: 660 }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--dash-border)', fontWeight: 700, color: 'var(--navy)', fontSize: '0.85rem' }}>Select Customer</div>
            <div style={{ overflowY: 'auto', maxHeight: 600 }}>
              {filteredCustomers.map(c => {
                const outstanding = Number(c.currentBalance || 0);
                const isSelected  = selectedPaymentCustomer?.id === c.id;
                return (
                  <button key={c.id} onClick={() => {
                    setSelectedPaymentCustomer(c);
                    setPaymentForm({ ...emptyPayment(), customerId: c.id.toString() });
                    setPaymentErrors({});
                    fetchDeliveredOrders(c.id);
                  }}
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', width: '100%', padding: '0.85rem 1rem', border: 'none', borderBottom: '1px solid var(--dash-border)', background: isSelected ? 'var(--dash-bg)' : 'white', cursor: 'pointer', textAlign: 'left', borderLeft: isSelected ? '3px solid var(--navy)' : '3px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '0.84rem' }}>{c.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>{c.phone || c.email || '—'}</div>
                      </div>
                      {outstanding > 0 && (
                        <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: '#d97706' }}>
                          PKR {outstanding.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment form */}
          <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', overflow: 'hidden' }}>
            {!selectedPaymentCustomer ? (
              <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                <DollarSign size={40} color="var(--gray-400)" style={{ marginBottom: '1rem' }} />
                <h3 style={{ margin: '0 0 0.5rem', color: 'var(--navy)' }}>Select a Customer</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--gray-400)' }}>Choose a customer from the list to record payment</p>
              </div>
            ) : (
              <>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)' }}>
                  <h2 style={{ margin: '0 0 1rem', fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy)' }}>
                    Record Payment — {selectedPaymentCustomer.name}
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem' }}>
                    <StatCard label="Total Invoiced" value={`PKR ${Number(selectedPaymentCustomer.totalDebit || selectedPaymentCustomer.totalSpent || 0).toLocaleString()}`} color="#2563eb" />
                    <StatCard label="Received"       value={`PKR ${Number(selectedPaymentCustomer.totalCredit || selectedPaymentCustomer.totalPaid || 0).toLocaleString()}`} color="#10b981" />
                    <StatCard label="Outstanding"    value={`PKR ${Number(selectedPaymentCustomer.currentBalance || 0).toLocaleString()}`} color="#f59e0b" />
                  </div>
                </div>

                <form onSubmit={handlePaymentSubmit} style={{ padding: '1.5rem', display: 'grid', gap: '1.25rem' }}>
                  {/* Delivered orders dropdown */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                      Select Delivered Order (COD)
                    </label>
                    {deliveredOrders.length === 0 ? (
                      <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.82rem', color: '#059669' }}>
                        ✅ No pending COD payments — all delivered orders are paid
                      </div>
                    ) : (
                      <select
                        value={paymentForm.invoiceId}
                        onChange={e => {
                          const ord = deliveredOrders.find(o => String(o.invoice_id) === e.target.value);
                          setPaymentForm(p => ({
                            ...p,
                            invoiceId:     e.target.value,
                            invoiceNumber: ord?.invoice_number || '',
                            amount:        ord ? String(Number(ord.due_amount || ord.total_amount || 0)) : p.amount,
                          }));
                        }}
                        style={fieldStyle}
                      >
                        <option value="">— Select an order (optional) —</option>
                        {deliveredOrders.map(o => (
                          <option key={o.invoice_id} value={o.invoice_id}>
                            {o.invoice_number} — PKR {Number(o.due_amount || o.total_amount).toLocaleString()} — {new Date(o.created_at).toLocaleDateString()}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Amount Received *</label>
                      <input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} placeholder="Enter amount" style={{ ...fieldStyle, border: paymentErrors.amount ? '1px solid #dc2626' : '1px solid var(--dash-border)' }} required />
                      {paymentErrors.amount && <span style={{ fontSize: '0.75rem', color: '#dc2626', display: 'block', marginTop: 4 }}>{paymentErrors.amount}</span>}
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Payment Date *</label>
                      <input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(p => ({ ...p, paymentDate: e.target.value }))} style={fieldStyle} required />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Payment Method</label>
                      <select value={paymentForm.paymentMethod} onChange={e => setPaymentForm(p => ({ ...p, paymentMethod: e.target.value }))} style={fieldStyle}>
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="digital_wallet">Digital Wallet</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Reference No.</label>
                      <input value={paymentForm.referenceNumber} onChange={e => setPaymentForm(p => ({ ...p, referenceNumber: e.target.value }))} placeholder="PAY-001, Txn ID…" style={fieldStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Notes</label>
                    <textarea value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} placeholder="Cash received at delivery…" rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--dash-border)' }}>
                    <button type="button" onClick={() => { setSelectedPaymentCustomer(null); setPaymentForm(emptyPayment()); setPaymentErrors({}); }} style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>Cancel</button>
                    <button type="submit" disabled={isSavingPayment} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.72rem 1.4rem', borderRadius: 999, border: 'none', background: '#10b981', color: 'white', cursor: isSavingPayment ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: isSavingPayment ? 0.7 : 1 }}>
                      <Save size={16} />{isSavingPayment ? 'Recording…' : 'Record Payment'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── REFUND ─────────────────────────────────────────────── */}
      {surface === 'refund' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px minmax(0,1fr)', gap: '1.5rem' }}>
          {/* Customer list */}
          <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', overflow: 'hidden', maxHeight: 660 }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--dash-border)', fontWeight: 700, color: 'var(--navy)', fontSize: '0.85rem' }}>Select Customer</div>
            <div style={{ overflowY: 'auto', maxHeight: 600 }}>
              {filteredCustomers.map(c => {
                const bal = Number(c.currentBalance || 0);
                const refundDue = Math.abs(bal);
                const isSelected = selectedRefundCustomer?.id === c.id;
                const isEligible = bal < 0; // only refund if we owe customer
                return (
                  <button key={c.id} onClick={() => {
                    if (!isEligible) return;
                    setSelectedRefundCustomer(c);
                    setRefundForm({ ...emptyRefund(), customerId: c.id.toString(), amount: String(refundDue) });
                    setRefundErrors({});
                  }}
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', width: '100%', padding: '0.85rem 1rem', border: 'none', borderBottom: '1px solid var(--dash-border)', background: isSelected ? 'var(--dash-bg)' : 'white', cursor: isEligible ? 'pointer' : 'default', textAlign: 'left', borderLeft: isSelected ? '3px solid #dc2626' : '3px solid transparent', opacity: isEligible ? 1 : 0.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: isEligible ? 'var(--navy)' : 'var(--gray-400)', fontSize: '0.84rem' }}>{c.name}</div>
                        <div style={{ fontSize: '0.72rem', color: isEligible ? '#dc2626' : 'var(--gray-400)', fontWeight: isEligible ? 600 : 400 }}>
                          {isEligible ? `Refund Due: PKR ${refundDue.toLocaleString()}` : 'No refund due'}
                        </div>
                      </div>
                      {isEligible && (
                        <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>
                          PKR {refundDue.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Refund form */}
          <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', overflow: 'hidden' }}>
            {!selectedRefundCustomer ? (
              <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                <RotateCcw size={40} color="var(--gray-400)" style={{ marginBottom: '1rem' }} />
                <h3 style={{ margin: '0 0 0.5rem', color: 'var(--navy)' }}>Select a Customer</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--gray-400)' }}>Choose a customer to process a refund</p>
              </div>
            ) : (() => {
                const freshCust = filteredCustomers.find(c => c.id === selectedRefundCustomer.id) || selectedRefundCustomer;
                const refundDue = Math.abs(Number(freshCust.currentBalance || 0));
                return (
                  <>
                    {/* Header */}
                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)', background: 'rgba(245,158,11,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,158,11,0.15)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <RotateCcw size={22} />
                        </div>
                        <div>
                          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy)' }}>Refund — {freshCust.name}</h2>
                          <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: 'var(--gray-400)' }}>{freshCust.phone || freshCust.email}</p>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem' }}>
                        <StatCard label="Total Invoiced" value={`PKR ${Number(freshCust.totalDebit || freshCust.totalSpent || 0).toLocaleString()}`} color="#2563eb" />
                        <StatCard label="Received"       value={`PKR ${Number(freshCust.totalCredit || freshCust.totalPaid || 0).toLocaleString()}`} color="#10b981" />
                        <StatCard label="Refund Due"     value={refundDue > 0 ? `PKR ${refundDue.toLocaleString()}` : '✓ Settled'} color={refundDue > 0 ? '#dc2626' : '#059669'} />
                      </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleRefundSubmit} style={{ padding: '1.5rem', display: 'grid', gap: '1.25rem' }}>
                      <div style={{ padding: '0.85rem 1rem', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.82rem', color: '#92400e' }}>
                        <strong>Refund</strong> reduces the customer's outstanding balance (credit entry). Use this when returning goods or correcting an overcharge.
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Refund Amount *</label>
                          <input type="number" step="0.01" value={refundForm.amount} onChange={e => setRefundForm(p => ({ ...p, amount: e.target.value }))} placeholder="Enter amount" style={{ ...fieldStyle, border: refundErrors.amount ? '1px solid #dc2626' : '1px solid var(--dash-border)' }} required />
                          {refundErrors.amount && <span style={{ fontSize: '0.75rem', color: '#dc2626', display: 'block', marginTop: 4 }}>{refundErrors.amount}</span>}
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Refund Date *</label>
                          <input type="date" value={refundForm.refundDate} onChange={e => setRefundForm(p => ({ ...p, refundDate: e.target.value }))} style={fieldStyle} required />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Refund Method</label>
                          <select value={refundForm.refundMethod} onChange={e => setRefundForm(p => ({ ...p, refundMethod: e.target.value }))} style={fieldStyle}>
                            <option value="cash">Cash</option>
                            <option value="card">Card Refund</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="digital_wallet">Digital Wallet</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Reference No.</label>
                          <input value={refundForm.referenceNumber} onChange={e => setRefundForm(p => ({ ...p, referenceNumber: e.target.value }))} placeholder="REF-001, Order No…" style={fieldStyle} />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Reason for Refund *</label>
                        <textarea value={refundForm.reason} onChange={e => setRefundForm(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. Wrong item delivered, damaged product, overcharge…" rows={3} style={{ ...fieldStyle, resize: 'vertical', border: refundErrors.reason ? '1px solid #dc2626' : '1px solid var(--dash-border)' }} required />
                        {refundErrors.reason && <span style={{ fontSize: '0.75rem', color: '#dc2626', display: 'block', marginTop: 4 }}>{refundErrors.reason}</span>}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--dash-border)' }}>
                        <button type="button" onClick={() => { setSelectedRefundCustomer(null); setRefundForm(emptyRefund()); setRefundErrors({}); }} style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>Cancel</button>
                        <button type="submit" disabled={isSavingRefund} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.72rem 1.4rem', borderRadius: 999, border: 'none', background: '#f59e0b', color: 'white', cursor: isSavingRefund ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: isSavingRefund ? 0.7 : 1 }}>
                          <TrendingDown size={16} />{isSavingRefund ? 'Processing…' : 'Process Refund'}
                        </button>
                      </div>
                    </form>
                  </>
                );
              })()
            }
          </div>
        </div>
      )}

      <AddCustomerModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setEditingCustomer(null); }}
        onSubmit={handleSaveCustomer}
        editData={editingCustomer}
      />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
