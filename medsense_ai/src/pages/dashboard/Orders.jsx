// src/pages/dashboard/Orders.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import { Eye, FilePlus2, PackageX, RefreshCw, RotateCcw, Search, Loader2 } from 'lucide-react';
import OrderDetailModal from '../../components/modals/OrderDetailModal';
import InvoiceComposerModal from '../../components/modals/InvoiceComposerModal';
import InvoiceReturnModal from '../../components/modals/InvoiceReturnModal';
import { formatDate, formatTimeAgo } from '../../utils/formatters';
import api from '../../services/api';
import axios from 'axios';
import {
  createInvoice,
  createInvoiceReturn,
  getInvoiceCatalog,
  getInvoiceStats,
  listInvoices,
  listInvoiceReturns,
} from '../../services/invoiceService';

const AUTH_KEY = 'medsense_auth_user';

const ORDER_DELIVERY_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'ready',
  'shipped',
  'delivered',
  'cancelled'
];

const ORDER_DELIVERY_TRANSITIONS = {
  pending: ['pending', 'confirmed', 'processing', 'cancelled'],
  confirmed: ['confirmed', 'processing', 'cancelled'],
  processing: ['processing', 'ready', 'delivered', 'cancelled'],
  ready: ['ready', 'shipped', 'delivered', 'cancelled'],
  shipped: ['shipped', 'delivered', 'cancelled'],
  delivered: ['delivered'],
  cancelled: ['cancelled']
};

const ORDER_STATUS_COLORS = {
  pending: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  confirmed: { bg: 'rgba(16,185,129,0.12)', color: '#059669' },
  processing: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  ready: { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  shipped: { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6' },
  delivered: { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  cancelled: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  refunded: { bg: '#f1f5f9', color: '#64748b' },
};

const PAYMENT_COLORS = {
  paid: { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  unpaid: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  refunded: { bg: '#f1f5f9', color: '#64748b' },
};

function getStoredUser() {
  try {
    const sessionValue = sessionStorage.getItem(AUTH_KEY);
    if (sessionValue) {
      const parsed = JSON.parse(sessionValue);
      if (parsed?.token) return parsed;
    }
    const localValue = localStorage.getItem(AUTH_KEY);
    if (localValue) {
      const parsed = JSON.parse(localValue);
      if (parsed?.token) return parsed;
    }
  } catch {}
  return null;
}

function normaliseOrder(order) {
  // ✅ Fix: Use invoice fields directly
  const status = order.delivery_status ?? order.deliveryStatus ?? order.orderStatus ?? 'pending';
  const patient = order.customer_name ?? order.user?.full_name ?? order.patient?.name ?? 'Unknown';
  const email = order.customer_email ?? order.user?.email ?? order.patient?.email ?? '';
  const phone = order.customer_phone ?? order.user?.phone ?? order.patient?.phone ?? '';
  const address = order.delivery_address ?? order.deliveryAddress ?? order.address ?? '-';
  
  // ✅ Fix: item_count from backend
  const itemCount = parseInt(order.item_count ?? 0);
  
  const initials = patient
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return {
    ...order,
    id: order.invoice_id ?? order.id,
    mode: 'order',
    archived: Boolean(order.legacy_source_schema && order.status === 0),
    deliveryStatus: status,
    paymentStatus: order.payment_status ?? order.paymentStatus ?? 'unpaid',
    paymentMethod: order.payment_method ?? order.paymentMethod ?? 'cash',
    totalAmount: parseFloat(order.total_amount ?? order.totalAmount ?? 0),
    orderNumber: order.legacy_source_invoice_number ?? order.invoice_number ?? order.orderNumber ?? order.order_number ?? order.id,
    deliveryFee: Number(order.delivery_fee ?? order.deliveryFee ?? 0),
    discount: Number(order.discount ?? 0),
    itemCount: itemCount, // ✅ Add item count
    address,
    patient: { name: patient, email, phone, initials },
    createdAt: order.created_at ?? order.createdAt,
  };
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', padding: '1.25rem', border: '1px solid var(--dash-border)' }}>
      <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', margin: '0 0 0.5rem' }}>{label}</p>
      <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color, margin: 0 }}>{value}</p>
    </div>
  );
}

function ViewButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        background: '#f1f5f9',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        cursor: 'pointer',
        color: '#475569',
        padding: '6px 12px',
        fontSize: '0.78rem',
        fontWeight: 600,
      }}
    >
      <Eye size={15} />
      View
    </button>
  );
}

function StatusPill({ value, palette }) {
  const style = palette[String(value || '').toLowerCase()] || { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span
      style={{
        padding: '4px 8px',
        borderRadius: 999,
        fontSize: '0.7rem',
        fontWeight: 700,
        background: style.bg,
        color: style.color,
        textTransform: 'capitalize',
        whiteSpace: 'nowrap',
      }}
    >
      {value || 'open'}
    </span>
  );
}

