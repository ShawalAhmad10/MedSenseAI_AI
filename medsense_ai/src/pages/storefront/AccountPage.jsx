import React, { useEffect, useState } from 'react';
import { User, MapPin, Lock, Bell, Package, FileText, DollarSign, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCustomerDetails, updateCustomer, getCustomerLedger } from '../../services/customerService';
import { getCustomerOrders, getOrderById } from '../../services/storefrontOrderService';
import api from '../../services/api';

export default function AccountPage() {
  const { isAuthenticated, openAuthModal, user } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [customerData, setCustomerData] = useState(null);
  const [customerAccount, setCustomerAccount] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    address: ''
  });

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      loadAllData();
    }
  }, [isAuthenticated, user]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadCustomerData(),
        loadOrders(),
        loadLedger()
      ]);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomerData = async () => {
    try {
      const data = await getCustomerDetails(user.id);
      setCustomerData(data.customer);
      setCustomerAccount(data.account);
      setForm({
        name: data.customer.name || '',
        email: data.customer.email || '',
        phone: data.customer.phone || '',
        city: data.customer.city || '',
        address: data.customer.address || ''
      });
    } catch (error) {
      console.error('Failed to load customer data:', error);
    }
  };

  const loadOrders = async () => {
    try {
      const response = await getCustomerOrders(user.id, user.email, user.phone);
      const customerOrders = response.data?.orders || [];
      
      // Get items for each order
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
            return {
              ...order,
              items: itemsRes.data?.items || []
            };
          } catch {
            return { ...order, items: [] };
          }
        })
      );
      
      setOrders(ordersWithItems);
    } catch (error) {
      console.error('Failed to load orders:', error);
    }
  };

  const loadLedger = async () => {
    try {
      const ledgerData = await getCustomerLedger(user.id);
      setLedger(ledgerData);
    } catch (error) {
      console.error('Failed to load ledger:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateCustomer(user.id, form);
      await loadCustomerData();
      setIsEditing(false);
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Failed to update profile:', error);
      alert(error.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'delivered': return '#10b981';
      case 'shipped': return '#3b82f6';
      case 'processing': return '#f59e0b';
      case 'confirmed': return '#3b82f6';
      case 'pending': return '#f59e0b';
      case 'cancelled': return '#ef4444';
      default: return '#64748b';
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="storefront-shell">
        <div className="sf-card sf-section-card">
          <h1 style={{ fontFamily: 'var(--font-display)' }}>Account area</h1>
          <p className="sf-muted">
            Sign in to manage profile, addresses, security, notifications, prescription history, and order updates.
          </p>
          <button className="sf-button" onClick={() => openAuthModal('account')} type="button">
            Sign in to account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="storefront-shell">
      <section className="sf-card sf-section-card">
        <div className="sf-page-header">
          <div>
            <h1>{user?.name || 'My Account'}</h1>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Manage your profile, orders, and account information
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--sf-border)', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { id: 'profile', label: 'Profile', icon: User },
            { id: 'account', label: 'Account', icon: DollarSign },
            { id: 'orders', label: 'Order History', icon: Package },
            { id: 'ledger', label: 'Transactions', icon: FileText },
            { id: 'addresses', label: 'Addresses', icon: MapPin },
            { id: 'security', label: 'Security', icon: Lock }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '3px solid var(--sf-primary)' : '3px solid transparent',
                color: activeTab === tab.id ? 'var(--sf-primary)' : 'var(--sf-muted)',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? '600' : '400',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {loading && activeTab !== 'profile' ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--sf-primary)' }} />
            <p className="sf-muted" style={{ marginTop: '1rem' }}>Loading...</p>
          </div>
        ) : (
          <>
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div style={{ maxWidth: '600px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={{ margin: 0 }}>Profile Information</h2>
                  {!isEditing && (
                    <button className="sf-button-secondary" onClick={() => setIsEditing(true)}>
                      Edit Profile
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div className="sf-field">
                    <label>Full Name</label>
                    {isEditing ? (
                      <input
                        className="sf-input"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    ) : (
                      <div className="sf-summary-block">{customerData?.name || 'Not set'}</div>
                    )}
                  </div>

                  <div className="sf-field">
                    <label>Email</label>
                    {isEditing ? (
                      <input
                        className="sf-input"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        disabled
                      />
                    ) : (
                      <div className="sf-summary-block">{customerData?.email || 'Not set'}</div>
                    )}
                  </div>

                  <div className="sf-field">
                    <label>Phone</label>
                    {isEditing ? (
                      <input
                        className="sf-input"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    ) : (
                      <div className="sf-summary-block">{customerData?.phone || 'Not set'}</div>
                    )}
                  </div>

                  <div className="sf-field">
                    <label>City</label>
                    {isEditing ? (
                      <input
                        className="sf-input"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                      />
                    ) : (
                      <div className="sf-summary-block">{customerData?.city || 'Not set'}</div>
                    )}
                  </div>

                  <div className="sf-field">
                    <label>Address</label>
                    {isEditing ? (
                      <textarea
                        className="sf-textarea"
                        rows={3}
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                      />
                    ) : (
                      <div className="sf-summary-block">{customerData?.address || 'Not set'}</div>
                    )}
                  </div>

                  {isEditing && (
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                      <button className="sf-button" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button className="sf-button-secondary" onClick={() => {
                        setIsEditing(false);
                        setForm({
                          name: customerData?.name || '',
                          email: customerData?.email || '',
                          phone: customerData?.phone || '',
                          city: customerData?.city || '',
                          address: customerData?.address || ''
                        });
                      }}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Account Tab */}
            {activeTab === 'account' && (
              <div>
                <h2 style={{ marginBottom: '1.5rem' }}>Account Information</h2>
                
                {customerAccount ? (
                  <div style={{ display: 'grid', gap: '1rem', maxWidth: '600px' }}>
                    <div className="sf-summary-block">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span className="sf-muted">Account Number</span>
                        <strong>{customerAccount.accountNumber}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span className="sf-muted">Current Balance</span>
                        <strong style={{ color: customerAccount.currentBalance > 0 ? '#ef4444' : '#10b981' }}>
                          PKR {parseFloat(customerAccount.currentBalance || 0).toFixed(2)}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span className="sf-muted">Credit Limit</span>
                        <strong>PKR {parseFloat(customerAccount.creditLimit || 0).toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span className="sf-muted">Available Credit</span>
                        <strong style={{ color: '#10b981' }}>
                          PKR {parseFloat(customerAccount.creditLimit - customerAccount.currentBalance || 0).toFixed(2)}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="sf-muted">Payment Terms</span>
                        <strong>{customerAccount.paymentTerms || 'Cash'}</strong>
                      </div>
                    </div>

                    <div className="sf-summary-block">
                      <h3 style={{ marginBottom: '0.75rem' }}>Account Summary</h3>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span className="sf-muted">Total Purchases</span>
                        <span>PKR {parseFloat(customerAccount.totalDebit || 0).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="sf-muted">Total Payments</span>
                        <span>PKR {parseFloat(customerAccount.totalCredit || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="sf-summary-block">
                    <p className="sf-muted">No account information available</p>
                  </div>
                )}
              </div>
            )}

            {/* Orders Tab */}
            {activeTab === 'orders' && (
              <div>
                <h2 style={{ marginBottom: '1rem' }}>Order History</h2>
                {orders.length === 0 ? (
                  <div className="sf-summary-block">
                    <p className="sf-muted">No orders yet. Start shopping to see your order history here.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {orders.map((order) => (
                      <div 
                        key={order.invoice_id}
                        className="sf-summary-block"
                        style={{
                          border: '2px solid var(--sf-border)',
                          borderRadius: '12px',
                          padding: '1.25rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                          <div>
                            <strong style={{ display: 'block', fontSize: '1.05rem' }}>
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
                            <strong style={{ display: 'block', fontSize: '1.15rem', color: 'var(--sf-primary)' }}>
                              PKR {parseFloat(order.total_amount).toFixed(2)}
                            </strong>
                            <span 
                              style={{ 
                                display: 'inline-block',
                                marginTop: '0.3rem',
                                padding: '4px 12px',
                                borderRadius: '999px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                backgroundColor: getStatusColor(order.delivery_status),
                                color: '#fff'
                              }}
                            >
                              {order.delivery_status?.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {order.items && order.items.length > 0 && (
                          <div style={{ marginBottom: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--sf-border)' }}>
                            <strong style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                              Items ({order.items.length})
                            </strong>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                              {order.items.map((item, idx) => (
                                <div 
                                  key={idx}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '0.5rem',
                                    background: 'var(--sf-surface-alt)',
                                    borderRadius: '6px',
                                    fontSize: '0.9rem'
                                  }}
                                >
                                  <span>{item.product_title} × {item.quantity}</span>
                                  <span style={{ fontWeight: '600' }}>
                                    PKR {parseFloat(item.total_price).toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '1rem', borderTop: '1px solid var(--sf-border)' }}>
                          <span className="sf-badge">
                            {order.payment_method === 'cash' ? 'Cash on Delivery' : 'Card Payment'}
                          </span>
                          <span className="sf-badge">
                            {order.payment_status === 'paid' ? '✓ Paid' : 'Payment Pending'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Ledger Tab */}
            {activeTab === 'ledger' && (
              <div>
                <h2 style={{ marginBottom: '1rem' }}>Transaction History</h2>
                {ledger.length === 0 ? (
                  <div className="sf-summary-block">
                    <p className="sf-muted">No transactions yet</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {ledger.map((entry, idx) => (
                      <div 
                        key={idx}
                        className="sf-summary-block"
                        style={{ padding: '1rem' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div>
                            <strong style={{ display: 'block' }}>
                              {entry.transactionType === 'invoice' ? '📦 Purchase' : '💰 Payment'}
                            </strong>
                            <span className="sf-muted" style={{ fontSize: '0.85rem' }}>
                              {entry.description || entry.referenceNumber}
                            </span>
                            <span className="sf-muted" style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                              {new Date(entry.transactionDate).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ 
                              color: entry.debitAmount > 0 ? '#ef4444' : '#10b981',
                              fontWeight: '600',
                              fontSize: '1rem'
                            }}>
                              {entry.debitAmount > 0 ? '-' : '+'} PKR {parseFloat(entry.debitAmount || entry.creditAmount || 0).toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--sf-muted)' }}>
                              Balance: PKR {parseFloat(entry.balance || 0).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Addresses Tab */}
            {activeTab === 'addresses' && (
              <div>
                <h2 style={{ marginBottom: '1rem' }}>Saved Addresses</h2>
                <div className="sf-summary-block">
                  <p><strong>Default Address:</strong></p>
                  <p className="sf-muted">{customerData?.address || 'No address saved yet'}</p>
                  {customerData?.city && (
                    <p className="sf-muted">City: {customerData.city}</p>
                  )}
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div>
                <h2 style={{ marginBottom: '1rem' }}>Security Settings</h2>
                <div className="sf-summary-block">
                  <p><strong>Change Password</strong></p>
                  <p className="sf-muted">Password management coming soon</p>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
