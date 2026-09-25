// src/hooks/useOrders.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { orderService } from '../services/orderService';
import { useToast } from './useToast';

const AUTH_KEY = 'medsense_auth_user';

// Always read fresh from storage — never stale
function getAuthData() {
  try {
    // sessionStorage first (most recent login)
    const s = sessionStorage.getItem(AUTH_KEY);
    if (s) { const d = JSON.parse(s); if (d?.token && d?.role) return d; }
    const l = localStorage.getItem(AUTH_KEY);
    if (l) { const d = JSON.parse(l); if (d?.token && d?.role) return d; }
  } catch {}
  return null;
}

function getRole() {
  return getAuthData()?.role || null;
}

export function useOrders() {
  const { showToast } = useToast();

  // Read role fresh every render — not cached
  const role = getRole();

  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({
    totalOrders: 0, newOrders: 0, processing: 0, ready: 0,
    dispatched: 0, delivered: 0, cancelled: 0,
    totalRevenue: 0, todayRevenue: 0, todayOrders: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const searchTimeout = useRef(null);
  const fetchingRef = useRef(false);

  // ── Fetch orders ──────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (overrides = {}) => {
    if (fetchingRef.current) return; // prevent concurrent fetches
    fetchingRef.current = true;
    setIsLoading(true);
    try {
      const currentRole = getRole(); // always fresh
      if (!currentRole) return;

      const params = {
        page: 1, limit: 100,
        search: overrides.search ?? searchQuery,
        status: ((overrides.tab ?? activeTab) !== 'All') ? (overrides.tab ?? activeTab) : '',
        dateFrom: overrides.dateFrom ?? dateRange.from,
        dateTo:   overrides.dateTo   ?? dateRange.to,
        sortBy:   sortField,
        sortDir:  sortDir,
      };

      const result = currentRole === 'pharmacist'
        ? await orderService.getAllOrders(params)
        : await orderService.getMyOrders(params);

      // New API: { success, data: { orders: [], pagination: {} } }
      const payload = result?.data ?? result;
      const data    = payload?.orders ?? payload ?? [];
      setOrders(data);
      setTotal(payload?.pagination?.total ?? result.total ?? data.length);
    } catch (err) {
      console.error('fetchOrders error:', err.message);
    } finally {
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [searchQuery, activeTab, dateRange, sortField, sortDir]);

  // ── Fetch stats ───────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (getRole() !== 'pharmacist') return;
    try {
      const result = await orderService.getOrderStats();
      // New API: { success, data: { total, pending, delivered, ... } }
      if (result?.data) setStats(result.data);
    } catch (err) {
      console.error('fetchStats error:', err.message);
    }
  }, []);

  // ── Initial + auto-refresh ────────────────────────────────────────────────
  useEffect(() => {
    fetchOrders();
    fetchStats();
    // Auto-refresh every 30s for pharmacist
    const interval = setInterval(() => {
      if (getRole() === 'pharmacist') {
        fetchOrders();
        fetchStats();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  // ── Re-fetch when filters change ──────────────────────────────────────────
  useEffect(() => {
    fetchOrders();
  }, [activeTab, dateRange, sortField, sortDir]); // eslint-disable-line

  // ── Debounced search ──────────────────────────────────────────────────────
  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchOrders({ search: value }), 400);
  }, [fetchOrders]);

  // ── Update order status (pharmacist only) ─────────────────────────────────
  const updateStatus = useCallback(async (orderId, newStatus, paymentStatus = null) => {
    if (getRole() !== 'pharmacist') {
      showToast({ type: 'error', message: 'Only pharmacists can update order status' });
      return;
    }

    // Save snapshot for rollback
    const snapshot = orders.map(o => ({ ...o }));

    // Optimistic update immediately
    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? { ...o, orderStatus: newStatus, ...(paymentStatus ? { paymentStatus } : {}) }
        : o
    ));

    setIsUpdating(true);
    try {
      const result = await orderService.updateOrderStatus(orderId, newStatus, paymentStatus);
      if (!result?.success) throw new Error(result?.message || 'Update failed');
      showToast({ type: 'success', message: `Order status → ${newStatus}` });
      // Refresh from DB to confirm
      await fetchOrders();
      await fetchStats();
    } catch (err) {
      console.error('updateStatus error:', err);
      setOrders(snapshot); // rollback
      showToast({ type: 'error', message: err.response?.data?.message || err.message || 'Status update failed' });
    } finally {
      setIsUpdating(false);
    }
  }, [orders, fetchOrders, fetchStats, showToast]);

  // ── Cancel order (user only) ──────────────────────────────────────────────
  const cancelOrder = useCallback(async (orderId) => {
    try {
      await orderService.cancelOrder(orderId);
      showToast({ type: 'success', message: 'Order cancelled' });
      await fetchOrders();
    } catch (err) {
      showToast({ type: 'error', message: err.response?.data?.message || 'Failed to cancel' });
    }
  }, [fetchOrders, showToast]);

  // ── Tab counts ────────────────────────────────────────────────────────────
  const getTabCount = useCallback((tab) => {
    if (tab === 'All') return total;
    return orders.filter(o => (o.orderStatus ?? o.deliveryStatus) === tab).length;
  }, [orders, total]);

  // ── Client-side filter ────────────────────────────────────────────────────
  const filteredOrders = orders.filter(o => {
    // New API uses orderStatus; old used deliveryStatus — handle both
    const status = o.orderStatus ?? o.deliveryStatus ?? '';
    if (activeTab !== 'All' && status !== activeTab) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (o.orderNumber || '').toLowerCase().includes(q) ||
             (o.user?.full_name || o.patient?.name || '').toLowerCase().includes(q);
    }
    return true;
  });

  return {
    orders, filteredOrders, stats, isLoading, isUpdating, total, role,
    activeTab, setActiveTab,
    searchQuery, handleSearchChange,
    dateRange, setDateRange,
    sortField, setSortField, sortDir, setSortDir,
    updateStatus, cancelOrder, getTabCount,
    refetch: fetchOrders, refetchStats: fetchStats,
  };
}
