import React, { memo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { fadeUp, cardReveal, floatAnim } from './animations'

// ─── SVG Icon Components ───────────────────────────────────────
const IconShield = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
)
const IconChart = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6"  y1="20" x2="6"  y2="14"/>
    <line x1="2"  y1="20" x2="22" y2="20"/>
  </svg>
)
const IconTarget = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
)
const IconBox = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
)
const IconBot = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"/>
    <circle cx="12" cy="5" r="2"/>
    <path d="M12 7v4"/>
    <line x1="8" y1="16" x2="8" y2="16"/>
    <line x1="16" y1="16" x2="16" y2="16"/>
    <circle cx="8"  cy="16" r="1" fill="currentColor" stroke="none"/>
    <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/>
  </svg>
)
const IconClipboard = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    <line x1="9"  y1="12" x2="15" y2="12"/>
    <line x1="9"  y1="16" x2="12" y2="16"/>
  </svg>
)

const FEATURES = [
  {
    Icon: IconShield,
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    glowColor: 'rgba(37,99,235,0.15)',
    borderHover: '#2563eb',
    name: 'Drug Interaction Detection',
    desc: 'Real-time AI analysis flags dangerous combinations before they reach the patient, reducing risk by up to 94%.',
    stat: '94% safer',
  },
  {
    Icon: IconChart,
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    glowColor: 'rgba(37,99,235,0.15)',
    borderHover: '#2563eb',
    name: 'Sales Analytics Dashboard',
    desc: 'Beautiful, actionable dashboards track revenue trends, top SKUs, and seasonal demand forecasts.',
    stat: '3× revenue insight',
  },
  {
    Icon: IconTarget,
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    glowColor: 'rgba(37,99,235,0.15)',
    borderHover: '#2563eb',
    name: 'Lead Scoring',
    desc: 'ML models rank prospects by conversion likelihood so your reps focus on the right customers.',
    stat: '3× conversions',
  },
  {
    Icon: IconBox,
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    glowColor: 'rgba(37,99,235,0.15)',
    borderHover: '#2563eb',
    name: 'Inventory Management',
    desc: 'Smart reorder alerts, expiry tracking, and supplier benchmarking eliminate stockouts permanently.',
    stat: '42% less waste',
  },
  {
    Icon: IconBot,
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    glowColor: 'rgba(37,99,235,0.15)',
    borderHover: '#2563eb',
    name: 'AI Assistant',
    desc: 'Ask anything — drug info, dosage, alternatives. GPT-powered copilot trained on clinical databases.',
    stat: '< 2s answers',
  },
  {
    Icon: IconClipboard,
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    glowColor: 'rgba(37,99,235,0.15)',
    borderHover: '#2563eb',
    name: 'Prescription Review',
    desc: 'OCR + AI reads handwritten prescriptions, catches errors, and logs them directly to patient records.',
    stat: '99% accuracy',
  },
]

const FeaturesSection = memo(function FeaturesSection() {
  const prefersReduced = useReducedMotion()

  return (
    <section
      id="features"
      style={{
        background: 'var(--off-white)',
        padding: '7rem 5vw',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated dot grid */}
      <div
        className="dot-grid-bg"
        style={{ position: 'absolute', inset: 0, opacity: 0.35, pointerEvents: 'none', zIndex: 0 }}
      />

      {/* Subtle radial glow center */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '70vw', height: '70vw',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Section Header ── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          style={{ textAlign: 'center', marginBottom: '4rem' }}
        >
          <motion.span
            className="section-tag"
            initial={{ opacity: 0, scale: 0.85 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            ✦ Platform Features
          </motion.span>

          <motion.h2
            variants={fadeUp}
            custom={1}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(2rem, 3.5vw, 3rem)',
              color: 'var(--navy)',
              marginBottom: '1rem',
              lineHeight: 1.15,
            }}
          >
            Everything Your Pharmacy{' '}
            <span className="gradient-text">Needs to Thrive</span>
          </motion.h2>

          <motion.p
            variants={fadeUp}
            custom={2}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '1.1rem',
              color: 'var(--gray-600)',
              fontWeight: 300,
              maxWidth: '560px',
              margin: '0 auto',
              lineHeight: 1.75,
            }}
          >
            Six powerful AI modules working in harmony — built specifically for
            Pakistan's pharmaceutical ecosystem.
          </motion.p>
        </motion.div>

        {/* ── Cards Grid ── */}
        <div className="features-grid">
          {FEATURES.map((feat, i) => (
            <FeatureCard key={feat.name} feat={feat} i={i} prefersReduced={prefersReduced} />
          ))}
        </div>
      </div>
    </section>
  )
})

