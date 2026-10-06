// src/pages/dashboard/Dashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, TrendingUp, AlertTriangle, FileText,
  ChevronDown, ArrowUpRight,
  X, MoreHorizontal, Package, Bot, Send, Download, Printer, ChevronRight,
  Users, DollarSign, RefreshCw,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, Cell, RadialBarChart, RadialBar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

import { fadeUp, cardReveal, staggerContainer } from '../../utils/animations';
import { useToast } from '../../hooks/useToast';
import { askPharmacistAssistant, assistantErrorMessage } from '../../services/pharmacistAssistantService';
import api from '../../services/api';

import MetricCard from '../../components/common/MetricCard';
import SeverityBadge from '../../components/common/SeverityBadge';
import OrderDetailModal from '../../components/modals/OrderDetailModal';

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmt(n) {
  const v = Number(n || 0);

  if (v >= 1_000_000) {
    return `PKR ${(v / 1_000_000).toFixed(1)}M`;
  }

  if (v >= 1_000) {
    return `PKR ${(v / 1_000).toFixed(1)}K`;
  }

  return `PKR ${v.toLocaleString()}`;
}

let inventoryWatchCache = {
  fetchedAt: 0,
  items: [],
};

const FALLBACK_DASH = {
  kpi: { todayOrders: 0, monthlyRevenue: 0, activeAlerts: 0, activeCustomers: 0 },
  kpiSparklines: { todayOrders: [], monthlyRevenue: [], activeAlerts: [], activeCustomers: [] },
  kpiTrends: { todayOrders: 0, monthlyRevenue: 0, activeAlerts: 0, activeCustomers: 0 },
  salesData: Array.from({ length: 7 }, (_, i) => ({
    day: new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    revenue: 0, orders: 0, paid: 0,
  })),
  gaugePercent: 0,
  todayPaid: 0,
  todayOrders: 0,
  todayRevenue: 0,
  monthlyRevenue: 0,
  totalRevenue: 0,
  totalPaid: 0,
  pendingOrders: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [isLoading, setIsLoading]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashData, setDashData]       = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [alerts, setAlerts]           = useState([]);
  const [topMeds, setTopMeds]         = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [inventoryWatchItems, setInventoryWatchItems] = useState([]);

  const [aiInput, setAiInput]   = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [aiMessages, setAiMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your pharmacy AI. Ask me anything about sales, stock, or customers." },
  ]);

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedOrder, setSelectedOrder]   = useState(null);
  const exportMenuRef = useRef(null);

  // ── main data loader ──────────────────────────────────────────────────────
  const load = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      // ── parallel fetches ────────────────────────────────────────────────
      const [todayRes, dailyRes, topMedsRes, alertsRes, customerRes] = await Promise.all([
        api.get('/orders/stats/today').then(r => r.data?.data).catch(() => null),
        api.get('/orders/stats/daily?days=7').then(r => r.data?.data).catch(() => []),
        api.get('/orders/stats/top-medicines?limit=5&days=30').then(r => r.data?.data).catch(() => []),
        api.get('/stock/alerts/dashboard').then(r => r.data?.data).catch(() => ({ totalAlerts: 0 })),
        api.get('/customer').then(r => r.data?.data?.stats).catch(() => null),
      ]);

      // ── KPI values ───────────────────────────────────────────────────────
      const todayOrders    = todayRes?.today?.totalOrders   || 0;
      const todayRevenue   = todayRes?.today?.totalRevenue  || 0;
      const todayPaid      = todayRes?.today?.totalPaid     || 0;
      const monthlyRevenue = todayRes?.thisMonth?.totalRevenue || 0;
      const monthlyPaid    = todayRes?.thisMonth?.totalPaid    || 0;
      const totalRevenue   = todayRes?.today?.totalRevenue  || 0; // kept for gauge fallback
      const activeAlerts   = alertsRes?.totalAlerts || 0;
      const activeCustomers = customerRes?.activeCustomers || customerRes?.totalCustomers || 0;

      // ── trends vs yesterday ───────────────────────────────────────────
      const trends = todayRes?.trends || {};

      // ── sparklines — use daily data, key must be "v" for MetricCard ──
      const dailyData = Array.isArray(dailyRes) ? dailyRes : [];

      const mkSparkline = (field) =>
        dailyData.map(d => ({ v: Number(d[field] || 0) }));

      // ── sales trend chart — real 7-day data ──────────────────────────
      const salesData = dailyData.length > 0
        ? dailyData.map(d => ({
            day:     d.day,
            revenue: Number(d.revenue || 0),
            orders:  Number(d.orders  || 0),
            paid:    Number(d.paid    || 0),
          }))
        : FALLBACK_DASH.salesData;

      // ── gauge: totalPaid / totalRevenue (monthly) ──────────────────
      const gaugePercent = monthlyRevenue > 0
        ? Math.min(100, Math.round((monthlyPaid / monthlyRevenue) * 100))
        : 0;

      setDashData({
        kpi: { todayOrders, monthlyRevenue, activeAlerts, activeCustomers },
        kpiTrends: {
          todayOrders:    trends.ordersVsYesterday  || 0,
          monthlyRevenue: trends.revenueVsYesterday || 0,
          activeAlerts:   0,
          activeCustomers: 0,
        },
        kpiSparklines: {
          todayOrders:    mkSparkline('orders'),
          monthlyRevenue: mkSparkline('revenue'),
          activeAlerts:   [],
          activeCustomers: [],
        },
        salesData,
        gaugePercent,
        todayPaid,
        todayOrders,
        todayRevenue,
        monthlyRevenue,
        monthlyPaid,
        pendingOrders: todayRes?.today?.pending || 0,
      });

      // ── top medicines ──────────────────────────────────────────────
      const meds = Array.isArray(topMedsRes) ? topMedsRes : [];
      setTopMeds(meds.length > 0
        ? meds
        : [{ name: 'No sales data yet', units: 0, revenue: 0 }]
      );

      // ── recent orders ──────────────────────────────────────────────
      const ordersRes = await api.get('/orders?limit=10&sortBy=created_at&sortDir=desc');
      const ordersData = ordersRes.data?.data?.orders || [];
      setRecentOrders(ordersData.map(o => ({
        id:           o.invoice_id,
        orderNumber:  o.invoice_number,
        patient:      { name: o.customer_name || 'Walk-in Customer', phone: o.customer_phone },
        totalAmount:  Number(o.total_amount || 0),
        status:       o.delivery_status,
        paymentStatus: o.payment_status,
        itemCount:    o.item_count || 0,
        createdAt:    o.created_at,
      })));

      // ── low stock alerts ───────────────────────────────────────────
      const lowStockRes = await api.get('/stock/alerts/low-stock');
      const lowStock    = lowStockRes.data?.data?.lowStock    || [];
      const outOfStock  = lowStockRes.data?.data?.outOfStock  || [];

      // INVENTORY WATCH FALLBACK:
      // Only used when there are NO genuine low/out-of-stock alerts.
      // Data comes from the real product catalogue where stockQty is
      // calculated from active, non-expired StockHistory inventory.
      if (lowStock.length === 0 && outOfStock.length === 0) {
        try {
          const now = Date.now();
          const cacheAge = now - inventoryWatchCache.fetchedAt;

          if (
            inventoryWatchCache.items.length === 0 ||
            cacheAge >= 60000
          ) {
            const productRes = await api.get('/products');

            const payload = productRes.data;

            const products = Array.isArray(payload)
              ? payload
              : Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload?.data?.products)
                  ? payload.data.products
                  : [];

            const lowestLiveStock = products
              .filter((product) =>
                product &&
                product.status === 'active' &&
                Number(product.stockQty || 0) > 0
              )
              .sort(
                (a, b) =>
                  Number(a.stockQty || 0) -
                  Number(b.stockQty || 0)
              )
              .slice(0, 3)
              .map((product, index) => ({
                id: product.id || `inventory-watch-${index}`,
                name: product.title || 'Unknown medicine',
                stock: Number(product.stockQty || 0),
                minStock: Number(product.minThreshold || 0),
                expiryDate: product.expiryDate || '',
                rank: index + 1,
              }));

            inventoryWatchCache = {
              fetchedAt: now,
              items: lowestLiveStock,
            };
          }

          setInventoryWatchItems(
            inventoryWatchCache.items
          );
        } catch (watchError) {
          console.warn(
            'Inventory watch unavailable:',
            watchError?.message || watchError
          );

          setInventoryWatchItems(
            inventoryWatchCache.items || []
          );
        }
      } else {
        setInventoryWatchItems([]);
      }

      // Alerts section — combine low + out-of-stock
      setAlerts([
        ...outOfStock.slice(0, 3).map((item, i) => ({
          id:         `out-${i}`,
          patientName: item.title || 'Unknown',
          medicines:  ['OUT OF STOCK'],
          timeAgo:    'Now',
          severity:   'critical',
        })),
        ...lowStock.slice(0, 4).map((item, i) => ({
          id:         `low-${i}`,
          patientName: item.title || 'Unknown',
          medicines:  [`${item.currentQty || 0} / ${item.minThreshold || 0} units`],
          timeAgo:    'Now',
          severity:   item.currentQty < 5 ? 'critical' : 'warning',
        })),
      ]);

      // Low stock widget
      setLowStockItems([
        ...outOfStock.slice(0, 2).map(item => ({
          name:     item.title || 'Unknown',
          stock:    0,
          minStock: item.minThreshold || 10,
          level:    'out',
        })),
        ...lowStock.slice(0, 3).map(item => ({
          name:     item.title || 'Unknown',
          stock:    item.currentQty || 0,
          minStock: item.minThreshold || 10,
          level:    item.currentQty < 5 ? 'critical' : 'warning',
        })),
      ]);

    } catch (err) {
      console.error('Dashboard load error:', err);
      if (!silent) showToast({ type: 'error', message: 'Failed to load dashboard data' });
      setDashData(FALLBACK_DASH);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    load(false);
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  useEffect(() => {
    const h = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target))
        setShowExportMenu(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── AI ──────────────────────────────────────────────────────────────────
  async function handleAiSend() {
    if (!aiInput.trim()) return;
    const userMsg = aiInput;
    setAiInput('');
    setAiMessages(m => [...m, { role: 'user', content: userMsg }]);
    setIsTyping(true);
    try {
      const result = await askPharmacistAssistant(userMsg);
      setAiMessages(m => [...m, { role: 'assistant', content: result.reply }]);
    } catch (error) {
      setAiMessages(m => [
        ...m,
        { role: 'assistant', content: assistantErrorMessage(error) },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  const handleQuickPrompt = (p) => setAiInput(p);

  // ── Export ─────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!dashData) return;
    const rows = [
      ['Metric', 'Value'],
      ["Today's Orders",   dashData.kpi.todayOrders],
      ['Monthly Revenue',  `PKR ${dashData.kpi.monthlyRevenue}`],
      ['Active Alerts',    dashData.kpi.activeAlerts],
      ['Active Customers', dashData.kpi.activeCustomers],
      ['Today Paid',       `PKR ${dashData.todayPaid}`],
      ['Pending Orders',   dashData.pendingOrders],
    ];
    const csv = 'data:text/csv;charset=utf-8,' + rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = encodeURI(csv);
    a.download = `dashboard-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast({ type: 'success', message: 'CSV exported' });
    setShowExportMenu(false);
  };

  const handleExportPDF = () => {
    setShowExportMenu(false);
    showToast({ type: 'success', message: 'Preparing PDF…' });
    setTimeout(() => window.print(), 500);
  };

  // ── Process order (open detail modal) ─────────────────────────────────
  const handleProcessOrder = async (order) => {
    try {
      const res  = await api.get(`/orders/${order.id}`);
      const full = res.data?.data;
      if (full) {
        setSelectedOrder({
          ...full,
          id:            full.invoice_id,
          mode:          'order',
          orderNumber:   full.invoice_number,
          totalAmount:   Number(full.total_amount || 0),
          discount:      Number(full.discount     || 0),
          deliveryFee:   Number(full.delivery_fee || 0),
          paymentStatus:  full.payment_status  || 'unpaid',
          paymentMethod:  full.payment_method  || 'cash',
          deliveryStatus: full.delivery_status || 'pending',
          patient: {
            name:     full.customer_name  || 'Walk-in Customer',
            phone:    full.customer_phone || '',
            email:    full.customer_email || '',
            initials: (full.customer_name || 'U').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(),
          },
          deliveryAddress: full.delivery_address || '',
          createdAt:       full.created_at,
          items: (full.items || []).map(i => ({
            id:         i.item_id,
            name:       i.product_title || i.product_description || 'Unknown',
            qty:        Number(i.quantity   || 0),
            unitPrice:  Number(i.unit_price || 0),
            discount:   Number(i.discount   || 0),
            tax:        Number(i.tax        || 0),
            totalPrice: Number(i.total_price || (i.quantity * i.unit_price) || 0),
          })),
        });
      } else {
        setSelectedOrder({ ...order, items: [] });
      }
    } catch {
      setSelectedOrder({ ...order, items: [] });
    }
    setShowOrderModal(true);
  };

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (isLoading || !dashData) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: '1rem' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="dash-shimmer" style={{ gridColumn: 'span 3', height: 160 }} />
        ))}
        <div className="dash-shimmer" style={{ gridColumn: 'span 7', height: 320 }} />
        <div className="dash-shimmer" style={{ gridColumn: 'span 5', height: 320 }} />
        <div className="dash-shimmer" style={{ gridColumn: 'span 12', height: 240 }} />
      </div>
    );
  }

  // ── KPI cards config ──────────────────────────────────────────────────
  const kpiCards = [
    {
      label:    "Today's Orders",
      icon:     ShoppingCart,
      iconBg:   '#dbeafe', iconColor: '#2563eb',
      value:    dashData.kpi.todayOrders,
      trend:    dashData.kpiTrends.todayOrders,
      sparkData: dashData.kpiSparklines.todayOrders,
    },
    {
      label:    'Monthly Revenue',
      icon:     TrendingUp,
      iconBg:   '#d1fae5', iconColor: '#10b981',
      value:    dashData.kpi.monthlyRevenue,
      prefix:   '₨',
      trend:    dashData.kpiTrends.monthlyRevenue,
      sparkData: dashData.kpiSparklines.monthlyRevenue,
      formatValue: (v) => fmt(v),
    },
    {
      label:    'Active Alerts',
      icon:     AlertTriangle,
      iconBg:   '#fff1f0', iconColor: '#ef4444',
      value:    dashData.kpi.activeAlerts,
      trend:    dashData.kpiTrends.activeAlerts,
      sparkData: dashData.kpiSparklines.activeAlerts,
    },
    {
      label:    'Active Customers',
      icon:     Users,
      iconBg:   '#ede9fe', iconColor: '#7c3aed',
      value:    dashData.kpi.activeCustomers,
      trend:    dashData.kpiTrends.activeCustomers,
      sparkData: dashData.kpiSparklines.activeCustomers,
    },
  ];

  // ── Chart tooltip ─────────────────────────────────────────────────────
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="dash-card" style={{ padding: '0.75rem 1rem', background: 'white', minWidth: 140 }}>
        <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.8rem', color: 'var(--navy)' }}>{label}</p>
        {payload.map((entry, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>
              {entry.name}: <strong>{entry.name === 'revenue' || entry.name === 'paid' ? fmt(entry.value) : entry.value}</strong>
            </span>
          </div>
        ))}
      </div>
    );
  };

  // weekly revenue total for Sales Trend header
  const weeklyRevenue = dashData.salesData.reduce((s, d) => s + d.revenue, 0);
  // total units sold this month
  const totalUnitsSold = topMeds.reduce((s, m) => s + (m.units || 0), 0);

  // ─────────────────────────────────────────────────────────────────────
  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible">

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.6rem', color: 'var(--navy)', margin: '0 0 4px 0' }}>
            Pharmacy Overview
          </h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--gray-400)', fontWeight: 300, margin: 0 }}>
            Real-time data Â· auto-refreshes every 30 s
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', position: 'relative' }} ref={exportMenuRef}>
          {/* Refresh indicator */}
          {isRefreshing && (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={16} color="var(--gray-400)" />
            </motion.div>
          )}

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => load(false)}
            style={{ padding: '0.6rem 1.25rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={14} /> Refresh
          </motion.button>

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => setShowExportMenu(!showExportMenu)}
            style={{ padding: '0.6rem 1.25rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Download size={16} /> Export
          </motion.button>

          <AnimatePresence>
            {showExportMenu && (
              <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }}
                style={{ position: 'absolute', top: '110%', right: 0, background: 'white', borderRadius: 12, border: '1px solid var(--dash-border)', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 100, width: 180, overflow: 'hidden' }}>
                {[
                  { label: 'Export as CSV', icon: FileText, fn: handleExportCSV },
                  { label: 'Export as PDF', icon: Printer,  fn: handleExportPDF },
                ].map(btn => (
                  <button key={btn.label} onClick={btn.fn}
                    style={{ width: '100%', padding: '0.75rem 1rem', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem', color: 'var(--navy)', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--dash-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <btn.icon size={16} color="var(--gray-400)" /> {btn.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/pharmacist/dashboard/orders')}
            style={{ padding: '0.6rem 1.25rem', borderRadius: 100, border: 'none', background: 'var(--navy)', color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            View Orders
          </motion.button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: '1rem' }}>

        {/* ── ROW 1: KPI CARDS ───────────────────────────────────────── */}
        {kpiCards.map((card, i) => (
          <MetricCard key={i} {...card} index={i} />
        ))}

        {/* ── ROW 2 LEFT: Sales Trend (7-day real data) ──────────────── */}
        <motion.div variants={fadeUp} style={{ gridColumn: 'span 7' }} className="dash-card">
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', margin: '0 0 0.4rem' }}>
                  7-Day Sales Trend
                </h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
                  <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.8rem', color: 'var(--navy)', margin: 0 }}>
                    {fmt(weeklyRevenue)}
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {[
                      { label: 'Revenue', color: '#2563eb' },
                      { label: 'Orders',  color: '#7c3aed' },
                      { label: 'Paid',    color: '#10b981' },
                    ].map(l => (
                      <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
                        <span style={{ fontSize: '0.7rem', color: 'var(--gray-500)', fontWeight: 500 }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--gray-400)', background: 'var(--dash-bg)', padding: '3px 10px', borderRadius: 100 }}>
                Last 7 days
              </span>
            </div>

            <div style={{ height: 190, width: '100%', minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashData.salesData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--gray-400)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--dash-border)', strokeWidth: 1 }} />
                  <Line type="monotone" dataKey="revenue" name="revenue" stroke="#2563eb" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#2563eb', strokeWidth: 0 }} isAnimationActive animationBegin={300} />
                  <Line type="monotone" dataKey="orders"  name="orders"  stroke="#7c3aed" strokeWidth={2}   dot={false} strokeDasharray="4 2" isAnimationActive animationBegin={500} />
                  <Line type="monotone" dataKey="paid"    name="paid"    stroke="#10b981" strokeWidth={2}   dot={false} isAnimationActive animationBegin={700} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        {/* ── ROW 2 RIGHT: Today Summary + Pending Queue ──────────────── */}
        <div style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Today Received — REAL data */}
          <motion.div variants={fadeUp} className="dash-card" style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <DollarSign size={16} color="var(--gray-400)" />
              <span style={{ fontSize: '0.78rem', color: 'var(--gray-500)', fontWeight: 500 }}>Today Collected (Cash)</span>
            </div>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.8rem', color: 'var(--navy)', margin: '0 0 0.5rem' }}>
              {fmt(dashData.todayPaid)}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--gray-400)', fontWeight: 400 }}>Revenue</p>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: 'var(--navy)' }}>{fmt(dashData.todayRevenue)}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--gray-400)', fontWeight: 400 }}>Pending</p>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: '#f59e0b' }}>{dashData.pendingOrders} orders</p>
                </div>
              </div>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/pharmacist/dashboard/orders')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy)', cursor: 'pointer' }}>
                View <ArrowUpRight size={12} />
              </motion.button>
            </div>
          </motion.div>

          {/* Pending Orders Queue — dark card */}
          <motion.div variants={fadeUp} whileHover={{ boxShadow: '0 16px 48px rgba(0,0,0,0.25)' }}
            style={{ background: 'var(--dash-card-dark)', borderRadius: 'var(--dash-radius)', padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {[{ icon: X }, { icon: FileText }, { icon: ArrowUpRight }].map((btn, idx) => (
                <motion.div key={idx} whileHover={{ scale: 1.1, background: 'rgba(255,255,255,0.15)' }} whileTap={{ scale: 0.95 }}
                  style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <btn.icon size={14} color="white" />
                </motion.div>
              ))}
            </div>
            <div>
              <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: 100, display: 'inline-block', marginBottom: '0.5rem' }}>
                Needs Attention
              </span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.2rem', color: 'white', margin: 0 }}>
                Pending Orders
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', fontWeight: 300, margin: '4px 0 0' }}>
                {dashData.pendingOrders} orders awaiting dispatch
              </p>
            </div>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/pharmacist/dashboard/orders')}
              style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--blue)', color: 'white', padding: '0.4rem 0.85rem', borderRadius: 100, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>
              Process Now <ArrowUpRight size={12} />
            </motion.div>
          </motion.div>
        </div>

        {/* ── ROW 3 LEFT: Stock Alerts (real low-stock + out-of-stock) ── */}
        <motion.div variants={fadeUp} style={{ gridColumn: 'span 7' }} className="dash-card">
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', margin: 0 }}>{alerts.length > 0 ? 'Stock Alerts' : 'Inventory Watch'}</h3>
                <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                  style={{ background: 'var(--red)', color: 'white', borderRadius: 100, fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', minWidth: 20, textAlign: 'center' }}>
                  {dashData.kpi.activeAlerts}
                </motion.div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['Critical First', 'All Alerts'].map(label => (
                  <div key={label} style={{ fontSize: '0.7rem', fontWeight: 600, padding: '4px 10px', borderRadius: 100, background: 'var(--dash-bg)', cursor: 'pointer' }}>
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div>
              {alerts.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.85rem' }}>
                  {inventoryWatchItems.length > 0 ? (
                    <div
                      style={{
                        width: '100%',
                        display: 'grid',
                        gap: '0.5rem',
                        textAlign: 'left',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          padding: '0.15rem 0 0.35rem',
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: '#fffbeb',
                            border: '1px solid #fde68a',
                            color: '#d97706',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            flexShrink: 0,
                          }}
                        >
                          !
                        </div>

                        <div>
                          <div
                            style={{
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              color: 'var(--navy)',
                            }}
                          >
                            Inventory Watch
                          </div>

                          <div
                            style={{
                              marginTop: 1,
                              fontSize: '0.67rem',
                              color: 'var(--gray-400)',
                            }}
                          >
                            No product currently violates its configured low-stock threshold.
                          </div>
                        </div>
                      </div>

                      {inventoryWatchItems.map((item, index) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            navigate('/pharmacist/dashboard/inventory')
                          }
                          style={{
                            width: '100%',
                            border: '1px solid #f1f5f9',
                            borderRadius: 10,
                            background: '#fff',
                            padding: '0.55rem 0.65rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.6rem',
                              minWidth: 0,
                            }}
                          >
                            <div
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 8,
                                background: '#fffbeb',
                                color: '#d97706',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                fontSize: '0.72rem',
                                fontWeight: 800,
                              }}
                            >
                              {index + 1}
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  color: 'var(--navy)',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {item.name}
                              </div>

                              <div
                                style={{
                                  marginTop: 2,
                                  color: 'var(--gray-400)',
                                  fontSize: '0.66rem',
                                }}
                              >
                                Lowest current live-stock position
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              flexShrink: 0,
                              textAlign: 'right',
                            }}
                          >
                            <div
                              style={{
                                color: '#d97706',
                                fontSize: '0.76rem',
                                fontWeight: 800,
                              }}
                            >
                              {item.stock.toLocaleString()} units
                            </div>

                            <div
                              style={{
                                marginTop: 2,
                                color: 'var(--gray-400)',
                                fontSize: '0.62rem',
                              }}
                            >
                              Watch only
                            </div>
                          </div>
                        </button>
                      ))}

                      <div
                        style={{
                          paddingTop: '0.15rem',
                          color: 'var(--gray-400)',
                          fontSize: '0.64rem',
                          lineHeight: 1.45,
                        }}
                      >
                        These medicines are shown for monitoring only and are not classified as stock alerts.
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--gray-400)' }}>
                      Inventory healthy — no current stock alerts.
                    </span>
                  )}
                </div>
              ) : alerts.map((alert, i) => (
                <motion.div key={alert.id}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                  whileHover={{ background: 'var(--dash-bg)', borderRadius: 12 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.65rem 0.5rem', borderBottom: i !== alerts.length - 1 ? '1px solid var(--dash-border)' : 'none', cursor: 'pointer' }}
                  onClick={() => navigate('/pharmacist/dashboard/inventory')}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: alert.severity === 'critical' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Package size={16} color={alert.severity === 'critical' ? '#ef4444' : '#f59e0b'} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {alert.patientName}
                    </p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--gray-400)', fontWeight: 300, margin: 0 }}>
                      {alert.medicines.join(' Â· ')}
                    </p>
                  </div>
                  <SeverityBadge severity={alert.severity} />
                  <motion.button whileHover={{ background: 'var(--blue)', color: 'white', borderColor: 'var(--blue)' }} whileTap={{ scale: 0.95 }}
                    style={{ flexShrink: 0, padding: '0.3rem 0.75rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', fontSize: '0.72rem', fontWeight: 500, color: 'var(--navy)', cursor: 'pointer', transition: 'all 0.2s' }}>
                    Reorder
                  </motion.button>
                </motion.div>
              ))}
            </div>

            <div style={{ textAlign: 'right', marginTop: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--blue)', fontWeight: 500, cursor: 'pointer' }}
                onClick={() => navigate('/pharmacist/dashboard/inventory')}>
                View all stock >
              </span>
            </div>
          </div>
        </motion.div>

        {/* ── ROW 3 RIGHT: Revenue Gauge (real paid/revenue ratio) ─────── */}
        <motion.div variants={fadeUp} style={{ gridColumn: 'span 5' }} className="dash-card">
          <div style={{ padding: '1.25rem 1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', margin: 0 }}>Collection Rate</h3>
              <ArrowUpRight size={16} color="var(--gray-400)" />
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--gray-400)', margin: '0 0 0.25rem' }}>
              Monthly paid vs billed
            </p>

            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
              <ResponsiveContainer width="100%" height={200}>
                <RadialBarChart cx="50%" cy="80%" innerRadius="70%" outerRadius="100%" startAngle={180} endAngle={0}
                  data={[
                    { name: 'Background', value: 100,                    fill: '#f1f5f9' },
                    { name: 'Collected',  value: dashData.gaugePercent, fill: '#10b981' },
                  ]}>
                  <RadialBar minAngle={5} dataKey="value" cornerRadius={10} isAnimationActive animationBegin={800} animationDuration={1500} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', bottom: '22%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '2rem', color: 'var(--navy)', margin: 0, lineHeight: 1 }}>
                  {dashData.gaugePercent}%
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--gray-400)', margin: '4px 0 0' }}>collected</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: '1rem' }}>
              {[
                { label: 'Billed',     color: '#f1f5f9', value: fmt(dashData.monthlyRevenue) },
                { label: 'Collected',  color: '#10b981', value: fmt(dashData.monthlyPaid || 0) },
              ].map(l => (
                <div key={l.label} style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, border: '1px solid var(--dash-border)' }} />
                    <span style={{ fontSize: '0.7rem', color: 'var(--gray-500)' }}>{l.label}</span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontWeight: 700, fontSize: '0.85rem', color: 'var(--navy)' }}>{l.value}</p>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--dash-bg)', borderRadius: 12, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--navy)', margin: '0 0 2px' }}>
                  {dashData.gaugePercent >= 80 ? '✅ Collection on track' : dashData.gaugePercent >= 50 ? '⚠️ Follow-up needed' : '🔴 Collection low'}
                </p>
                <p style={{ fontSize: '0.7rem', color: 'var(--gray-500)', margin: 0 }}>this month</p>
              </div>
              <motion.button whileHover={{ scale: 1.05 }} onClick={() => navigate('/pharmacist/dashboard/customers')}
                style={{ background: 'var(--navy)', color: 'white', padding: '4px 10px', borderRadius: 100, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', border: 'none' }}>
                Collect
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* ── ROW 4 LEFT: Top Selling Medicines (real sales data) ─────── */}
        <motion.div variants={fadeUp} style={{ gridColumn: 'span 6' }} className="dash-card">
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', margin: '0 0 2px' }}>
                  Top Selling Medicines
                </h3>
                <p style={{ fontSize: '0.72rem', color: 'var(--gray-400)', margin: 0 }}>by units sold Â· last 30 days</p>
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '4px 10px', borderRadius: 100, background: 'var(--navy)', color: 'white' }}>
                30 Days
              </span>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ flexShrink: 0, width: 110 }}>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.8rem', color: 'var(--navy)', margin: '0 0 0.25rem', lineHeight: 1 }}>
                  {totalUnitsSold.toLocaleString()}
                </p>
                <p style={{ fontSize: '0.7rem', color: 'var(--gray-400)', margin: 0, lineHeight: 1.3 }}>units sold this month</p>
              </div>
              <div style={{ flex: 1, height: 190, minWidth: 0 }}>
                {topMeds[0]?.units === 0 ? (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)', fontSize: '0.82rem' }}>
                    No sales data yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topMeds} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}u`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} axisLine={false} tickLine={false}
                        tickFormatter={v => v.length > 14 ? v.slice(0, 14) + '…' : v} />
                      <Tooltip
                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                        contentStyle={{ borderRadius: 12, border: '1px solid var(--dash-border)', boxShadow: 'var(--dash-shadow)' }}
                        formatter={(v, name) => [name === 'revenue' ? fmt(v) : `${v} units`, name === 'revenue' ? 'Revenue' : 'Units Sold']}
                      />
                      <Bar dataKey="units" name="units" radius={[0, 6, 6, 0]} isAnimationActive animationDuration={1200} animationBegin={300} barSize={18}>
                        {topMeds.map((_, i) => (
                          <Cell key={i} fill={['#0f0f0f', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'][i] || '#93c5fd'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── ROW 4 CENTER: Low Stock Widget ──────────────────────────── */}
        <motion.div variants={fadeUp} style={{ gridColumn: 'span 3' }} className="dash-card">
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', margin: 0 }}>Low Stock</h3>
                <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                  style={{ background: 'var(--red)', color: 'white', borderRadius: 100, fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px' }}>
                  {lowStockItems.length}
                </motion.div>
              </div>
              <ArrowUpRight size={16} color="var(--gray-400)" style={{ cursor: 'pointer' }}
                onClick={() => navigate('/pharmacist/dashboard/inventory')} />
            </div>

            <div>
              {lowStockItems.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)', textAlign: 'center', padding: '1.5rem 0' }}>✅ All stocked</p>
              ) : lowStockItems.map((item, i) => (
                <motion.div key={i} whileHover={{ background: 'var(--dash-bg)', borderRadius: 8 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', borderBottom: i !== lowStockItems.length - 1 ? '1px solid var(--dash-border)' : 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: item.level === 'out' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Package size={13} color={item.level === 'out' ? '#ef4444' : '#f59e0b'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--navy)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </p>
                    <p style={{ fontSize: '0.68rem', color: 'var(--gray-400)', fontWeight: 300, margin: 0 }}>
                      {item.level === 'out' ? 'Out of stock' : `${item.stock} left Â· Min ${item.minStock}`}
                    </p>
                  </div>
                  <span style={{ background: item.level === 'out' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', color: item.level === 'out' ? '#ef4444' : '#f59e0b', fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 100, flexShrink: 0 }}>
                    {item.level === 'out' ? '0' : item.stock}
                  </span>
                </motion.div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--blue)', fontWeight: 500, cursor: 'pointer' }}
                onClick={() => navigate('/pharmacist/dashboard/suppliers')}>
                Order from suppliers >
              </span>
            </div>
          </div>
        </motion.div>

        {/* ── ROW 4 RIGHT: AI Assistant ─────────────────────────────── */}
        <motion.div variants={fadeUp} style={{ gridColumn: 'span 3', background: 'var(--dash-card-dark)', borderRadius: 'var(--dash-radius)', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bot size={18} color="white" />
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', color: 'white', margin: 0 }}>AI Assistant</h3>
            </div>
            <ArrowUpRight size={16} color="rgba(255,255,255,0.5)" style={{ cursor: 'pointer' }}
              onClick={() => navigate('/pharmacist/dashboard/ai-assistant')} />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '0.75rem', maxHeight: 110, scrollbarWidth: 'none' }}>
            <AnimatePresence>
              {aiMessages.slice(-2).map((msg, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Bot size={11} color="white" />
                    </div>
                  )}
                  <p style={{ fontSize: '0.72rem', color: msg.role === 'user' ? 'white' : 'rgba(255,255,255,0.7)', background: msg.role === 'user' ? 'var(--blue)' : 'rgba(255,255,255,0.08)', borderRadius: msg.role === 'user' ? '8px 8px 0 8px' : '0 8px 8px 8px', padding: '0.4rem 0.6rem', lineHeight: 1.5, fontWeight: 300, margin: 0, maxWidth: '85%' }}>
                    {msg.content}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.65rem', overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
            {['Low stock?', 'Today sales', 'Top meds'].map(chip => (
              <motion.div key={chip} whileHover={{ background: 'rgba(255,255,255,0.15)' }} whileTap={{ scale: 0.95 }}
                onClick={() => handleQuickPrompt(chip)}
                style={{ flexShrink: 0, padding: '0.25rem 0.65rem', borderRadius: 100, border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.68rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
                {chip}
              </motion.div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.08)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', padding: '0.35rem 0.5rem' }}>
            <input value={aiInput} onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAiSend()}
              placeholder="Ask about your pharmacy…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '0.75rem', fontFamily: 'var(--font-body)', fontWeight: 300 }} />
            {isTyping ? (
              <div style={{ display: 'flex', gap: 2, padding: '0 4px' }}>
                {[0, 1, 2].map(i => (
                  <motion.div key={i} animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, delay: i * 0.1, repeat: Infinity }}
                    style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }} />
                ))}
              </div>
            ) : (
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handleAiSend}
                style={{ background: 'var(--blue)', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <Send size={13} color="white" />
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* ── ROW 5: Recent Orders Table ───────────────────────────────── */}
        <motion.div variants={fadeUp} style={{ gridColumn: 'span 12' }} className="dash-card">
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', margin: 0 }}>Recent Orders</h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--gray-400)' }}>Last 10 orders</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--blue)', fontWeight: 500, cursor: 'pointer' }}
                onClick={() => navigate('/pharmacist/dashboard/orders')}>
                View all orders >
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--dash-border)', color: 'var(--gray-400)' }}>
                    {['Order ID', 'Customer', 'Items', 'Amount', 'Payment', 'Status', 'Time', 'Action'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>No orders yet</td></tr>
                  ) : recentOrders.map((order, i) => {
                    const statusCfg = {
                      pending:    { bg: '#fef3c7', color: '#d97706', label: 'Pending'    },
                      processing: { bg: '#dbeafe', color: '#2563eb', label: 'Processing' },
                      delivered:  { bg: '#d1fae5', color: '#059669', label: 'Delivered'  },
                      cancelled:  { bg: '#fee2e2', color: '#dc2626', label: 'Cancelled'  },
                    }[order.status] || { bg: '#f1f5f9', color: '#64748b', label: order.status || 'Open' };

                    const payBadge = order.paymentStatus === 'paid'
                      ? { bg: '#d1fae5', color: '#059669', label: 'Paid' }
                      : { bg: '#fef3c7', color: '#d97706', label: 'Unpaid' };

                    return (
                      <motion.tr key={order.id}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        style={{ borderBottom: '1px solid var(--dash-border)', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--dash-bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '0.85rem 0.5rem', fontWeight: 600, color: 'var(--navy)' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', background: 'var(--dash-bg)', padding: '2px 6px', borderRadius: 4 }}>
                            {order.orderNumber || order.id}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem', color: 'var(--navy)', fontWeight: 500 }}>
                          {order.patient?.name || 'Walk-in'}
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem', color: 'var(--gray-600)' }}>
                          {order.itemCount ? `${order.itemCount} item${order.itemCount > 1 ? 's' : ''}` : '—'}
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem', fontWeight: 600 }}>
                          {fmt(order.totalAmount)}
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          <span style={{ background: payBadge.bg, color: payBadge.color, padding: '3px 8px', borderRadius: 100, fontSize: '0.68rem', fontWeight: 600 }}>
                            {payBadge.label}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          <span style={{ background: statusCfg.bg, color: statusCfg.color, padding: '3px 8px', borderRadius: 100, fontSize: '0.68rem', fontWeight: 600 }}>
                            {statusCfg.label}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem', color: 'var(--gray-400)' }}>
                          {order.createdAt ? new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          <motion.button whileHover={{ scale: 1.1, color: 'var(--blue)' }} whileTap={{ scale: 0.9 }}
                            onClick={() => handleProcessOrder(order)}
                            style={{ border: 'none', background: 'transparent', padding: '0.4rem', cursor: 'pointer', color: 'var(--gray-400)' }}>
                            <ChevronRight size={18} />
                          </motion.button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────── */}
      <OrderDetailModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        order={selectedOrder}
      />

      {/* ── PRINT STYLES ────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          .no-print  { display: none !important; }
          body        { background: white !important; }
          .dash-card  { box-shadow: none !important; border: 1px solid #eee !important; }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </motion.div>
  );
}