export default function Orders({ initialSurface = 'invoices' }) {
  const user = getStoredUser();
  const isPharmacist = user?.role === 'pharmacist' || user?.role === 'admin'; // Allow both pharmacist and admin
  const currentUserName = user?.fullName || user?.full_name || user?.name || 'Pharmacist';

  const [orders, setOrders] = useState([]);
  const [orderStats, setOrderStats] = useState({
    totalOrders: 0,
    todayOrders: 0,
    newOrders: 0,
    processing: 0,
    totalRevenue: 0,
    todayRevenue: 0,
  });
  const [invoices, setInvoices] = useState([]);
  const [invoiceReturns, setInvoiceReturns] = useState([]);
  const [customerReturns, setCustomerReturns] = useState([]);
  const [updatingReturnId, setUpdatingReturnId] = useState(null);
  const [invoiceReport, setInvoiceReport] = useState([]);
  const [returnReport,  setReturnReport]  = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [catalog, setCatalog] = useState({ customers: [], products: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [surface, setSurface] = useState(initialSurface);
  const [statusTab, setStatusTab] = useState('All');
  const [orderSource, setOrderSource] = useState('all');
  const [search, setSearch]           = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const [isInvoiceComposerOpen, setIsInvoiceComposerOpen] = useState(false);
  const [isInvoiceReturnOpen, setIsInvoiceReturnOpen] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchOrders = useCallback(async () => {
    if (!isPharmacist) return;
    try {
      const allOrders = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await api.get(`/orders?limit=100&page=${page}&sortBy=created_at&sortDir=desc`);
        const raw = response.data?.data?.orders ?? response.data?.orders ?? response.data?.data ?? [];
        if (!Array.isArray(raw)) throw new Error('Invalid orders response');
        allOrders.push(...raw);
        totalPages = Number(response.data?.data?.pagination?.totalPages || 1);
        page += 1;
      } while (page <= totalPages);
      setOrders(allOrders.map(normaliseOrder));
    } catch (error) {
      console.error('❌ fetchOrders error:', error.message);
    }
  }, [isPharmacist]);

  const fetchOrderStats = useCallback(async () => {
    if (!isPharmacist) return;
    try {
      // ✅ Get real stats from backend
      const response = await api.get('/orders/stats');
      const stats = response.data?.data || {};
      
      setOrderStats({
        totalOrders: stats.total || 0,
        todayOrders: stats.pending || 0, // Using pending as "new orders"
        newOrders: stats.pending || 0,
        processing: stats.processing || 0,
        totalRevenue: stats.totalRevenue || 0,
        todayRevenue: stats.totalRevenue || 0, // Can filter by date in backend if needed
      });
    } catch (error) {
      console.error('fetchOrderStats:', error.message);
      // Fallback to invoice stats if order stats fail
      try {
        const data = await getInvoiceStats();
        setOrderStats({
          totalOrders: data.total_invoices || 0,
          todayOrders: 0,
          newOrders: data.unpaid_invoices || 0,
          processing: 0,
          totalRevenue: data.total_paid || 0,
          todayRevenue: 0,
        });
      } catch (err) {
        console.error('fetchInvoiceStats fallback:', err.message);
      }
    }
  }, [isPharmacist]);

  const refreshInvoiceWorkspace = useCallback(async (quiet = false) => {
    try {
      const [invoiceList, returnsList, catalogData] = await Promise.all([
        listInvoices({ limit: 1000, sortBy: 'created_at', sortDir: 'DESC' }),
        listInvoiceReturns({ limit: 100 }),
        getInvoiceCatalog()
      ]);
      setInvoices(Array.isArray(invoiceList) ? invoiceList : []);
      setInvoiceReturns((Array.isArray(returnsList) ? returnsList : []).map(ret => ({
        id:               ret.return_id,
        mode:             'invoice-return',
        returnNumber:     ret.return_number,
        invoiceNumber:    ret.linked_invoice_number,
        linkedInvoiceId:  ret.linked_invoice_id,
        customerName:     ret.customer_name,
        returnTotal:      ret.total_amount,
        refundAmount:     ret.refund_amount,
        invoiceType:      ret.invoice_type || 'normal',
        return_description: ret.return_description || '',
        returnDescription:  ret.return_description || '',
        deliveryStatus:   ret.refund_status,
        paymentStatus:    ret.refund_status,
        createdAt:        ret.created_at,
        createdBy:        ret.created_by,
        itemCount:        ret.item_count || 0
      })));
      setCatalog(catalogData || { products: [] });

      // Fetch customer-submitted returns (all returns from invoice_return table)
      try {
        const custRet = await api.get('/invoice/returns?limit=200');
        setCustomerReturns(custRet.data?.data || []);
      } catch { /* non-fatal */ }

      // Fetch report data
      if (!quiet) setReportLoading(true);
      try {
        const [repData, retRepData] = await Promise.all([
          api.get('/invoice/report?limit=200'),
          api.get('/invoice/return-report?limit=200')
        ]);
        setInvoiceReport(repData.data?.data || []);
        setReturnReport(retRepData.data?.data  || []);
      } catch (repErr) {
        console.error('Report fetch error:', repErr.message);
      } finally {
        if (!quiet) setReportLoading(false);
      }
    } catch (err) {
      console.error('refreshInvoiceWorkspace error:', err);
    }
  }, []);

  const refreshAll = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      await Promise.all([fetchOrders(), fetchOrderStats(), refreshInvoiceWorkspace(quiet)]);
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, [fetchOrderStats, fetchOrders, refreshInvoiceWorkspace]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);
  useLiveDataRefresh(() => refreshAll(true));

  useEffect(() => {
    setStatusTab('All');
    setSearch('');
  }, [surface]);

  const handleOrderStatusChange = async (orderId, newStatus, currentStatus) => {
    if (newStatus === currentStatus || !isPharmacist) return;
    setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, deliveryStatus: newStatus } : order)));
    try {
      // ✅ Fix: Use delivery_status (backend field name)
      const response = await api.patch(`/orders/${orderId}/status`, { delivery_status: newStatus });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Update failed');
      }
      showToast(`Status updated to ${newStatus}`);
      refreshAll();
    } catch (error) {
      setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, deliveryStatus: currentStatus } : order)));
      showToast(error.response?.data?.message || error.message || 'Update failed', 'error');
    }
  };

  const handleCreateInvoice = async (payload) => {
    await createInvoice(payload);
    showToast('Invoice saved locally for Phase 1 review.');
    await refreshInvoiceWorkspace();
  };

  const handleCreateInvoiceReturn = async (payload) => {
    await createInvoiceReturn(payload);
    showToast('Invoice return saved locally for Phase 1 review.');
    await refreshInvoiceWorkspace();
  };

  const orderTabs = ['All', 'pending', 'confirmed', 'processing', 'ready', 'shipped', 'delivered', 'cancelled'];
  const invoiceTabs = ['All', 'paid', 'unpaid'];
  const returnTabs  = ['All', 'pending', 'approved', 'refunded'];
  const tabs = surface === 'orders' ? orderTabs : surface === 'returns' ? returnTabs : invoiceTabs;

  const filteredData = useMemo(() => {
    if (surface === 'orders') {
      let filtered = orders.filter((order) => {
        if (orderSource === 'cloud' && !order.legacy_source_schema) return false;
        if (orderSource === 'current' && order.legacy_source_schema) return false;
        if (statusTab !== 'All' && order.deliveryStatus !== statusTab) return false;
        if (search.trim()) {
          const query = search.toLowerCase();
          return (order.orderNumber || '').toLowerCase().includes(query) || (order.patient?.name || '').toLowerCase().includes(query);
        }
        return true;
      });
      
      // FIFO: Sort by creation date (oldest first) for pending/processing orders
      filtered = filtered.sort((a, b) => {
        const isPendingA = ['pending', 'confirmed', 'processing'].includes(a.deliveryStatus);
        const isPendingB = ['pending', 'confirmed', 'processing'].includes(b.deliveryStatus);
        
        // If both are pending/processing, sort oldest first (FIFO)
        if (isPendingA && isPendingB) {
          return new Date(a.createdAt) - new Date(b.createdAt);
        }
        
        // Otherwise, newest first
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      
      return filtered;
    }

    if (surface === 'invoiceReport') {
      const q = reportSearch.trim().toLowerCase();
      if (!q) return invoiceReport;
      return invoiceReport.filter(r =>
        [r.invoiceNumber, r.productTitle, r.customerName].join(' ').toLowerCase().includes(q)
      );
    }

    if (surface === 'returnReport') {
      const q = reportSearch.trim().toLowerCase();
      if (!q) return returnReport;
      return returnReport.filter(r =>
        [r.returnNumber, r.productTitle, r.customerName, r.linkedInvoiceNo].join(' ').toLowerCase().includes(q)
      );
    }

    if (surface === 'returns') {
      return invoiceReturns.filter((entry) => {
        if (statusTab !== 'All' && entry.deliveryStatus !== statusTab && entry.paymentStatus !== statusTab) return false;
        if (search.trim()) {
          const query = search.toLowerCase();
          return [entry.returnNumber, entry.invoiceNumber, entry.customerName].join(' ').toLowerCase().includes(query);
        }
        return true;
      });
    }

    return invoices.filter((invoice) => {
      if (orderSource === 'cloud' && !invoice.legacy_source_schema) return false;
      if (orderSource === 'current' && invoice.legacy_source_schema) return false;
      if (statusTab !== 'All') {
        const matchesStatus = invoice.deliveryStatus === statusTab || invoice.paymentStatus === statusTab;
        if (!matchesStatus) return false;
      }
      if (search.trim()) {
        const query = search.toLowerCase();
        return [invoice.invoiceNumber, invoice.customerName].join(' ').toLowerCase().includes(query);
      }
      return true;
    });
  }, [invoiceReturns, invoices, orders, search, statusTab, surface, orderSource]);

  const dynamicStats = useMemo(() => {
    if (surface === 'invoiceReport') {
      const totalQty     = invoiceReport.reduce((s, r) => s + Number(r.productQuantity || 0), 0);
      const totalRevenue = invoiceReport.reduce((s, r) => s + Number(r.totalPrice     || 0), 0);
      const totalProfit  = invoiceReport.reduce((s, r) => s + Number(r.productProfit  || 0), 0);
      return [
        { label: 'Line Items',     value: invoiceReport.length,                    color: '#1d4ed8' },
        { label: 'Total Qty Sold', value: totalQty,                                color: '#7c3aed' },
        { label: 'Total Revenue',  value: `PKR ${totalRevenue.toLocaleString()}`,  color: '#059669' },
        { label: 'Total Profit',   value: `PKR ${totalProfit.toLocaleString()}`,   color: '#10b981' },
      ];
    }

    if (surface === 'returnReport') {
      const totalQty   = returnReport.reduce((s, r) => s + Number(r.productQuantity || 0), 0);
      const totalValue = returnReport.reduce((s, r) => s + Number(r.totalPrice     || 0), 0);
      return [
        { label: 'Return Items', value: returnReport.length,                    color: '#d97706' },
        { label: 'Total Qty',    value: totalQty,                               color: '#7c3aed' },
        { label: 'Total Value',  value: `PKR ${totalValue.toLocaleString()}`,   color: '#dc2626' },
      ];
    }

    if (surface === 'orders') {
      return [
        { label: 'Total Orders', value: orderStats.totalOrders || orders.length, color: '#3b82f6' },
        { label: "Today's Orders", value: orderStats.todayOrders || 0, color: '#10b981' },
        { label: 'Pending', value: (orderStats.newOrders || 0) + (orderStats.processing || 0), color: '#f59e0b' },
        { label: "Today's Revenue", value: `PKR ${(orderStats.todayRevenue || 0).toLocaleString()}`, color: '#8b5cf6' },
      ];
    }

    if (surface === 'returns') {
      const today = new Date().toISOString().slice(0, 10);
      const todayReturnTotal = invoiceReturns
        .filter((entry) => String(entry.createdAt || '').slice(0, 10) === today)
        .reduce((sum, entry) => sum + Number(entry.returnTotal || 0), 0);
      return [
        { label: 'Return Records', value: invoiceReturns.length, color: '#d97706' },
        { label: 'Approved Returns', value: invoiceReturns.filter((entry) => entry.paymentStatus === 'approved').length, color: '#10b981' },
        { label: 'Refunded', value: invoiceReturns.filter((entry) => entry.paymentStatus === 'refunded').length, color: '#2563eb' },
        { label: "Today's Return Value", value: `PKR ${todayReturnTotal.toLocaleString()}`, color: '#7c3aed' },
      ];
    }

    const postedCount = invoices.filter((invoice) => invoice.deliveryStatus === 'posted').length;
    const paidCount = invoices.filter((invoice) => invoice.paymentStatus === 'paid').length;
    const unpaidCount = invoices.filter((invoice) => invoice.paymentStatus === 'unpaid').length;
    const totalInvoiceValue = invoices.reduce((sum, invoice) => sum + Number(invoice.invoiceTotal || invoice.totalAmount || 0), 0);
    const totalProfit = invoices.reduce((sum, invoice) => sum + Number(invoice.totalProfit || 0), 0);
    return [
      { label: 'Invoices', value: invoices.length, color: '#1d4ed8' },
      { label: 'Unpaid', value: unpaidCount, color: '#f59e0b' },
      { label: 'Invoice Value', value: `PKR ${totalInvoiceValue.toLocaleString()}`, color: '#7c3aed' },
      { label: 'Total Profit', value: `PKR ${totalProfit.toLocaleString()}`, color: '#059669' },
      { label: 'Fully Paid', value: paidCount, color: '#10b981' },
    ];
  }, [invoiceReturns, invoices, invoiceReport, returnReport, orders, orderStats, orders.length, surface]);

  const pageTitle = surface === 'orders' ? 'Orders Management'
    : surface === 'returns'       ? 'Invoice Returns'
    : surface === 'invoiceReport' ? 'Invoice Report'
    : surface === 'returnReport'  ? 'Invoice Return Report'
    : 'Invoices & POS';

  const pageSubtitle = surface === 'orders'
    ? `${orders.length} recorded orders Â· PKR ${(orderStats.totalRevenue || 0).toLocaleString()} revenue`
    : surface === 'returns'
      ? `${invoiceReturns.length} return records linked to invoices`
      : surface === 'invoiceReport'
        ? `${invoiceReport.length} line items across all invoices`
        : surface === 'returnReport'
          ? `${returnReport.length} return line items`
          : `${invoices.length} invoices with POS-style line detail and return-ready billing`;
  const searchPlaceholder = surface === 'orders'
    ? 'Search by Order ID or patient name...'
    : surface === 'returns'
      ? 'Search by return number, invoice, or customer...'
      : 'Search by invoice, customer...';

  const getTabCount = (tab) => {
    if (surface === 'orders') {
      return tab === 'All' ? orders.length : orders.filter((entry) => entry.deliveryStatus === tab).length;
    }
    if (surface === 'returns') {
      return tab === 'All' ? invoiceReturns.length : invoiceReturns.filter((entry) => entry.deliveryStatus === tab || entry.paymentStatus === tab).length;
    }
    return tab === 'All' ? invoices.length : invoices.filter((entry) => entry.deliveryStatus === tab || entry.paymentStatus === tab).length;
  };

  const surfaceButtons = [
    { id: 'invoices',        label: 'Invoices / POS'       },
    { id: 'invoiceReport',   label: 'Invoice Report'        },
    { id: 'returns',         label: 'Invoice Returns'       },
    { id: 'returnReport',    label: 'Invoice Return Report' },
    { id: 'refundRequests',  label: `Refund Requests${customerReturns.filter(r=>r.refund_status==='pending').length > 0 ? ` (${customerReturns.filter(r=>r.refund_status==='pending').length})` : ''}` },
    { id: 'orders',          label: 'Orders'                },
  ];

  return (
    <div style={{ padding: '1.5rem', width: '100%', maxWidth: 1600, margin: '0 auto' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '0.75rem 1.25rem', borderRadius: 12, background: toast.type === 'error' ? '#ef4444' : '#10b981', color: 'white', fontWeight: 600, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.6rem', color: 'var(--navy)', marginBottom: 2 }}>{pageTitle}</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--gray-400)', margin: 0 }}>{pageSubtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {surface === 'invoices' && (
            <button
              onClick={() => setIsInvoiceComposerOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.55rem 1rem', borderRadius: 999, border: 'none', background: 'var(--navy)', color: 'white', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
            >
              <FilePlus2 size={15} /> New Invoice
            </button>
          )}
          {surface === 'returns' && (
            <button
              onClick={() => setIsInvoiceReturnOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.55rem 1rem', borderRadius: 999, border: 'none', background: '#d97706', color: 'white', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
            >
              <RotateCcw size={15} /> Create Return
            </button>
          )}
          <button
            onClick={refreshAll}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
          >
            {isLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />} Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {surfaceButtons.map((button) => (
          <button
            key={button.id}
            onClick={() => setSurface(button.id)}
            style={{
              padding: '0.56rem 1rem',
              borderRadius: 999,
              border: '1px solid var(--dash-border)',
              background: surface === button.id ? 'var(--navy)' : 'white',
              color: surface === button.id ? 'white' : 'var(--gray-600)',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {button.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(dynamicStats.length, 5)}, minmax(0, 1fr))`, gap: '1rem', marginBottom: '1.5rem' }}>
        {dynamicStats.map((entry) => (
          <StatCard key={entry.label} label={entry.label} value={entry.value} color={entry.color} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '1rem', scrollbarWidth: 'none' }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusTab(tab)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 100,
              border: 'none',
              background: statusTab === tab ? 'var(--navy)' : 'white',
              color: statusTab === tab ? 'white' : 'var(--gray-600)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.82rem',
              fontWeight: statusTab === tab ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {tab}
            <span style={{ background: statusTab === tab ? 'rgba(255,255,255,0.2)' : 'var(--dash-bg)', color: statusTab === tab ? 'white' : 'var(--navy)', padding: '2px 6px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>
              {getTabCount(tab)}
            </span>
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        {(surface === 'orders' || surface === 'invoices') && (
          <label style={{ display: 'block', marginBottom: 12, fontSize: '0.85rem' }}>
            Records: {' '}
            <select aria-label="Record source" value={orderSource} onChange={event => setOrderSource(event.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--dash-border)' }}>
              <option value="all">All records</option>
              <option value="cloud">Previous cloud records</option>
              <option value="current">Current pharmacy records</option>
            </select>
          </label>
        )}
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <Search size={16} color="var(--gray-400)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.2rem', borderRadius: 8, border: '1px solid var(--dash-border)', fontSize: '0.85rem', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          {surface === 'orders' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '14%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                  {['Order ID', 'Patient', 'Date', 'Items', 'Total', 'Payment', 'Status', 'Actions'].map((heading) => (
                    <th key={heading} style={{ padding: '0.875rem 0.75rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((order) => {
                  const deliveryColors = ORDER_STATUS_COLORS[order.deliveryStatus] || ORDER_STATUS_COLORS.pending;
                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy)', background: 'var(--dash-bg)', padding: '2px 5px', borderRadius: 4 }}>
                          {order.orderNumber}
                        </span>
                        {order.legacy_source_schema && <small style={{ display: 'block', marginTop: 4, color: '#64748b' }}>Previous cloud</small>}
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.7rem', flexShrink: 0 }}>
                            {order.patient?.initials}
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.82rem', color: 'var(--navy)' }}>{order.patient?.name || 'Unknown'}</p>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--gray-400)' }}>{order.patient?.email || '-'}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--navy)' }}>{formatDate(order.createdAt ?? order.created_at)}</p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--gray-400)' }}>{formatTimeAgo(order.createdAt ?? order.created_at)}</p>
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.8rem', color: 'var(--gray-600)' }}>{order.itemCount || 0}</td>
                      <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, color: 'var(--navy)', fontSize: '0.82rem' }}>PKR {(order.totalAmount || 0).toLocaleString()}</td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <StatusPill value={order.paymentStatus || 'unpaid'} palette={PAYMENT_COLORS} />
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        {isPharmacist && !order.legacy_source_schema ? (
                          <select
                            value={order.deliveryStatus || 'pending'}
                            onChange={(event) => handleOrderStatusChange(order.id, event.target.value, order.deliveryStatus)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              background: deliveryColors.bg,
                              color: deliveryColors.color,
                              border: `1.5px solid ${deliveryColors.color}40`,
                              outline: 'none',
                              cursor: 'pointer',
                              textTransform: 'capitalize',
                            }}
                          >
                            {(ORDER_DELIVERY_TRANSITIONS[order.deliveryStatus || 'pending'] || [order.deliveryStatus || 'pending']).map((status) => (
                              <option key={status} value={status}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <StatusPill value={order.archived ? 'Archived' : order.deliveryStatus || 'pending'} palette={ORDER_STATUS_COLORS} />
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <ViewButton onClick={async () => {
                          try {
                            // Fetch full order details with items
                            const response = await api.get(`/orders/${order.id}`);
                            const full = response.data?.data || order;
                            // Map raw backend data to the shape OrderDetailModal expects
                            const mappedItems = (full.items || []).map(i => ({
                              id:          i.item_id,
                              name:        i.product_title || i.product_description || 'Unknown',
                              qty:         Number(i.quantity || 0),
                              unitPrice:   Number(i.unit_price || 0),
                              discount:    Number(i.discount || 0),
                              tax:         Number(i.tax || 0),
                              totalPrice:  Number(i.total_price || (i.quantity * i.unit_price) || 0),
                              batchNumber: i.batch_number || null,
                              expiryDate:  i.expiry_date || null,
                            }));
                            setSelectedDetail({
                              ...full,
                              id:             full.invoice_id ?? order.id,
                              mode:           'order',
                              orderNumber:    full.legacy_source_invoice_number ?? full.invoice_number ?? order.orderNumber,
                              totalAmount:    Number(full.total_amount ?? order.totalAmount ?? 0),
                              discount:       Number(full.discount ?? 0),
                              deliveryFee:    Number(full.delivery_fee ?? 0),
                              paymentStatus:  full.payment_status  ?? order.paymentStatus  ?? 'unpaid',
                              paymentMethod:  full.payment_method  ?? order.paymentMethod  ?? 'cash',
                              deliveryStatus: full.delivery_status ?? order.deliveryStatus ?? 'pending',
                              deliveryAddress: full.delivery_address || order.deliveryAddress || '',
                              createdAt:      full.created_at ?? order.createdAt,
                              patient: {
                                name:    full.customer_name  ?? order.patient?.name  ?? 'Walk-in Customer',
                                phone:   full.customer_phone ?? order.patient?.phone ?? '',
                                email:   full.customer_email ?? order.patient?.email ?? '',
                                initials: (full.customer_name ?? order.patient?.name ?? 'U')
                                  .split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(),
                              },
                              items: mappedItems,
                            });
                          } catch (error) {
                            console.error('Failed to fetch order details:', error);
                            // Fallback to showing order without items
                            setSelectedDetail({ ...order, items: order.items || [] });
                          }
                        }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {surface === 'invoices' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 1000 }}>
              <thead>
                <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                  {['Invoice No', 'Customer', 'Date', 'Items', 'Total', 'Profit', 'Payment', 'Status', 'Actions'].map((heading) => (
                    <th key={heading} style={{ padding: '0.875rem 0.75rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((invoice) => (
                  <tr key={invoice.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                    <td style={{ padding: '0.875rem 0.75rem' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy)', background: 'var(--dash-bg)', padding: '2px 5px', borderRadius: 4 }}>
                        {invoice.invoiceNumber}
                      </span>
                      {invoice.legacy_source_schema && <small style={{ display: 'block', marginTop: 4, color: '#64748b' }}>Previous cloud</small>}
                    </td>
                    <td style={{ padding: '0.875rem 0.75rem' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: 'var(--navy)' }}>{invoice.customerName}</p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--gray-400)' }}>{invoice.customerContact || invoice.customerCity || '-'}</p>
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 0.75rem' }}>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--navy)' }}>{formatDate(invoice.createdAt)}</p>
                      <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--gray-400)' }}>{formatTimeAgo(invoice.createdAt)}</p>
                    </td>
                    <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.8rem', color: 'var(--gray-600)' }}>{invoice.items.length}</td>
                    <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, color: 'var(--navy)', fontSize: '0.82rem' }}>PKR {Number(invoice.invoiceTotal || invoice.totalAmount || 0).toLocaleString()}</td>
                    <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, color: '#059669', fontSize: '0.82rem' }}>PKR {Number(invoice.totalProfit || 0).toLocaleString()}</td>
                    <td style={{ padding: '0.875rem 0.75rem' }}>
                      <StatusPill value={invoice.paymentStatus} palette={PAYMENT_COLORS} />
                    </td>
                    <td style={{ padding: '0.875rem 0.75rem' }}>
                      <StatusPill value={invoice.archived ? 'Archived' : invoice.deliveryStatus} palette={ORDER_STATUS_COLORS} />
                    </td>
                    <td style={{ padding: '0.875rem 0.75rem' }}>
                      <ViewButton onClick={() => setSelectedDetail(invoice)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}


          {surface === 'invoiceReport' && (
            <>
              <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem' }}>
                <input value={reportSearch} onChange={e => setReportSearch(e.target.value)}
                  placeholder="Search by invoice, product, customer..."
                  style={{ padding:'0.65rem 0.8rem', border:'1px solid var(--dash-border)',
                    borderRadius:9, background:'white', fontSize:'0.85rem', width:320 }}/>
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', textAlign:'left', minWidth:1100 }}>
                <thead>
                  <tr style={{ background:'var(--dash-bg)', borderBottom:'1px solid var(--dash-border)' }}>
                    {['Invoice No','Date','Customer','Product','Qty','Price','Discount','Total','Batch','Expiry','Purchase Price','Profit','Status'].map(h => (
                      <th key={h} style={{ padding:'0.875rem 0.75rem', fontSize:'0.72rem', fontWeight:600, color:'var(--gray-400)', textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportLoading ? (
                    <tr><td colSpan={13} style={{ padding:'3rem', textAlign:'center', color:'var(--gray-400)' }}>Loading...</td></tr>
                  ) : filteredData.length === 0 ? (
                    <tr><td colSpan={13} style={{ padding:'3rem', textAlign:'center', color:'var(--gray-400)' }}>No invoice items found</td></tr>
                  ) : filteredData.map(item => (
                    <tr key={item.id} style={{ borderBottom:'1px solid var(--dash-border)' }}>
                      <td style={{ padding:'0.75rem', fontFamily:'monospace', fontSize:'0.78rem', color:'var(--navy)', fontWeight:600 }}>{item.invoiceNumber}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.78rem', color:'var(--gray-600)' }}>{formatDate(item.invoiceDate)}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.78rem', color:'var(--navy)', fontWeight:600 }}>{item.customerName}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.78rem', color:'var(--navy)' }}>{item.productTitle}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.82rem', color:'var(--gray-600)', textAlign:'center' }}>{item.productQuantity}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.82rem', color:'var(--gray-600)' }}>PKR {Number(item.productPrice).toLocaleString()}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.82rem', color:'#d97706' }}>{item.productDiscount > 0 ? 'PKR '+Number(item.productDiscount).toLocaleString() : '-'}</td>
                      <td style={{ padding:'0.75rem', fontWeight:700, color:'var(--navy)', fontSize:'0.82rem' }}>PKR {Number(item.totalPrice).toLocaleString()}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.75rem', color:'var(--gray-600)', fontFamily:'monospace' }}>{item.batchNumber || '-'}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.75rem', color:'var(--gray-600)' }}>{item.productExpiry || '-'}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.82rem', color:'var(--gray-600)' }}>PKR {Number(item.purchasePrice).toLocaleString()}</td>
                      <td style={{ padding:'0.75rem', fontWeight:700, color: Number(item.productProfit) >= 0 ? '#059669' : '#dc2626', fontSize:'0.82rem' }}>PKR {Number(item.productProfit).toLocaleString()}</td>
                      <td style={{ padding:'0.75rem' }}><StatusPill value={item.paymentStatus} palette={PAYMENT_COLORS}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {surface === 'returnReport' && (
            <>
              <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem' }}>
                <input value={reportSearch} onChange={e => setReportSearch(e.target.value)}
                  placeholder="Search by return no, product, customer..."
                  style={{ padding:'0.65rem 0.8rem', border:'1px solid var(--dash-border)',
                    borderRadius:9, background:'white', fontSize:'0.85rem', width:320 }}/>
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', textAlign:'left', minWidth:1000 }}>
                <thead>
                  <tr style={{ background:'var(--dash-bg)', borderBottom:'1px solid var(--dash-border)' }}>
                    {['Return No','Linked Invoice','Date','Customer','Product','Qty','Price','Total','Profit','Type','Status'].map(h => (
                      <th key={h} style={{ padding:'0.875rem 0.75rem', fontSize:'0.72rem', fontWeight:600, color:'var(--gray-400)', textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportLoading ? (
                    <tr><td colSpan={11} style={{ padding:'3rem', textAlign:'center', color:'var(--gray-400)' }}>Loading...</td></tr>
                  ) : filteredData.length === 0 ? (
                    <tr><td colSpan={11} style={{ padding:'3rem', textAlign:'center', color:'var(--gray-400)' }}>No return items found</td></tr>
                  ) : filteredData.map(item => (
                    <tr key={item.id} style={{ borderBottom:'1px solid var(--dash-border)' }}>
                      <td style={{ padding:'0.75rem', fontFamily:'monospace', fontSize:'0.78rem', color:'#d97706', fontWeight:600 }}>{item.returnNumber}</td>
                      <td style={{ padding:'0.75rem', fontFamily:'monospace', fontSize:'0.78rem', color:'var(--navy)' }}>{item.linkedInvoiceNo || '-'}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.78rem', color:'var(--gray-600)' }}>{formatDate(item.createdAt)}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.78rem', color:'var(--navy)', fontWeight:600 }}>{item.customerName}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.78rem', color:'var(--navy)' }}>{item.productTitle}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.82rem', color:'var(--gray-600)', textAlign:'center' }}>{item.productQuantity}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.82rem', color:'var(--gray-600)' }}>PKR {Number(item.productPrice).toLocaleString()}</td>
                      <td style={{ padding:'0.75rem', fontWeight:700, color:'var(--navy)', fontSize:'0.82rem' }}>PKR {Number(item.totalPrice).toLocaleString()}</td>
                      <td style={{ padding:'0.75rem', fontWeight:700, color: Number(item.productProfit) >= 0 ? '#059669' : '#dc2626', fontSize:'0.82rem' }}>PKR {Number(item.productProfit).toLocaleString()}</td>
                      <td style={{ padding:'0.75rem', fontSize:'0.75rem', color:'var(--gray-600)', textTransform:'capitalize' }}>{item.invoiceType || 'normal'}</td>
                      <td style={{ padding:'0.75rem' }}><StatusPill value={item.refundStatus || 'pending'} palette={PAYMENT_COLORS}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {surface === 'returns' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 980 }}>
              <thead>
                <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                  {['Return No', 'Linked Invoice', 'Customer', 'Date', 'Items', 'Return Total', 'Refund Status', 'Created By', 'Actions'].map((heading) => (
                    <th key={heading} style={{ padding: '0.875rem 0.75rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <RotateCcw size={48} strokeWidth={1} style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.3 }} />
                      <p style={{ margin: 0, fontWeight: 600 }}>No Invoice Returns Found</p>
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                        Click "Create Return" to process a product return from an invoice
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((entry) => (
                    <tr key={entry.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600, color: '#d97706', background: '#fff7ed', padding: '2px 5px', borderRadius: 4 }}>
                          {entry.returnNumber}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy)', background: 'var(--dash-bg)', padding: '2px 5px', borderRadius: 4 }}>
                          {entry.invoiceNumber}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: 'var(--navy)' }}>{entry.customerName}</p>
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--navy)' }}>{formatDate(entry.createdAt)}</p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--gray-400)' }}>{formatTimeAgo(entry.createdAt)}</p>
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.8rem', color: 'var(--gray-600)' }}>{entry.itemCount || 0}</td>
                      <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, color: '#d97706', fontSize: '0.82rem' }}>PKR {Number(entry.returnTotal || 0).toLocaleString()}</td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <StatusPill value={entry.paymentStatus || 'pending'} palette={PAYMENT_COLORS} />
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.8rem', color: 'var(--gray-600)' }}>{entry.createdBy || 'System'}</td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <ViewButton onClick={async () => {
                          // Set basic info first (shows modal immediately)
                          setSelectedDetail({ ...entry, items: [] });
                          // Then fetch full detail with items
                          try {
                            const r = await api.get(`/invoice/returns/${entry.id}`);
                            const d = r.data?.data || {};
                            setSelectedDetail({
                              ...entry,
                              ...d,
                              mode:             'invoice-return',
                              returnNumber:     d.return_number     || entry.returnNumber,
                              invoiceNumber:    d.linked_invoice_number || entry.invoiceNumber,
                              returnDescription: d.return_description  || entry.return_description || '',
                              invoiceType:      d.invoice_type      || entry.invoiceType || 'normal',
                              returnTotal:      d.total_amount       || entry.returnTotal,
                              paymentStatus:    d.refund_status      || entry.paymentStatus,
                              createdBy:        d.created_by         || entry.createdBy,
                              items: (d.items || []).map(it => ({
                                id:           it.return_item_id,
                                name:         it.product_name,
                                qty:          it.quantity,
                                unitPrice:    it.unit_price,
                                totalPrice:   it.total_price,
                                profit:       it.product_profit || 0,
                                product_profit: it.product_profit || 0,
                                invoiceType:  it.invoice_type || 'normal',
                              }))
                            });
                          } catch {}
                        }} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {!isLoading && filteredData.length === 0 && (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--gray-400)' }}>
            <PackageX size={48} strokeWidth={1} style={{ margin: '0 auto 1rem', display: 'block' }} />
            <p style={{ margin: 0 }}>{surface === 'orders' ? 'No orders found' : surface === 'returns' ? 'No invoice returns found' : surface === 'invoiceReport' ? 'No invoice items found' : surface === 'returnReport' ? 'No return items found' : 'No invoices found'}</p>
          </div>
        )}

        {/* ── Refund Requests from storefront customers ── */}
        {surface === 'refundRequests' && (
          <div style={{ overflowX: 'auto' }}>
            {customerReturns.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                <RotateCcw size={40} strokeWidth={1} style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.3 }} />
                <p style={{ margin: 0, fontWeight: 600 }}>No customer refund requests yet</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                    {['Return No', 'Linked Invoice', 'Customer', 'Date', 'Items', 'Refund Amount', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '0.875rem 0.75rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customerReturns.map(ret => (
                    <tr key={ret.return_id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600, color: '#d97706', background: '#fff7ed', padding: '2px 6px', borderRadius: 4 }}>
                          {ret.return_number}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--navy)', fontWeight: 600 }}>
                        {ret.linked_invoice_number}
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy)' }}>
                        {ret.customer_name}
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.78rem', color: 'var(--gray-600)' }}>
                        {ret.created_at ? new Date(ret.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.8rem', color: 'var(--gray-600)', textAlign: 'center' }}>
                        {ret.item_count || '—'}
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, color: '#d97706', fontSize: '0.82rem' }}>
                        PKR {Number(ret.total_amount || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                          background: ret.refund_status === 'refunded' ? 'rgba(16,185,129,0.12)' : ret.refund_status === 'pending' ? 'rgba(245,158,11,0.12)' : 'rgba(220,38,38,0.12)',
                          color:      ret.refund_status === 'refunded' ? '#047857'              : ret.refund_status === 'pending' ? '#b45309'               : '#b91c1c'
                        }}>
                          {ret.refund_status === 'refunded' ? '✓ Refunded' : ret.refund_status === 'pending' ? 'Pending' : 'Rejected'}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        {ret.refund_status === 'pending' && (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              disabled={updatingReturnId === ret.return_id}
                              onClick={async () => {
                                setUpdatingReturnId(ret.return_id);
                                try {
                                  // 1. Mark return as refunded in DB
                                  await api.patch(`/invoice/returns/${ret.return_id}/status`, { refund_status: 'refunded' });
                                  // 2. Update local state immediately
                                  setCustomerReturns(prev => prev.map(r => r.return_id === ret.return_id ? { ...r, refund_status: 'refunded' } : r));
                                  showToast(`Refund marked for ${ret.return_number}`);
                                } catch (e) {
                                  showToast('Failed to update refund status', 'error');
                                } finally {
                                  setUpdatingReturnId(null);
                                }
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.4rem 0.75rem', borderRadius: 8, border: 'none', background: '#10b981', color: 'white', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', opacity: updatingReturnId === ret.return_id ? 0.6 : 1 }}
                            >
                              ✓ Mark Refunded
                            </button>
                          </div>
                        )}
                        {ret.refund_status === 'refunded' && (
                          <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>✓ Done</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {!isLoading && filteredData.length > 0 && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--dash-border)', fontSize: '0.8rem', color: 'var(--gray-400)' }}>
            Showing {filteredData.length} of {surface === 'orders' ? orders.length : surface === 'returns' ? invoiceReturns.length : surface === 'invoiceReport' ? invoiceReport.length : surface === 'returnReport' ? returnReport.length : invoices.length} {surface === 'orders' ? 'orders' : surface === 'returns' ? 'returns' : surface === 'invoiceReport' ? 'items' : surface === 'returnReport' ? 'items' : 'invoices'}
          </div>
        )}
      </div>

      <OrderDetailModal isOpen={!!selectedDetail} onClose={() => setSelectedDetail(null)} order={selectedDetail} />
      <InvoiceComposerModal
        isOpen={isInvoiceComposerOpen}
        onClose={() => setIsInvoiceComposerOpen(false)}
        catalog={catalog}
        currentUserName={currentUserName}
        onSubmit={handleCreateInvoice}
      />
      <InvoiceReturnModal
        isOpen={isInvoiceReturnOpen}
        onClose={() => setIsInvoiceReturnOpen(false)}
        invoices={invoices}
        currentUserName={currentUserName}
        onSubmit={handleCreateInvoiceReturn}
      />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