function FeatureCard({ feat, i, prefersReduced }) {
  const { Icon, iconColor, iconBg, glowColor, borderHover, name, desc, stat } = feat

  return (
    <motion.div
      data-hoverable
      variants={cardReveal}
      custom={i}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px' }}
      animate={prefersReduced ? {} : floatAnim(i * 0.35, 6)}
      whileHover={{
        y: -16,
        scale: 1.015,
        boxShadow: `0 32px 64px ${glowColor}, 0 0 0 1.5px ${borderHover}`,
        transition: { type: 'spring', stiffness: 380, damping: 22 },
      }}
      style={{
        willChange: 'transform',
        background: 'white',
        borderRadius: 'var(--radius-card)',
        border: '1.5px solid var(--gray-200)',
        padding: '2rem',
        boxShadow: 'var(--shadow-card)',
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.3s',
      }}
      className="card-beam"
    >
      {/* Top-right accent line */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        whileInView={{ scaleX: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 + i * 0.08, ease: [0.16,1,0.3,1] }}
        style={{
          position: 'absolute',
          top: 0, right: 0,
          width: '60%', height: '2px',
          background: `linear-gradient(90deg, transparent, ${iconColor}40)`,
          transformOrigin: 'right',
        }}
      />

      {/* Icon badge */}
      <motion.div
        whileHover={{ rotate: [0, -8, 8, 0], scale: 1.12 }}
        transition={{ duration: 0.4 }}
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '14px',
          background: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: iconColor,
          marginBottom: '1.4rem',
          boxShadow: `0 4px 16px ${glowColor}`,
          position: 'relative',
        }}
      >
        <Icon />
        {/* Animated ring */}
        <motion.div
          animate={prefersReduced ? {} : {
            scale: [1, 1.45, 1],
            opacity: [0.4, 0, 0.4],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
          style={{
            position: 'absolute',
            inset: -5,
            borderRadius: '18px',
            border: `1.5px solid ${iconColor}`,
            pointerEvents: 'none',
          }}
        />
      </motion.div>

      {/* Stat badge */}
      <div style={{
        position: 'absolute',
        top: '1.4rem',
        right: '1.4rem',
        background: `${glowColor}`,
        border: `1px solid ${iconColor}20`,
        color: iconColor,
        fontSize: '0.68rem',
        fontWeight: 700,
        fontFamily: 'var(--font-display)',
        padding: '0.2rem 0.6rem',
        borderRadius: '100px',
        letterSpacing: '0.04em',
      }}>
        {stat}
      </div>

      <h3 style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: '1.05rem',
        color: 'var(--navy)',
        marginBottom: '0.65rem',
        lineHeight: 1.3,
      }}>
        {name}
      </h3>

      <p style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 300,
        fontSize: '0.9rem',
        color: 'var(--gray-600)',
        lineHeight: 1.7,
        marginBottom: '1.5rem',
      }}>
        {desc}
      </p>

      {/* Learn more link */}
      <motion.div
        initial={{ opacity: 0, x: -6 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3 + i * 0.08 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          color: iconColor,
          fontSize: '0.82rem',
          fontWeight: 600,
          fontFamily: 'var(--font-body)',
        }}
      >
        <span>Learn more</span>
        <motion.span
          animate={prefersReduced ? {} : { x: [0, 4, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
        >
          →
        </motion.span>
      </motion.div>
    </motion.div>
  )
}

export default FeaturesSection
