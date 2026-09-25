// src/components/dashboard/SalesOptimization/AIRecommendationsPanel.jsx
// ─────────────────────────────────────────────────────────────────────
// AI-generated recommendation cards panel.
// • Shuffles from a pool of 10+ items, displays 6 at a time
// • Re-generate button triggers 1.5 s shimmer → fade-in new set
// • Period change also triggers re-generation
// • Each card: left-border color by type, icon, tag chip, "Take Action" → toast
// ─────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw } from 'lucide-react';

// ── Type → border color map (uses existing theme variables) ─────────────
// Matches the `color` field on each recommendation item in the pool.

// ── Tag pill ─────────────────────────────────────────────────────────────
const TagPill = ({ label, color }) => (
  <span style={{
    display:      'inline-block',
    fontSize:     '0.62rem',
    fontWeight:   700,
    color,
    background:   `${color}18`,
    padding:      '2px 8px',
    borderRadius: 100,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  }}>
    {label}
  </span>
);

// ── Single recommendation card ─────────────────────────────────────────
const RecommendationCard = ({ item, index, onAction }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.06, duration: 0.35, ease: 'easeOut' }}
    whileHover={{ y: -3, boxShadow: 'var(--dash-shadow-hover)' }}
    style={{
      background:   'white',
      border:       '1px solid var(--dash-border)',
      borderLeft:   `4px solid ${item.color}`,
      borderRadius: 12,
      padding:      '1rem',
      display:      'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      cursor:       'default',
      transition:   'box-shadow 0.2s, transform 0.2s',
    }}
  >
    <div>
      {/* Icon + title + tag */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{
            margin: '0 0 0.3rem',
            fontSize: '0.88rem',
            fontWeight: 700,
            color: 'var(--navy)',
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {item.title}
          </h4>
          <TagPill label={item.tag} color={item.color} />
        </div>
      </div>

      {/* Detail text */}
      <p style={{
        margin: '0 0 0.875rem',
        fontSize: '0.78rem',
        color: 'var(--gray-600)',
        lineHeight: 1.5,
      }}>
        {item.detail}
      </p>
    </div>

    {/* Action button */}
    <motion.button
      whileHover={{ x: 3, color: item.color }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onAction(item)}
      style={{
        alignSelf:  'flex-end',
        background: 'transparent',
        border:     'none',
        color:      'var(--navy)',
        fontSize:   '0.75rem',
        fontWeight: 700,
        cursor:     'pointer',
        display:    'flex',
        alignItems: 'center',
        gap:        4,
        padding:    0,
        fontFamily: 'var(--font-body)',
        transition: 'color 0.15s',
      }}
    >
      Take Action
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </motion.button>
  </motion.div>
);

// ── Skeleton shimmer card ──────────────────────────────────────────────
const ShimmerCard = () => (
  <div style={{ borderRadius: 12, overflow: 'hidden', height: 130, display: 'flex', flexDirection: 'column', gap: 8, padding: '1rem', border: '1px solid var(--dash-border)' }}>
    <div className="dash-shimmer" style={{ height: 14, width: '60%', borderRadius: 6 }} />
    <div className="dash-shimmer" style={{ height: 10, width: '40%', borderRadius: 6 }} />
    <div className="dash-shimmer" style={{ height: 10, width: '90%', borderRadius: 6 }} />
    <div className="dash-shimmer" style={{ height: 10, width: '75%', borderRadius: 6 }} />
  </div>
);

// ── Toast ─────────────────────────────────────────────────────────────
const Toast = ({ msg }) => (
  <AnimatePresence>
    {msg && (
      <motion.div
        initial={{ opacity: 0, y: -20, x: '-50%' }}
        animate={{ opacity: 1, y: 0,   x: '-50%' }}
        exit={{   opacity: 0, y: -20,  x: '-50%' }}
        style={{
          position:     'absolute',
          top:          14,
          left:         '50%',
          background:   'var(--navy)',
          color:        'white',
          padding:      '0.45rem 1rem',
          borderRadius: 100,
          fontSize:     '0.78rem',
          fontWeight:   600,
          zIndex:       50,
          boxShadow:    'var(--dash-shadow-hover)',
          display:      'flex',
          alignItems:   'center',
          gap:          6,
          whiteSpace:   'nowrap',
          fontFamily:   'var(--font-body)',
        }}
      >
        <Sparkles size={13} color="var(--green)" />
        {msg}
      </motion.div>
    )}
  </AnimatePresence>
);

// ── Main Component ─────────────────────────────────────────────────────
export default function AIRecommendationsPanel({ pool, selectedPeriod }) {
  const [recommendations, setRecommendations] = useState([]);
  const [isGenerating,    setIsGenerating]    = useState(false);
  const [toastMsg,        setToastMsg]         = useState('');

  // Shuffle pool and pick 6 — each call gives a different subset
  const generate = useCallback(() => {
    setIsGenerating(true);
    setTimeout(() => {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      setRecommendations(shuffled.slice(0, 6));
      setIsGenerating(false);
    }, 1500); // 1.5 s shimmer as specified
  }, [pool]);

  // Re-generate when period changes or on first mount
  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  const handleAction = (item) => {
    setToastMsg(`Action logged for: ${item.title}`);
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
            <Sparkles size={20} color="var(--blue)" />
            <h2 style={{
              margin: 0,
              fontSize: '1.15rem',
              fontWeight: 800,
              fontFamily: 'var(--font-display)',
              color: 'var(--navy)',
            }}>
              AI Recommendations
            </h2>
          </div>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: 'var(--gray-400)' }}>
            Generated based on sales trends, seasonality &amp; inventory signals
          </p>
        </div>

        {/* Re-generate button */}
        <motion.button
          whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(37,99,235,0.15)' }}
          whileTap={{ scale: 0.95 }}
          onClick={generate}
          disabled={isGenerating}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          6,
            padding:      '0.45rem 1rem',
            borderRadius: 100,
            border:       '1px solid var(--blue)',
            background:   'rgba(37,99,235,0.05)',
            color:        'var(--blue)',
            fontSize:     '0.78rem',
            fontWeight:   600,
            cursor:       isGenerating ? 'not-allowed' : 'pointer',
            opacity:      isGenerating ? 0.7 : 1,
            fontFamily:   'var(--font-body)',
          }}
        >
          <RefreshCw
            size={13}
            style={isGenerating ? { animation: 'clockTick 0.9s linear infinite' } : {}}
          />
          Re-generate
        </motion.button>
      </div>

      {/* Grid of cards / skeletons */}
      <div style={{
        display:               'grid',
        gridTemplateColumns:   'repeat(auto-fill, minmax(290px, 1fr))',
        gap:                   '1rem',
      }}>
        {isGenerating
          ? Array.from({ length: 6 }).map((_, i) => <ShimmerCard key={i} />)
          : recommendations.map((item, i) => (
              <RecommendationCard
                key={item.id}
                item={item}
                index={i}
                onAction={handleAction}
              />
            ))
        }
      </div>
    </div>
  );
}
