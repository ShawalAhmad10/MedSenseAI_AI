// SRS SD-04: Order history and delivery timeline for storefront users.

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Package, Loader2 } from 'lucide-react';
import { getCustomerOrders, getOrderById } from '../../services/storefrontOrderService';
import api from '../../services/api';

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState(null);

  useEffect(() => {
    // Load customer's orders from backend with items
    async function loadOrders() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Get ONLY this customer's orders
        const response = await getCustomerOrders(user.id, user.email, user.phone);
        const customerOrders = response.data?.orders || [];

        // Fetch items for each order
        const ordersWithItems = await Promise.all(
          customerOrders.map(async (order) => {
            try {
              const itemsRes =
                await getOrderById(
                  order.invoice_id,
                  user.id,
                  user.email,
                  user.phone
                );
              const orderData = itemsRes.data || {};
              return {
                ...order,
                items: orderData.items || []
              };
            } catch (err) {
              return { ...order, items: [] };
            }
          })
        );

        setOrders(ordersWithItems);
      } catch (err) {
        console.error('Failed to load orders:', err);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    }
    
    loadOrders();
    
    // Refresh committed updates from the shared PostgreSQL backend.
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'delivered': return 'var(--sf-success)';
      case 'shipped': case 'in_transit': return 'var(--sf-info)';
      case 'processing': case 'confirmed': return 'var(--sf-warning)';
      case 'pending': return 'var(--sf-warning)';
      case 'cancelled': return 'var(--sf-danger)';
      default: return 'var(--sf-muted)';
    }
  };

  const getDeliveryTimeline = (status) => {
    const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
    const currentIndex = statuses.indexOf(status?.toLowerCase());
    return statuses.map((s, idx) => ({
      label: s.charAt(0).toUpperCase() + s.slice(1),
      completed: idx <= currentIndex,
      active: idx === currentIndex
    }));
  };

  const getPaymentStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'paid': return 'var(--sf-success)';
      case 'unpaid': return 'var(--sf-warning)';
      default: return 'var(--sf-muted)';
    }
  };

  if (!user) {
    return (
      <div className="storefront-shell">
        <div className="sf-card sf-section-card">
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <Package size={48} color="var(--sf-muted)" style={{ margin: '0 auto 1rem' }} />
            <h2>Track Your Orders</h2>
            <p className="sf-muted">Sign in to view your order history and track deliveries</p>
            <button className="sf-button" style={{ marginTop: '1rem' }}>Sign In</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="storefront-shell">
      <div className="sf-card sf-section-card">
        <div className="sf-page-header">
          <div>
            <h1>Your Orders</h1>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Track your orders and view delivery updates
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <Loader2 size={32} color="var(--sf-primary)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
            <p className="sf-muted">Loading your orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <Package size={48} color="var(--sf-muted)" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <h3>No Orders Yet</h3>
            <p className="sf-muted">Start shopping to see your order history here</p>
            <button className="sf-button" style={{ marginTop: '1rem' }} onClick={() => window.location.href = '/'}>
              Browse Medicines
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {orders.map((order) => (
              <article 
                className="sf-summary-block" 
                key={order.invoice_id}
                style={{
                  border: '2px solid var(--sf-border)',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  background: 'var(--sf-surface)'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--sf-border)' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '1.1rem', color: 'var(--sf-text)' }}>
                      Order {order.invoice_number}
                    </strong>
                    <span className="sf-muted" style={{ fontSize: '0.9rem' }}>
                      {new Date(order.created_at).toLocaleDateString('en-US', { 
                        month: 'long', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ display: 'block', fontSize: '1.2rem', color: 'var(--sf-primary)' }}>
                      PKR {parseFloat(order.total_amount).toLocaleString()}
                    </strong>
                    <span 
                      style={{ 
                        display: 'inline-block',
                        marginTop: '0.3rem',
                        padding: '4px 12px',
                        borderRadius: '999px',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        backgroundColor: getStatusColor(order.delivery_status),
                        color: '#fff'
                      }}
                    >
                      {order.delivery_status?.charAt(0).toUpperCase() + order.delivery_status?.slice(1)}
                    </span>
                  </div>
                </div>

                {/* Items */}
                {order.items && order.items.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <strong style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                      Items ({order.items.length})
                    </strong>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {(expandedOrder === order.invoice_id ? order.items : order.items.slice(0, 3)).map((item, idx) => (
                        <div 
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '0.5rem',
                            background: 'var(--sf-surface-alt)',
                            borderRadius: '8px',
                            fontSize: '0.9rem'
                          }}
                        >
                          <span>{item.product_title} × {item.quantity}</span>
                          <span style={{ fontWeight: '600' }}>PKR {parseFloat(item.total_price).toLocaleString()}</span>
                        </div>
                      ))}
                      {order.items.length > 3 && expandedOrder !== order.invoice_id && (
                        <button
                          onClick={() => setExpandedOrder(order.invoice_id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--sf-primary)',
                            fontSize: '0.85rem',
                            padding: '0.25rem 0.5rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontWeight: '600'
                          }}
                        >
                          + Show {order.items.length - 3} more item(s)
                        </button>
                      )}
                      {expandedOrder === order.invoice_id && order.items.length > 3 && (
                        <button
                          onClick={() => setExpandedOrder(null)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--sf-primary)',
                            fontSize: '0.85rem',
                            padding: '0.25rem 0.5rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontWeight: '600'
                          }}
                        >
                          - Show less
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Delivery Timeline */}
                {expandedOrder === order.invoice_id && order.delivery_status !== 'cancelled' && (
                  <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--sf-surface-alt)', borderRadius: '12px' }}>
                    <strong style={{ display: 'block', marginBottom: '1rem', fontSize: '0.9rem' }}>
                      Delivery Timeline
                    </strong>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                      {/* Progress line */}
                      <div style={{
                        position: 'absolute',
                        top: '15px',
                        left: '20px',
                        right: '20px',
                        height: '2px',
                        background: 'var(--sf-border)',
                        zIndex: 0
                      }} />
                      {getDeliveryTimeline(order.delivery_status).map((step, idx) => (
                        <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: step.completed ? 'var(--sf-success)' : 'var(--sf-surface)',
                            border: `2px solid ${step.completed ? 'var(--sf-success)' : 'var(--sf-border)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: '0.5rem',
                            fontWeight: '700',
                            color: step.completed ? 'white' : 'var(--sf-muted)',
                            fontSize: '0.75rem'
                          }}>
                            {step.completed ? '✓' : idx + 1}
                          </div>
                          <span style={{
                            fontSize: '0.75rem',
                            textAlign: 'center',
                            color: step.active ? 'var(--sf-primary)' : step.completed ? 'var(--sf-text)' : 'var(--sf-muted)',
                            fontWeight: step.active ? '600' : '400'
                          }}>
                            {step.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '1rem', borderTop: '1px solid var(--sf-border)' }}>
                  <span 
                    style={{
                      padding: '6px 12px',
                      borderRadius: '999px',
                      fontSize: '0.8rem',
                      backgroundColor: getPaymentStatusColor(order.payment_status),
                      color: '#fff',
                      fontWeight: '600'
                    }}
                  >
                    {order.payment_status === 'paid' ? '✓ Paid' : order.payment_status === 'unpaid' ? 'Payment Pending' : 'Partially Paid'}
                  </span>
                  <span className="sf-badge">
                    {order.payment_method === 'cash' ? 'Cash on Delivery' : order.payment_method === 'card' ? 'Card Payment' : 'Online Payment'}
                  </span>
                  {order.item_count && (
                    <span className="sf-badge">{order.item_count} item(s)</span>
                  )}
                </div>

                {order.delivery_address && (
                  <p className="sf-muted" style={{ marginTop: '0.75rem', fontSize: '0.9rem', paddingTop: '0.75rem', borderTop: '1px solid var(--sf-border)' }}>
                    📍 Delivery to: {order.delivery_address}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
