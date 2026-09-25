// src/components/layout/TopBar.jsx — Real user data + real notifications
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { Settings, Bell, Package, ShoppingCart, CheckCircle, X, LogOut, Check } from 'lucide-react';
import { usePharmacistAuth } from '../../hooks/usePharmacistAuth';
import api from '../../services/api';
const POLL_INTERVAL = 10000; // 10 seconds for real-time feel

const tabs = [
  { id: 'dashboard', label: 'Dashboard',    path: '/pharmacist/dashboard' },
  { id: 'analytics', label: 'Analytics',    path: '/pharmacist/dashboard/analytics' },
  { id: 'inventory', label: 'Inventory',    path: '/pharmacist/dashboard/inventory' },
  { id: 'orders',    label: 'Orders',       path: '/pharmacist/dashboard/orders' },
  { id: 'ai',        label: 'AI Assistant', path: '/pharmacist/dashboard/ai-assistant' },
];

function getTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs  > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
}

const iconMap = {
  new_order: ShoppingCart,
  low_stock: Package,
  out_of_stock: Package,
  order_update: ShoppingCart,
  system: Bell,
};

const colorMap = {
  new_order: { icon: '#3b82f6', bg: '#eff6ff' },
  low_stock: { icon: '#f59e0b', bg: '#fffbeb' },
  out_of_stock: { icon: '#ef4444', bg: '#fef2f2' },
  order_update: { icon: '#10b981', bg: '#f0fdf4' },
  system: { icon: '#6b7280', bg: '#f9fafb' },
};

