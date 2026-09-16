// src/components/dashboard/SalesOptimization/SlowMoversAlert.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Download, Percent, Tag, Check, X, Sparkles } from 'lucide-react';

// ── Toast ─────────────────────────────────────────────────────────────
const Toast = ({ msg }) => (
  <AnimatePresence>
    {msg && (
      <motion.div
        initial={{ opacity: 0, y: -20, x: '-50%' }}
        animate={{ opacity: 1, y: 0, x: '-50%' }}
        exit={{ opacity: 0, y: -20, x: '-50%' }}
        style={{ position: 'absolute', top: 14, left: '50%', background: 'var(--navy)', color: 'white', padding: '0.4rem 1rem', borderRadius: 100, fontSize: '0.78rem', fontWeight: 600, zIndex: 50, boxShadow: 'var(--dash-shadow-hover)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}
      >
        <Check size={13} color="var(--green)" />
        {msg}
      </motion.div>
    )}
  </AnimatePresence>
);

// ── Single slow-mover card ────────────────────────────────────────────
const SlowMoverCard = ({ item, onAction }) => {
  const [isDiscounting, setIsDiscounting] = useState(false);
  const [discountVal,   setDiscountVal]   = useState('15');

  // Color based on how long it's been since last sale
  const daysColor = item.lastSoldDaysAgo > 60 ? 'var(--red)' : 'var(--amber)';

  const handleApplyDiscount = () => {
    if (!discountVal || isNaN(discountVal) || +discountVal <= 0) return;
    onAction(`${discountVal}% discount applied to ${item.name}`);
    setIsDiscounting(false);
  };

  const handleCreatePromo = () => {
    onAction(`Promotion created for ${item.name}`);
  };

  return (
    <div
      role="alert"
      style={{ background: 'white', border: '1px solid var(--dash-border)', borderRadius: 14, padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.75rem' }}
    >
      {/* Top row: name + days badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name}
          </h4>
          <span style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>{item.category}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: daysColor, background: `${daysColor}14`, padding: '2px 8px', borderRadius: 100, fontSize: '0.68rem', fontWeight: 700, flexShrink: 0 }}>
          <AlertTriangle size={11} />
          {item.lastSoldDaysAgo}d ago
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--dash-border)' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.67rem', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Stock</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.92rem', fontWeight: 700, color: 'var(--navy)' }}>{item.stockOnHand} <span style={{ fontSize: '0.72rem', fontWeight: 400 }}>units</span></p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '0.67rem', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Value Tied Up</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.92rem', fontWeight: 700, color: 'var(--navy)' }}>PKR {item.estimatedValue.toLocaleString()}</p>
        </div>
      </div>

      {/* AI suggestion chip */}
      {item.aiSuggestion && (
        <div style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)', borderRadius: 8, padding: '0.5rem 0.625rem', fontSize: '0.75rem', color: 'var(--blue)', lineHeight: 1.45 }}>
          {item.aiSuggestion}
        </div>
      )}

      {/* Action area — inline discount input OR action buttons */}
      <div style={{ minHeight: 36 }}>
        <AnimatePresence mode="wait">
          {isDiscounting ? (
            <motion.div
              key="discount-input"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              style={{ display: 'flex', gap: 6, alignItems: 'center' }}
            >
              {/* Discount % input */}
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={discountVal}
                  onChange={e => setDiscountVal(e.target.value)}
                  autoFocus
                  style={{ width: '100%', padding: '0.4rem 1.75rem 0.4rem 0.5rem', border: '1px solid var(--blue)', borderRadius: 8, fontSize: '0.82rem', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }}
                />
                <Percent size={11} color="var(--gray-400)" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }} />
              </div>
              {/* Confirm */}
              <button onClick={handleApplyDiscount} style={{ width: 32, height: 32, background: 'var(--green)', border: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', flexShrink: 0 }}>
                <Check size={15} />
              </button>
              {/* Cancel */}
              <button onClick={() => setIsDiscounting(false)} style={{ width: 32, height: 32, background: 'var(--gray-200)', border: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-600)', cursor: 'pointer', flexShrink: 0 }}>
                <X size={15} />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="actions"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}
            >
              <button
                onClick={() => setIsDiscounting(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '0.45rem', background: 'white', border: '1px solid var(--dash-border)', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, color: 'var(--navy)', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dash-border)'}
              >
                <Tag size={13} /> Apply Discount
              </button>
              <button
                onClick={handleCreatePromo}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '0.45rem', background: 'var(--dash-bg)', border: '1px solid var(--dash-border)', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, color: 'var(--navy)', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dash-border)'}
              >
                <Sparkles size={13} /> Create Promo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────
export default function SlowMoversAlert({ data }) {
  const [toastMsg, setToastMsg] = useState('');

  const handleAction = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  return (
    <div
      className="dash-card"
      style={{ padding: '1.5rem', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}
    >
      <Toast msg={toastMsg} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={20} color="var(--amber)" />
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--navy)' }}>
              Slow Movers Alert
            </h2>
          </div>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--gray-400)' }}>
            Medicines with zero sales in the last 30+ days
          </p>
        </div>

        <motion.button
          whileHover={{ y: -2, boxShadow: 'var(--dash-shadow-hover)' }}
          whileTap={{ scale: 0.95 }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
        >
          <Download size={13} /> Export List
        </motion.button>
      </div>

      {/* Grid — 3 cols desktop, 2 tablet, 1 mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {data.map(item => (
          <SlowMoverCard key={item.id} item={item} onAction={handleAction} />
        ))}
      </div>
    </div>
  );
}
