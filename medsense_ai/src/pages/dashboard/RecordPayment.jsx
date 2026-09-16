import { useEffect, useState } from 'react';
import { DollarSign, Loader2, RefreshCw, Save, Search } from 'lucide-react';
import { listCustomers } from '../../services/customerService';
import api from '../../services/api';
import { useLocation } from 'react-router-dom';

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', padding: '1.25rem', border: '1px solid var(--dash-border)' }}>
      <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', margin: '0 0 0.5rem' }}>{label}</p>
      <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color, margin: 0 }}>{value}</p>
    </div>
  );
}

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

const emptyForm = () => ({
  customerId: '',
  amount: '',
  paymentDate: new Date().toISOString().split('T')[0],
  paymentMethod: 'cash',
  referenceNumber: '',
  notes: '',
});

export default function RecordPayment() {
  const location = useLocation();
  const preselected = location.state?.customer ?? null;

  const [customers, setCustomers]           = useState([]);
  const [search, setSearch]                 = useState('');
  const [isLoading, setIsLoading]           = useState(false);
  const [toast, setToast]                   = useState(null);
  const [formData, setFormData]             = useState(emptyForm());
  const [fieldErrors, setFieldErrors]       = useState({});
  const [isSaving, setIsSaving]             = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const refreshCustomers = async () => {
    setIsLoading(true);
    try {
      const data = await listCustomers({ search: '', status: 'all' });
      const list = data.customers || [];
      setCustomers(list);

      // If navigated here with a pre-selected customer, apply it
      if (preselected && !selectedCustomer) {
        const match = list.find(c => c.id === preselected.id) || preselected;
        setSelectedCustomer(match);
        setFormData(f => ({ ...f, customerId: String(match.id) }));
      }
    } catch (err) {
      showToast(err.message || 'Failed to fetch customers', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { refreshCustomers(); }, []); // eslint-disable-line

  const handleCustomerSelect = (c) => {
    setSelectedCustomer(c);
    setFormData(f => ({ ...f, customerId: String(c.id) }));
    setFieldErrors({});
  };

  const handleChange = (field, value) => {
    setFormData(f => ({ ...f, [field]: value }));
    setFieldErrors(f => ({ ...f, [field]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.customerId)                              errs.customerId  = 'Select a customer';
    if (!formData.amount || Number(formData.amount) <= 0)  errs.amount      = 'Enter a valid amount';
    if (!formData.paymentDate)                             errs.paymentDate = 'Date is required';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    try {
      await api.post(`/customer/${formData.customerId}/payments`, {
        amount:          Number(formData.amount),
        paymentDate:     formData.paymentDate,
        paymentMethod:   formData.paymentMethod,
        referenceNumber: formData.referenceNumber,
        notes:           formData.notes,
      });

      showToast('Payment recorded successfully');

      // Refresh list so balances update
      const data = await listCustomers({ search: '', status: 'all' });
      const list = data.customers || [];
      setCustomers(list);

      // Update selected customer balance from fresh list
      if (selectedCustomer) {
        const updated = list.find(c => c.id === selectedCustomer.id);
        if (updated) setSelectedCustomer(updated);
      }

      // Reset form (keep customer selected for quick follow-up)
      setFormData(f => ({ ...emptyForm(), customerId: f.customerId }));
      setFieldErrors({});
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Failed to record payment', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredCustomers = customers.filter(c =>
    !search.trim() ||
    [c.name, c.phone, c.email].join(' ').toLowerCase().includes(search.toLowerCase())
  );

  // Use correct field names returned by listCustomers
  const totalInvoiced  = Number(selectedCustomer?.totalDebit    || selectedCustomer?.totalSpent || 0);
  const totalReceived  = Number(selectedCustomer?.totalCredit   || selectedCustomer?.totalPaid  || 0);
  const outstanding    = Number(selectedCustomer?.currentBalance || Math.max(0, totalInvoiced - totalReceived));

  return (
    <div style={{ padding: '1.5rem', width: '100%', maxWidth: 1400, margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '0.75rem 1.25rem', borderRadius: 12, background: toast.type === 'error' ? '#ef4444' : '#10b981', color: 'white', fontWeight: 600, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.6rem', color: 'var(--navy)', marginBottom: 2 }}>Record Payment</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--gray-400)', margin: 0 }}>Record COD cash received from customers</p>
        </div>
        <button onClick={refreshCustomers} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
          {isLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px minmax(0,1fr)', gap: '1.5rem' }}>

        {/* ── Customer sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} color="var(--gray-400)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input type="text" placeholder="Search customers…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.2rem', borderRadius: 8, border: '1px solid var(--dash-border)', fontSize: '0.85rem', outline: 'none' }} />
          </div>

          <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', overflow: 'hidden', maxHeight: 620 }}>
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--dash-border)', fontWeight: 700, color: 'var(--navy)', fontSize: '0.85rem' }}>
              Select Customer
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 560 }}>
              {filteredCustomers.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.85rem' }}>No customers found</div>
              ) : filteredCustomers.map(c => {
                const bal = Number(c.currentBalance || 0);
                const isSelected = selectedCustomer?.id === c.id;
                return (
                  <button key={c.id} onClick={() => handleCustomerSelect(c)}
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', width: '100%', padding: '0.85rem 1rem', border: 'none', borderBottom: '1px solid var(--dash-border)', background: isSelected ? 'var(--dash-bg)' : 'white', cursor: 'pointer', textAlign: 'left', borderLeft: isSelected ? '3px solid var(--navy)' : '3px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '0.84rem' }}>{c.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>{c.phone || c.email || '—'}</div>
                      </div>
                      {bal > 0 && (
                        <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: '#d97706' }}>
                          PKR {bal.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Payment form ── */}
        <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', overflow: 'hidden' }}>
          {!selectedCustomer ? (
            <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--dash-bg)', margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={36} color="var(--gray-400)" />
              </div>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)' }}>No Customer Selected</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--gray-400)' }}>Select a customer from the list to record payment</p>
            </div>
          ) : (
            <>
              {/* Customer summary */}
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <DollarSign size={24} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy)' }}>
                      {selectedCustomer.name}
                    </h2>
                    <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: 'var(--gray-400)' }}>
                      {selectedCustomer.phone || selectedCustomer.email || '—'}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem' }}>
                  <StatCard label="Total Invoiced"  value={`PKR ${totalInvoiced.toLocaleString()}`}  color="#2563eb" />
                  <StatCard label="Received"         value={`PKR ${totalReceived.toLocaleString()}`}  color="#10b981" />
                  <StatCard label="Outstanding"      value={`PKR ${outstanding.toLocaleString()}`}    color="#f59e0b" />
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'grid', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                      Amount Received *
                    </label>
                    <input type="number" step="0.01" value={formData.amount} onChange={e => handleChange('amount', e.target.value)}
                      placeholder="Enter amount"
                      style={{ ...fieldStyle, border: fieldErrors.amount ? '1px solid #dc2626' : '1px solid var(--dash-border)', background: fieldErrors.amount ? 'rgba(239,68,68,0.04)' : 'white' }}
                      required />
                    {fieldErrors.amount && <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: 4, display: 'block' }}>{fieldErrors.amount}</span>}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                      Payment Date *
                    </label>
                    <input type="date" value={formData.paymentDate} onChange={e => handleChange('paymentDate', e.target.value)}
                      style={{ ...fieldStyle, border: fieldErrors.paymentDate ? '1px solid #dc2626' : '1px solid var(--dash-border)' }}
                      required />
                    {fieldErrors.paymentDate && <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: 4, display: 'block' }}>{fieldErrors.paymentDate}</span>}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                      Payment Method
                    </label>
                    <select value={formData.paymentMethod} onChange={e => handleChange('paymentMethod', e.target.value)} style={fieldStyle}>
                      <option value="cash">Cash on Delivery</option>
                      <option value="card">Card</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="digital_wallet">Digital Wallet</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                      Reference Number
                    </label>
                    <input value={formData.referenceNumber} onChange={e => handleChange('referenceNumber', e.target.value)}
                      placeholder="PAY-001, Txn ID, Invoice no…" style={fieldStyle} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                    Notes
                  </label>
                  <textarea value={formData.notes} onChange={e => handleChange('notes', e.target.value)}
                    placeholder="Cash received at delivery, partial payment, etc…"
                    rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--dash-border)' }}>
                  <button type="button"
                    onClick={() => { setSelectedCustomer(null); setFormData(emptyForm()); setFieldErrors({}); }}
                    style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                    Clear
                  </button>
                  <button type="submit" disabled={isSaving}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.72rem 1.4rem', borderRadius: 999, border: 'none', background: '#10b981', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: isSaving ? 0.7 : 1 }}>
                    <Save size={16} />
                    {isSaving ? 'Recording…' : 'Record Payment'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