export default function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = usePharmacistAuth();
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showReadNotifications, setShowReadNotifications] = useState(false);
  const notifRef = useRef(null);

  const activeTab = tabs.find((t) => {
    if (t.path === '/pharmacist/dashboard') return location.pathname === '/pharmacist/dashboard';
    return location.pathname.startsWith(t.path);
  })?.id || 'dashboard';

  const fullName = user?.fullName || user?.full_name || user?.name || 'Pharmacist';
  const email = user?.email || '';
  const initials = fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    await logout();
  };

  // Fetch notifications from backend
  const loadNotifs = useCallback(async () => {
    try {
      const response = await api.get('/notifications');
      
      if (response.data?.success) {
        const dbNotifications = response.data.notifications || [];
        
        // Transform to match old format
        const transformed = dbNotifications.map(notif => ({
          id: notif.id,
          type: notif.type,
          icon: iconMap[notif.type] || Bell,
          color: colorMap[notif.type]?.icon || '#6b7280',
          bg: colorMap[notif.type]?.bg || '#f9fafb',
          title: notif.title,
          message: notif.message,
          time: getTimeAgo(notif.createdAt),
          unread: !notif.isRead,
          metadata: notif.metadata,
        }));
        
        setNotifications(transformed);
      }
    } catch (e) {
      console.error('Notifications load error:', e.message);
    }
  }, []);

  // Load on mount + poll every 10s
  useEffect(() => {
    loadNotifs();
    const interval = setInterval(loadNotifs, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadNotifs]);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (notifRef.current && !notifRef.current.contains(e.target))
        setShowNotifications(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifications.filter(n => n.unread).length;
  const unreadNotifications = notifications.filter(n => n.unread);
  const readNotifications = notifications.filter(n => !n.unread);

  const markAsRead = async (notificationId) => {
    try {
      await api.post(`/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, unread: false } : n)
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${notificationId}`);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  return (
    <div style={{ height: 60, background: 'white', borderBottom: '1px solid var(--dash-border)', padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0, zIndex: 10 }}>

      {/* Tab navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--dash-bg)', borderRadius: 100, padding: '4px', flex: 1, maxWidth: 480 }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <motion.button key={tab.id} onClick={() => navigate(tab.path)} layout
              style={{ flex: 1, padding: '0.45rem 1rem', borderRadius: 100, border: 'none', fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: isActive ? 600 : 400, color: isActive ? 'white' : 'var(--gray-600)', background: 'transparent', cursor: 'pointer', position: 'relative', whiteSpace: 'nowrap', outline: 'none' }}>
              {isActive && (
                <motion.div layoutId="tab-pill"
                  style={{ position: 'absolute', inset: 0, borderRadius: 100, background: 'var(--navy)', zIndex: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
              )}
              <span style={{ position: 'relative', zIndex: 1 }}>{tab.label}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Right icons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>

        <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/pharmacist/dashboard/settings')}
          style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'white' }}>
          <Settings size={16} color="var(--gray-600)" />
        </motion.div>

        {/* Logout Button */}
        <motion.div 
          whileHover={{ scale: 1.08 }} 
          whileTap={{ scale: 0.95 }} 
          onClick={handleLogout}
          title="Logout"
          style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'white' }}>
          <LogOut size={16} color="#ef4444" />
        </motion.div>

        {/* Notification bell */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <motion.div whileHover={{ scale: 1.08 }} onClick={() => setShowNotifications(p => !p)}
            style={{ position: 'relative', cursor: 'pointer', width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white' }}>
            <Bell size={16} color="var(--gray-600)" />
            {unreadCount > 0 && (
              <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                style={{ position: 'absolute', top: -1, right: -1, width: 16, height: 16, borderRadius: '50%', background: '#ef4444', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 800, color: 'white' }}>
                {unreadCount}
              </motion.div>
            )}
          </motion.div>

          <AnimatePresence>
            {showNotifications && (
              <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
                style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 340, background: 'white', borderRadius: 16, border: '1px solid var(--dash-border)', boxShadow: '0 16px 48px rgba(0,0,0,0.12)', zIndex: 9999, overflow: 'hidden' }}>

                <div style={{ padding: '1rem 1.25rem 0.75rem', borderBottom: '1px solid var(--dash-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: 0, fontWeight: 700, color: 'var(--navy)', fontSize: '0.9rem' }}>Notifications</h4>
                    {unreadCount > 0 && <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--gray-400)' }}>{unreadCount} unread</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} style={{ background: 'none', border: 'none', color: '#10b981', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Check size={12} />
                        Mark all read
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {/* Tab buttons for unread/read */}
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--gray-100)', background: 'var(--gray-50)' }}>
                    <button
                      onClick={() => setShowReadNotifications(false)}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        background: !showReadNotifications ? 'white' : 'transparent',
                        border: !showReadNotifications ? '1px solid var(--dash-border)' : 'none',
                        borderRadius: 8,
                        fontWeight: !showReadNotifications ? 600 : 400,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        color: 'var(--navy)',
                      }}
                    >
                      Unread ({unreadCount})
                    </button>
                    <button
                      onClick={() => setShowReadNotifications(true)}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        background: showReadNotifications ? 'white' : 'transparent',
                        border: showReadNotifications ? '1px solid var(--dash-border)' : 'none',
                        borderRadius: 8,
                        fontWeight: showReadNotifications ? 600 : 400,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        color: 'var(--navy)',
                      }}
                    >
                      Read ({readNotifications.length})
                    </button>
                  </div>

                  {/* Notifications list */}
                  {(showReadNotifications ? readNotifications : unreadNotifications).length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <CheckCircle size={32} strokeWidth={1} style={{ marginBottom: '0.5rem' }} />
                      <p style={{ margin: 0, fontSize: '0.82rem' }}>
                        {showReadNotifications ? 'No read notifications' : 'All caught up!'}
                      </p>
                    </div>
                  ) : (showReadNotifications ? readNotifications : unreadNotifications).map(notif => {
                    const Icon = notif.icon;
                    return (
                      <div key={notif.id}
                        style={{ display: 'flex', gap: '0.75rem', padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--gray-100)', background: notif.unread ? `${notif.bg}60` : 'white', cursor: 'pointer', position: 'relative' }}
                        onClick={() => { 
                          if (notif.unread) markAsRead(notif.id);
                          navigate(notif.type === 'new_order' ? '/pharmacist/dashboard/orders' : '/pharmacist/dashboard/inventory'); 
                          setShowNotifications(false); 
                        }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: notif.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={18} color={notif.color} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.8rem', color: 'var(--navy)', lineHeight: 1.3 }}>{notif.title}</p>
                            {notif.unread && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', flexShrink: 0, marginTop: 3 }} />}
                          </div>
                          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--gray-500)', lineHeight: 1.4 }}>{notif.message}</p>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '4px' }}>
                            <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--gray-400)' }}>{notif.time}</p>
                            {notif.unread && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(notif.id);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#10b981',
                                  fontSize: '0.65rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  padding: 0,
                                }}
                              >
                                Mark as read
                              </button>
                            )}
                          </div>
                        </div>
                        <button onClick={(e) => deleteNotification(notif.id, e)}
                          style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-300)', padding: 2, lineHeight: 1 }}>
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--dash-border)', textAlign: 'center' }}>
                  <button onClick={() => { navigate('/pharmacist/dashboard/orders'); setShowNotifications(false); }}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                    View All Orders →
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }} onClick={() => navigate('/pharmacist/dashboard/settings')}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: 'white', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy)', lineHeight: 1.2 }}>{fullName}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)', fontWeight: 300 }}>{email}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
