// src/components/layout/Sidebar.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FileText, TrendingUp, User, Package,
  ShoppingCart, AlertTriangle, Bot, Users, ChevronDown,
  Search, ArrowUpRight, BarChart3, MessageSquare, LogOut,
  Tags, Truck,
} from 'lucide-react';
import UpgradePlanModal from '../modals/UpgradePlanModal';
import { clearPharmacistAuth } from '../../services/pharmacistAuthSession';

const homeNav = [
  { icon: LayoutDashboard, label: 'Overview', path: '/pharmacist/dashboard' },
  { icon: BarChart3, label: 'Analytics', path: '/pharmacist/dashboard/analytics' },
  { icon: TrendingUp, label: 'Sales Optimization', path: '/pharmacist/dashboard/sales' },
  { icon: User, label: 'Account', path: '/pharmacist/dashboard/settings' },
];

const pharmacyNav = [
  { icon: Package,    label: 'Inventory',    path: '/pharmacist/dashboard/inventory' },
  { icon: Package,    label: 'Products',     path: '/pharmacist/dashboard/products' },
  { icon: Tags,       label: 'Brands',       path: '/pharmacist/dashboard/brands' },
  { icon: Truck,      label: 'Suppliers',    path: '/pharmacist/dashboard/suppliers' },
  { icon: User,       label: 'Customers',    path: '/pharmacist/dashboard/customers' },
  // Removed Doctors, Expenses, and Backups from the sidebar per request
  { icon: ShoppingCart,  label: 'Orders',  path: '/pharmacist/dashboard/orders' },
  { icon: Bot,        label: 'AI Assistant', path: '/pharmacist/dashboard/ai-assistant' },
  { icon: MessageSquare, label: 'Consultations', path: '/pharmacist/dashboard/consultations' },
  { icon: Users,      label: 'Leads',        path: '/pharmacist/dashboard/leads' },
];

function NavItem({ item, isActive }) {
  const navigate = useNavigate();
  const activeBg = 'rgba(37, 99, 235, 0.12)';
  const activeColor = 'var(--blue)';

  return (
    <motion.div
      onClick={() => navigate(item.path)}
      whileHover={
        !isActive
          ? { backgroundColor: 'var(--sidebar-hover-bg)' }
          : undefined
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.6rem 1rem',
        borderRadius: 'var(--dash-radius-sm)',
        margin: '0 0.5rem 0.15rem',
        background: isActive ? activeBg : 'transparent',
        boxShadow: isActive ? 'inset 3px 0 0 var(--blue)' : 'none',
        cursor: 'pointer',
        transition: 'background 0.2s, box-shadow 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <item.icon
          size={16}
          color={isActive ? activeColor : 'var(--sidebar-text)'}
          strokeWidth={isActive ? 2 : 1.5}
        />
        <span
          style={{
            fontSize: '0.82rem',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? activeColor : 'var(--sidebar-text)',
          }}
        >
          {item.label}
        </span>
      </div>
      {isActive && <ChevronDown size={14} color={activeColor} />}
    </motion.div>
  );
}

function SectionLabel({ label }) {
  return (
    <p
      style={{
        fontSize: '0.65rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--gray-400)',
        padding: '0.5rem 1.5rem 0.25rem',
        margin: 0,
      }}
    >
      {label}
    </p>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const isActive = (path) => {
    if (path === '/pharmacist/dashboard') return location.pathname === '/pharmacist/dashboard';
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    clearPharmacistAuth();
    navigate('/pharmacist/login', { replace: true });
  };

  return (
    <div
      style={{
        width: 'var(--sidebar-width)',
        minWidth: 'var(--sidebar-width)',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--dash-border)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '1.25rem 1.25rem 0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 2v14M2 9h14"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '1rem',
              color: 'var(--navy)',
            }}
          >
            MedSenseAI
          </span>
        </div>
      </div>

      {/* Greeting */}
      <div
        style={{
          padding: '1rem 1.25rem 0.75rem',
          marginTop: '0.25rem',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '1.4rem',
            lineHeight: 1.2,
            color: 'var(--navy)',
            margin: 0,
          }}
        >
          Welcome
          <br />
          Back!
        </h2>
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--gray-400)',
            fontWeight: 300,
            marginTop: '0.25rem',
            margin: '0.25rem 0 0',
          }}
        >
          Current pharmacy summary
        </p>
      </div>

      {/* HOME Nav */}
      {homeNav.map((item) => (
        <NavItem key={item.path} item={item} isActive={isActive(item.path)} />
      ))}

      {/* PHARMACY Nav */}
      <div style={{ marginTop: '0.5rem' }}>
        <SectionLabel label="PHARMACY" />
        {pharmacyNav.map((item) => (
          <NavItem key={item.path} item={item} isActive={isActive(item.path)} />
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Logout Button */}
      <motion.div
        whileHover={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
        onClick={handleLogout}
        style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.6rem 1rem', borderRadius: 'var(--dash-radius-sm)', margin: '0 0.5rem 0.25rem', cursor: 'pointer', transition: 'background 0.2s' }}>
        <LogOut size={16} color="#ef4444" strokeWidth={1.5} />
        <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#ef4444' }}>Logout</span>
      </motion.div>

      {/* Upgrade Promo Card */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        onClick={() => setShowUpgradeModal(true)}
        style={{ margin: '0.75rem', borderRadius: 16, background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)', padding: '1rem', position: 'relative', overflow: 'hidden', cursor: 'pointer', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 70, height: 70, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <Search size={18} color="white" style={{ marginBottom: '0.5rem' }} />
        <p style={{ color: 'white', fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.3, margin: '0 0 0.3rem' }}>
          <span style={{ fontWeight: 400 }}>Upgrade to</span><br />Pro Plan
        </p>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', fontWeight: 300, margin: '0 0 0.75rem' }}>
          Unlock AI assistant + lead scoring
        </p>
        <motion.div whileHover={{ backgroundColor: 'rgba(255,255,255,0.95)' }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'white', borderRadius: 100, padding: '0.3rem 0.75rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--blue)', cursor: 'pointer' }}>
          14 day free-trial <ArrowUpRight size={12} />
        </motion.div>
      </motion.div>

      <UpgradePlanModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
    </div>
  );
}
