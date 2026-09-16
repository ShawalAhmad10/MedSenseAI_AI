// src/services/orderService.js
import api from './api';

/**
 * Order Service
 * Base: /api/orders
 *
 * New API response shape:
 *   GET /           → { success, data: { orders: [], pagination: {} } }
 *   GET /my-orders  → { success, data: { orders: [], pagination: {} } }
 *   GET /stats      → { success, data: { total, pending, delivered, ... } }
 *   POST /          → { success, message, data: { orderId, orderNumber, ... } }
 *   PATCH /:id/status → { success, message, data: <order> }
 *   DELETE /:id/cancel → { success, message }
 */

export const orderService = {

  // ── Patient ───────────────────────────────────────────────────────────────

  /** Place order. data = { cartId, deliveryAddress, paymentMethod, deliveryType } */
  placeOrder: (data) =>
    api.post('/orders', data).then(r => r.data),

  /** Patient's own orders */
  getMyOrders: (params = {}) =>
    api.get('/orders/my-orders', { params }).then(r => r.data),

  /** Cancel order */
  cancelOrder: (orderId, reason = '') =>
    api.delete(`/orders/${orderId}/cancel`, { data: { reason } }).then(r => r.data),

  // ── Pharmacist ────────────────────────────────────────────────────────────

  /** All orders for pharmacist (branch-scoped) */
  getAllOrders: (params = {}) =>
    api.get('/orders', { params }).then(r => r.data),

  /** Update order status */
  updateOrderStatus: (orderId, status, paymentStatus = null) =>
    api.patch(`/orders/${orderId}/status`, { status, paymentStatus }).then(r => r.data),

  /** Dashboard stats */
  getOrderStats: (params = {}) =>
    api.get('/orders/stats', { params }).then(r => r.data),

  // ── Shared ────────────────────────────────────────────────────────────────

  /** Single order detail */
  getOrderById: (orderId) =>
    api.get(`/orders/${orderId}`).then(r => r.data),

  /** Order history (completed/cancelled) */
  getOrderHistory: (params = {}) =>
    api.get('/orders/history', { params }).then(r => r.data),

  // ── Dashboard widget helper ───────────────────────────────────────────────
  getRecentOrders: async (limit = 10) => {
    try {
      const res = await api.get('/orders', { params: { limit, page: 1, sortBy: 'created_at', sortDir: 'desc' } });
      const orders = res.data?.data?.orders ?? res.data?.orders ?? [];
      // Map to dashboard widget shape expected by Dashboard.jsx
      const statusMap = { pending:'pending', confirmed:'processing', processing:'processing', ready:'processing', shipped:'processing', delivered:'completed', cancelled:'cancelled', refunded:'cancelled' };
      return orders.map((o) => ({
        id:        o.orderNumber  ?? o.order_number ?? o.id?.slice(0,8),
        patient:   o.user?.full_name ?? 'Customer',
        medicines: (o.items ?? []).map(i => i.productName ?? i.name).filter(Boolean).join(', ') || '—',
        amount:    o.totalAmount  ?? o.total_amount ?? 0,
        status:    statusMap[o.orderStatus ?? o.deliveryStatus ?? 'pending'] ?? 'pending',
        time:      formatTimeAgo(o.createdAt ?? o.created_at),
      }));
    } catch {
      return [];
    }
  },
};

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ago`;
  return `${mins}m ago`;
}

export default orderService;
