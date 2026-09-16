import React, { memo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { fadeUp, cardReveal, floatAnim } from './animations'
import { useRipple } from './hooks/useRipple'

// ─── SVG Icons ─────────────────────────────────────────────────
const IconCheck = ({ color = '#2563eb' }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IconX = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconStar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#2563eb" stroke="none">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    tagline: 'Perfect to get started',
    monthly: 'Free',
    annual: 'Free',
    color: '#475569',
    accent: '#f1f5f9',
    featured: false,
    features: [
      { label: '100 medicines catalogue',      included: true },
      { label: 'Basic analytics',              included: true },
      { label: 'Drug interaction checker',     included: true },
      { label: '1 seat',                       included: true },
      { label: 'Lead scoring',                 included: false },
      { label: 'AI assistant',                 included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For growing pharmacies',
    monthly: '₨2,999',
    annual: '₨2,399',
    period: '/mo',
    color: '#2563eb',
    accent: '#dbeafe',
    featured: true,
    badge: 'Most Popular',
    features: [
      { label: 'Unlimited medicines',                   included: true },
      { label: 'Full analytics dashboard',              included: true },
      { label: 'Drug interaction checker',              included: true },
      { label: '5 seats',                               included: true },
      { label: 'Lead scoring & AI insights',            included: true },
      { label: 'AI assistant (GPT-powered)',            included: true },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For pharmacy chains',
    monthly: 'Custom',
    annual: 'Custom',
    color: '#1e293b',
    accent: '#f1f5f9',
    featured: false,
    features: [
      { label: 'Everything in Pro',            included: true },
      { label: 'Custom integrations',          included: true },
      { label: 'Dedicated support',            included: true },
      { label: 'Unlimited seats',              included: true },
      { label: 'Lead scoring & AI insights',   included: true },
      { label: 'AI assistant (GPT-powered)',  included: true },
    ],
  },
]

const TABLE_FEATURES = [
  { feature: 'Medicines catalogue',  basic: '100',      pro: 'Unlimited',     enterprise: 'Unlimited'       },
  { feature: 'Drug interaction AI',  basic: '✓',        pro: '✓',             enterprise: '✓'               },
  { feature: 'Sales analytics',      basic: 'Basic',    pro: 'Full',          enterprise: 'Full + Custom'   },
  { feature: 'Lead scoring',         basic: '—',        pro: '✓',             enterprise: '✓'               },
  { feature: 'AI assistant',         basic: '—',        pro: '✓',             enterprise: '✓'               },
  { feature: 'Team seats',           basic: '1',        pro: '5',             enterprise: 'Unlimited'       },
  { feature: 'Dedicated support',    basic: '—',        pro: '—',             enterprise: '✓'               },
]

const PricingSection = memo(function PricingSection() {
  const [billing, setBilling] = useState('monthly')
  const prefersReduced = useReducedMotion()
  const createRipple = useRipple()

  return (
    <section
      id="pricing"
      style={{ background: 'var(--off-white)', padding: '7rem 5vw', position: 'relative', overflow: 'hidden' }}
    >
      {/* Decorative blobs */}
      <div style={{
        position: 'absolute', top: -120, right: -80, width: 480, height: 480,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'absolute', bottom: -100, left: -60, width: 380, height: 380,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.05) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Header ── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          style={{ textAlign: 'center', marginBottom: '3.5rem' }}
        >
          <motion.span
            className="section-tag"
            initial={{ opacity: 0, scale: 0.85 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            ✦ Pricing
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
            Simple,{' '}
            <span className="gradient-text">Transparent Pricing</span>
          </motion.h2>

          <motion.p
            variants={fadeUp}
            custom={2}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '1.1rem', color: 'var(--gray-600)',
              fontWeight: 300, maxWidth: '460px',
              margin: '0 auto 2.5rem', lineHeight: 1.75,
            }}
          >
            Start free. Upgrade when you're ready. Cancel anytime.
          </motion.p>

          {/* ── Billing toggle ── */}
          <motion.div
            variants={fadeUp}
            custom={3}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            style={{
              display: 'inline-flex',
              background: 'white',
              border: '1.5px solid var(--gray-200)',
              borderRadius: '100px',
              padding: '4px',
              gap: '4px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            {['monthly', 'annual'].map((b) => (
              <button
                key={b}
                onClick={() => setBilling(b)}
                style={{
                  position: 'relative',
                  background: 'none',
                  border: 'none',
                  borderRadius: '100px',
                  padding: '0.42rem 1.15rem',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  color: billing === b ? 'white' : 'var(--gray-600)',
                  zIndex: 1,
                  transition: 'color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                }}
              >
                {billing === b && (
                  <motion.div
                    layoutId="billing-indicator"
                    style={{
                      position: 'absolute', inset: 0,
                      background: 'var(--blue)',
                      borderRadius: '100px',
                      zIndex: -1,
                    }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                {b === 'monthly' ? 'Monthly' : 'Annual'}
                {b === 'annual' && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{
                      background: 'var(--blue)',
                      color: 'white',
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      padding: '1px 7px',
                      borderRadius: '100px',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Save 20%
                  </motion.span>
                )}
              </button>
            ))}
          </motion.div>
        </motion.div>

        {/* ── Plan cards ── */}
        <div className="pricing-grid" style={{ marginBottom: '3.5rem' }}>
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              data-hoverable
              variants={cardReveal}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-60px' }}
              animate={prefersReduced ? {} : floatAnim(i * 0.5, plan.featured ? 10 : 7)}
              whileHover={{
                y: -14,
                boxShadow: plan.featured
                  ? '0 40px 80px rgba(37,99,235,0.28)'
                  : '0 28px 56px rgba(0,0,0,0.1)',
                transition: { type: 'spring', stiffness: 380, damping: 22 },
              }}
              style={{
                willChange: 'transform',
                background: plan.featured
                  ? 'var(--blue)'
                  : 'white',
                borderRadius: 'var(--radius-card)',
                border: plan.featured ? '2px solid rgba(147,197,253,0.3)' : '1.5px solid var(--gray-200)',
                padding: '2.5rem',
                boxShadow: plan.featured ? '0 28px 64px rgba(37,99,235,0.22)' : 'var(--shadow-card)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Featured shimmer overlay */}
              {plan.featured && !prefersReduced && (
                <motion.div
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
                  style={{
                    position: 'absolute', top: 0, left: 0,
                    width: '40%', height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              )}

              <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Badge */}
                {plan.badge && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    style={{
                      position: 'absolute', top: '-0.5rem', right: '-0.5rem',
                      background: 'rgba(255,255,255,0.18)',
                      backdropFilter: 'blur(8px)',
                      color: 'white',
                      fontSize: '0.68rem', fontWeight: 700,
                      padding: '0.22rem 0.75rem',
                      borderRadius: '100px',
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      border: '1px solid rgba(255,255,255,0.25)',
                    }}
                  >
                    ★ {plan.badge}
                  </motion.div>
                )}

                {/* Plan name + tagline */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 700,
                    fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: plan.featured ? 'rgba(255,255,255,0.6)' : 'var(--gray-400)',
                    marginBottom: '0.3rem',
                  }}>
                    {plan.name}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.88rem',
                    color: plan.featured ? 'rgba(255,255,255,0.55)' : 'var(--gray-500)',
                    fontWeight: 400,
                  }}>
                    {plan.tagline}
                  </div>
                </div>

                {/* Animated price */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.3rem', marginBottom: '2rem', minHeight: '3.2rem' }}>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={billing + plan.id}
                      initial={{ y: 14, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -14, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.16,1,0.3,1] }}
                      style={{
                        fontFamily: 'var(--font-display)', fontWeight: 800,
                        fontSize: '2.4rem', lineHeight: 1,
                        color: plan.featured ? 'white' : 'var(--navy)',
                      }}
                    >
                      {billing === 'monthly' ? plan.monthly : plan.annual}
                    </motion.span>
                  </AnimatePresence>
                  {plan.period && (
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                      color: plan.featured ? 'rgba(255,255,255,0.5)' : 'var(--gray-400)',
                      paddingBottom: '5px',
                    }}>
                      {plan.period}
                    </span>
                  )}
                </div>

                {/* Divider */}
                <div style={{
                  height: 1,
                  background: plan.featured ? 'rgba(255,255,255,0.12)' : 'var(--gray-200)',
                  marginBottom: '1.5rem',
                }} />

                {/* Features list */}
                <ul style={{ listStyle: 'none', marginBottom: '2rem' }}>
                  {plan.features.map((feat, fi) => (
                    <li key={fi} style={{
                      display: 'flex', alignItems: 'center', gap: '0.7rem',
                      padding: '0.5rem 0',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.88rem',
                      color: feat.included
                        ? (plan.featured ? 'rgba(255,255,255,0.88)' : 'var(--gray-700)')
                        : (plan.featured ? 'rgba(255,255,255,0.3)' : 'var(--gray-400)'),
                      borderBottom: fi < plan.features.length - 1
                        ? `1px solid ${plan.featured ? 'rgba(255,255,255,0.07)' : 'var(--gray-100)'}`
                        : 'none',
                    }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        background: feat.included
                          ? (plan.featured ? 'rgba(255,255,255,0.18)' : 'var(--blue-light)')
                          : (plan.featured ? 'rgba(255,255,255,0.07)' : 'var(--gray-100)'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {feat.included
                          ? <IconCheck color={plan.featured ? 'white' : '#2563eb'} />
                          : <IconX />}
                      </span>
                      {feat.label}
                    </li>
                  ))}
                </ul>

                {/* CTA button */}
                <motion.button
                  data-hoverable
                  whileHover={{
                    y: -2,
                    boxShadow: plan.featured
                      ? '0 10px 28px rgba(255,255,255,0.25)'
                      : '0 10px 28px rgba(37,99,235,0.22)',
                  }}
                  whileTap={{ scale: 0.97 }}
                  onMouseDown={createRipple}
                  style={{
                    width: '100%', padding: '0.9rem',
                    borderRadius: 'var(--radius-btn)',
                    border: plan.featured ? 'none' : '1.5px solid var(--blue)',
                    background: plan.featured ? 'white' : 'transparent',
                    color: plan.featured ? 'var(--blue)' : 'var(--blue)',
                    fontFamily: 'var(--font-body)', fontWeight: 700,
                    fontSize: '0.95rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  }}
                >
                  {plan.id === 'enterprise' ? 'Contact Sales' : plan.id === 'basic' ? 'Get Started Free' : 'Start Pro Trial'}
                  <span>→</span>
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Comparison table ── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          style={{
            background: 'white',
            borderRadius: 'var(--radius-card)',
            border: '1.5px solid var(--gray-200)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{
            padding: '1.5rem 2rem',
            borderBottom: '1px solid var(--gray-200)',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
          }}>
            <span className="gradient-text" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem' }}>
              Feature Comparison
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--gray-400)', fontWeight: 400, fontFamily: 'var(--font-body)' }}>
              — see everything side by side
            </span>
          </div>
          <table className="comparison-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Feature</th>
                <th>Basic</th>
                <th style={{ color: 'var(--blue)' }}>Pro ★</th>
                <th>Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_FEATURES.map((row) => (
                <motion.tr
                  key={row.feature}
                  whileHover={{ backgroundColor: '#f0f6ff' }}
                  style={{ transition: 'background 0.15s', cursor: 'default' }}
                >
                  <td style={{ fontWeight: 500, color: 'var(--gray-800)', textAlign: 'left' }}>{row.feature}</td>
                  <td style={{ color: row.basic === '—' ? 'var(--gray-300)' : 'var(--gray-700)' }}>{row.basic}</td>
                  <td style={{ color: row.pro === '—' ? 'var(--gray-300)' : 'var(--blue)', fontWeight: row.pro !== '—' ? 600 : 400 }}>{row.pro}</td>
                  <td style={{ color: row.enterprise === '—' ? 'var(--gray-300)' : 'var(--gray-700)' }}>{row.enterprise}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  )
})

export default PricingSection
