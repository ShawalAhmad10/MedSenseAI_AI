import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { fadeUp, orbDrift } from './animations'
import { useRipple } from './hooks/useRipple'

// ─── SVG Icons ─────────────────────────────────────────────────
const IconArrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)
const IconPlay = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
)
const IconShield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)
const IconNoCard = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
)
const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)

function CtaSection() {
  const prefersReduced = useReducedMotion()
  const createRipple = useRipple()

  const TRUST_ITEMS = [
    { Icon: IconNoCard,  label: 'No credit card' },
    { Icon: IconClock,   label: '14-day free trial' },
    { Icon: IconShield,  label: 'HIPAA-compliant' },
  ]

  return (
    <section
      id="cta"
      style={{
        background: 'linear-gradient(160deg, #0d1117 0%, #1a2332 50%, #0f172a 100%)',
        padding: '8rem 5vw',
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'center',
      }}
    >
      {/* ── Animated grid overlay ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(37,99,235,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.06) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      {/* ── Floating orbs ── */}
      {!prefersReduced && (
        <>
          <motion.div
            animate={orbDrift([-25, 25], [-18, 18], 8)}
            style={{
              position: 'absolute', width: 500, height: 500,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 70%)',
              top: -140, left: -100,
              filter: 'blur(60px)', pointerEvents: 'none', willChange: 'transform',
            }}
          />
          <motion.div
            animate={orbDrift([18, -18], [22, -22], 11)}
            style={{
              position: 'absolute', width: 360, height: 360,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)',
              bottom: -90, right: -70,
              filter: 'blur(60px)', pointerEvents: 'none', willChange: 'transform',
            }}
          />
          <motion.div
            animate={orbDrift([-12, 12], [-10, 10], 6)}
            style={{
              position: 'absolute', width: 240, height: 240,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 70%)',
              top: '35%', left: '42%',
              filter: 'blur(50px)', pointerEvents: 'none', willChange: 'transform',
            }}
          />
        </>
      )}

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '720px', margin: '0 auto' }}>
        {/* Tag */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          style={{ marginBottom: '1.25rem' }}
        >
          <span className="section-tag" style={{
            background: 'rgba(37,99,235,0.18)',
            color: '#93c5fd',
            border: '1px solid rgba(37,99,235,0.25)',
          }}>
            ✦ Get Started Today
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          variants={fadeUp}
          custom={1}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 'clamp(2.2rem, 4.5vw, 3.75rem)',
            lineHeight: 1.12,
            marginBottom: '1.5rem',
          }}
        >
          <span style={{ color: 'white' }}>Ready to transform</span>{' '}
          <br />
          <span style={{
            background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #34d399 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            your pharmacy?
          </span>
        </motion.h2>

        {/* Subtext */}
        <motion.p
          variants={fadeUp}
          custom={2}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '1.15rem', fontWeight: 300,
            color: 'rgba(255,255,255,0.55)',
            lineHeight: 1.75, marginBottom: '3rem',
          }}
        >
          Join 500+ pharmacies already using MedSenseAI to detect interactions,
          boost sales, and delight patients — all from one dashboard.
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={fadeUp}
          custom={3}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2.5rem' }}
        >
          {/* Primary */}
          <motion.button
            data-hoverable
            whileHover={{ y: -3, boxShadow: '0 16px 40px rgba(255,255,255,0.2)', scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onMouseDown={createRipple}
            style={{
              background: 'white',
              color: 'var(--blue)',
              border: 'none',
              borderRadius: 'var(--radius-btn)',
              padding: '0.95rem 2.25rem',
              fontFamily: 'var(--font-body)',
              fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              boxShadow: '0 4px 20px rgba(255,255,255,0.12)',
            }}
          >
            Start Free Trial
            <motion.span
              animate={{ x: [0, 4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <IconArrow />
            </motion.span>
          </motion.button>

          {/* Secondary */}
          <motion.button
            data-hoverable
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)', y: -2, borderColor: 'rgba(255,255,255,0.4)' }}
            whileTap={{ scale: 0.97 }}
            style={{
              background: 'transparent',
              color: 'rgba(255,255,255,0.8)',
              border: '1.5px solid rgba(255,255,255,0.2)',
              borderRadius: 'var(--radius-btn)',
              padding: '0.95rem 2rem',
              fontFamily: 'var(--font-body)',
              fontWeight: 600, fontSize: '1rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              transition: 'background 0.2s, border-color 0.2s',
            }}
          >
            <span style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              paddingLeft: '2px',
            }}>
              <IconPlay />
            </span>
            Book a Demo
          </motion.button>
        </motion.div>

        {/* Trust strip */}
        <motion.div
          variants={fadeUp}
          custom={4}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}
        >
          {TRUST_ITEMS.map(({ Icon, label }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              fontFamily: 'var(--font-body)', fontSize: '0.8rem',
              color: 'rgba(255,255,255,0.35)',
            }}>
              <Icon />
              {label}
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

export default CtaSection
