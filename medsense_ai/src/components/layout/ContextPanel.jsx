// src/components/layout/ContextPanel.jsx — Real backend data
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Package, DollarSign, AlertCircle, Users,
  ShoppingCart, ClipboardList, BarChart3, Users2, ChevronRight,
  Send, AlertTriangle
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import api from '../../services/api';

export default function ContextPanel() {
  const { showToast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const [todayStatsRes, totalStatsRes, invRes, ordersRes] = await Promise.all([
        api.get('/orders/stats/today').then(r => r.data?.data).catch(() => null),
        api.get('/orders/stats').then(r => r.data?.data).catch(() => null),
        // /api/products returns product list with stockQty calculated from stock_history
        api.get('/products?limit=20&sortBy=stockQty&sortDir=asc').then(r => {
          const data = r.data?.data;
          // products endpoint returns an array directly or wrapped in data
          if (Array.isArray(data)) return data;
          if (Array.isArray(r.data)) return r.data;
          return [];
        }).catch(() => []),
        api.get('/orders?limit=5&sortBy=created_at&sortDir=desc').then(r => r.data?.data?.orders ?? r.data?.data ?? []).catch(() => []),
      ]);

      // Build inventory alerts: items with low stock
      const lowStock = invRes
        .filter(i => {
          const qty = i.stockQty ?? i.quantity ?? i.stock_qty ?? 0;
          const min = i.minThreshold ?? i.min_threshold ?? i.product_min_threshold ?? 10;
          return qty < min;
        })
        .slice(0, 5)
        .map((item, idx) => {
          const qty  = item.stockQty ?? item.quantity ?? 0;
          const name = item.title ?? item.product_title ?? item.name ?? '—';
          return {
            id: idx + 1, name,
            detail: qty === 0 ? 'Out of stock' : `${qty} units (${qty < 5 ? 'critical' : 'low'})`,
            color: qty === 0 || qty < 5 ? 'var(--red)' : 'var(--amber)',
          };
        });

      // Build refill reminders from recent orders
      const refillDue = ordersRes.slice(0, 4).map((order, idx) => ({
        id: idx + 1,
        name: order.user?.full_name ?? order.patient?.name ?? 'Customer',
        lastOrder: Math.floor((Date.now() - new Date(order.createdAt ?? order.created_at).getTime()) / 86400000),
        medicine: order.items?.[0]?.productTitle ?? order.items?.[0]?.product_title ?? order.items?.[0]?.name ?? 'Product',
      }));

      setData({
        today: {
          orders: todayStatsRes?.today?.totalOrders ?? 0,
          revenue: todayStatsRes?.today?.totalRevenue ?? 0,
          pendingAlerts: todayStatsRes?.today?.pending ?? totalStatsRes?.pending ?? 0,
          totalOrders: totalStatsRes?.total ?? 0,
        },
        inventoryAlerts: lowStock.length > 0 ? lowStock : [
          { id: 1, name: 'All items stocked', detail: 'No low stock alerts', color: 'var(--green)' }
        ],
        refillDue: refillDue.length > 0 ? refillDue : [],
      });
    } catch (e) {
      console.error('ContextPanel load error:', e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleSendReminders = () => {
    showToast({ type: 'success', message: `Reminders sent to ${data?.refillDue?.length || 0} customers` });
  };

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <aside style={{ width: '280px', minWidth: '280px', background: 'var(--white)', borderLeft: '1px solid var(--dash-border)', height: '100vh', overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', scrollbarWidth: 'none', msOverflowStyle: 'none' }} className="no-scrollbar">

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--navy)', margin: 0 }}>Live Overview</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', margin: 0 }}>Today Â· {today}</p>
        </div>
        <motion.button whileHover={{ rotate: 180 }} whileTap={{ scale: 0.9 }} onClick={handleRefresh}
          style={{ background: 'var(--dash-bg)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--gray-600)' }}>
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {isRefreshing || !data ? (
          <motion.div key="shimmer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="dash-shimmer" style={{ height: i === 0 ? '140px' : '180px', borderRadius: '16px' }} />
            ))}
          </motion.div>
        ) : (
          <motion.div key="content" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* SECTION 1: TODAY'S SNAPSHOT */}
            <div className="dash-card" style={{ padding: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <SnapshotItem icon={Package} label="Today's Orders" value={data.today.orders} iconBg="#eff6ff" iconColor="#3b82f6" />
                <SnapshotItem icon={DollarSign} label="Today's Sales" value={`PKR ${data.today.revenue.toLocaleString()}`} iconBg="#ecfdf5" iconColor="#10b981" />
                <SnapshotItem icon={AlertCircle} label="Pending Orders" value={data.today.pendingAlerts} iconBg="#fff1f0" iconColor="#ef4444" badge={data.today.pendingAlerts > 0} />
                <SnapshotItem icon={ShoppingCart} label="Total Orders" value={data.today.totalOrders} iconBg="#f5f3ff" iconColor="#8b5cf6" />
              </div>
            </div>

            {/* SECTION 2: INVENTORY ALERTS */}
            <div className="dash-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Inventory Alerts</h4>
                  <span style={{ background: 'var(--red)', color: 'white', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '100px', fontWeight: 800 }}>
                    {data.inventoryAlerts.length}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {data.inventoryAlerts.map(alert => (
                  <div key={alert.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: alert.color, marginTop: '5px', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy)', margin: 0 }}>{alert.name}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--gray-400)', margin: 0 }}>{alert.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <a href="/pharmacist/dashboard/inventory" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--blue)', fontWeight: 600, textDecoration: 'none', marginTop: '1rem' }}>
                View All <ChevronRight size={12} />
              </a>
            </div>

            {/* SECTION 3: RECENT ORDERS (replaces mock refill) */}
            <div className="dash-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Recent Orders</h4>
                  <span style={{ background: 'var(--blue)', color: 'white', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '100px', fontWeight: 800 }}>
                    {data.refillDue.length}
                  </span>
                </div>
              </div>
              {data.refillDue.length === 0 ? (
                <p style={{ fontSize: '0.78rem', color: 'var(--gray-400)', margin: 0, textAlign: 'center', padding: '1rem 0' }}>No recent orders</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {data.refillDue.map(order => (
                    <div key={order.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--dash-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy)' }}>
                        {(order.name || 'U')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy)', margin: 0 }}>{order.name}</p>
                        <p style={{ fontSize: '0.68rem', color: 'var(--gray-400)', margin: 0 }}>
                          {order.lastOrder === 0 ? 'Today' : `${order.lastOrder}d ago`} Â· {order.medicine}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <a href="/pharmacist/dashboard/orders" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--blue)', fontWeight: 600, textDecoration: 'none', marginTop: '1rem' }}>
                View All Orders <ChevronRight size={12} />
              </a>
            </div>

            {/* SECTION 4: QUICK ACTIONS */}
            <div className="dash-card" style={{ padding: '1.25rem' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem' }}>Quick Actions</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <QuickActionButton icon={ShoppingCart} label="View Orders" href="/pharmacist/dashboard/orders" />
                <QuickActionButton icon={Package} label="Inventory" href="/pharmacist/dashboard/inventory" />
                <QuickActionButton icon={Users2} label="Lead Scoring" href="/pharmacist/dashboard/leads" />
                <QuickActionButton icon={BarChart3} label="Analytics" href="/pharmacist/dashboard/analytics" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </aside>
  );
}

function SnapshotItem({ icon: Icon, label, value, iconBg, iconColor, badge }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ width: 32, height: 32, borderRadius: '8px', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <Icon size={16} color={iconColor} />
        {badge && <div style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: 'var(--red)', border: '2px solid white' }} />}
      </div>
      <div>
        <p style={{ fontSize: '0.65rem', color: 'var(--gray-400)', fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</p>
        <p style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy)', margin: 0 }}>{value}</p>
      </div>
    </div>
  );
}

function QuickActionButton({ icon: Icon, label, href }) {
  return (
    <a href={href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.75rem', border: '1px solid var(--dash-border)', borderRadius: '12px', textDecoration: 'none', gap: '6px', transition: 'all 0.2s' }} className="quick-action-btn">
      <Icon size={18} color="var(--gray-600)" />
      <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--gray-600)', textAlign: 'center' }}>{label}</span>
      <style>{`
        .quick-action-btn:hover { background: var(--dash-bg); border-color: var(--blue-mid); transform: translateY(-2px); }
        .quick-action-btn:hover span { color: var(--blue); }
      `}</style>
    </a>
  );
}
