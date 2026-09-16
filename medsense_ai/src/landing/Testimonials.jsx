import React, { memo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { fadeUp, cardReveal, slideLeft, slideRight, floatAnim } from './animations'
import { useCountUp } from './hooks/useCountUp'

// ─── SVG Icons ─────────────────────────────────────────────────
const IconQuote = ({ color }) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill={color} opacity="0.18" stroke="none">
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
  </svg>
)
const IconStar = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="#2563eb" stroke="none">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)
const IconBuilding = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
  </svg>
)

const TESTIMONIALS = [
  {
    name: 'Dr. Ayesha Siddiqui',
    role: 'Chief Pharmacist',
    company: 'PharmaCo Karachi',
    avatar: 'AS',
    avatarBg: '#dbeafe',
    avatarColor: '#2563eb',
    accentColor: '#2563eb',
    quote: 'MedSenseAI cut our drug-interaction errors by 87% in the first month. The AI assistant is like having a clinical PhD on staff — but faster and always available.',
    rating: 5,
    variant: 'left',
    metric: '87% fewer errors',
  },
  {
    name: 'Usman Tariq',
    role: 'Operations Director',
    company: 'MediRx Chain',
    avatar: 'UT',
    avatarBg: '#dbeafe',
    avatarColor: '#2563eb',
    accentColor: '#2563eb',
    quote: 'Our inventory wastage dropped 42% after activating smart reorder alerts. The ROI was clear within six weeks — I wish we had found MedSenseAI sooner.',
    rating: 5,
    variant: 'up',
    metric: '42% less waste',
  },
  {
    name: 'Fatima Malik',
    role: 'CEO',
    company: 'HealthHub Pakistan',
    avatar: 'FM',
    avatarBg: '#dbeafe',
    avatarColor: '#2563eb',
    accentColor: '#2563eb',
    quote: 'The lead scoring module alone has increased our sales conversion by 3×. It knows which doctors to target before our reps even pick up the phone.',
    rating: 5,
    variant: 'right',
    metric: '3× conversions',
  },
]

const STATS = [
  { target: 500,  suffix: '+',  label: 'Pharmacies onboarded', decimals: 0, icon: '🏥' },
  { target: 2,    suffix: 'M+', label: 'Interactions checked',  decimals: 0, icon: '🔍' },
  { target: 98,   suffix: '%',  label: 'Accuracy rate',         decimals: 0, icon: '🎯' },
  { target: 4.9,  suffix: '★',  label: 'Average rating',        decimals: 1, icon: '⭐' },
]

function StarRating({ count }) {
  return (
    <div style={{ display: 'flex', gap: '2px', marginBottom: '1.1rem' }}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.5 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.06, type: 'spring', stiffness: 400, damping: 18 }}
        >
          <IconStar />
        </motion.span>
      ))}
    </div>
  )
}

function StatCell({ stat }) {
  const [value, ref] = useCountUp(stat.target, 2000, stat.suffix, stat.decimals)

  return (
    <motion.div
      ref={ref}
      whileHover={{ backgroundColor: 'var(--blue-light)', y: -4, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      style={{
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
        borderRight: '1px solid var(--gray-200)',
        cursor: 'default',
        transition: 'background 0.2s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 'clamp(2rem, 3.5vw, 2.75rem)',
        color: '#2563eb',
        lineHeight: 1,
        marginBottom: '0.5rem',
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.88rem',
        color: 'var(--gray-600)',
        fontWeight: 400,
      }}>
        {stat.label}
      </div>
    </motion.div>
  )
}

const getVariant = (v) => {
  if (v === 'left')  return slideLeft
  if (v === 'right') return slideRight
  return fadeUp
}

const Testimonials = memo(function Testimonials() {
  const prefersReduced = useReducedMotion()

  return (
    <section
      id="testimonials"
      style={{ background: 'var(--white)', padding: '7rem 5vw 0', position: 'relative', overflow: 'hidden' }}
    >
      {/* Radial bg glow */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%',
        transform: 'translateX(-50%)',
        width: '80vw', height: '60vh',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(37,99,235,0.03) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Header ── */}
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
            ✦ Testimonials
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
            Trusted by Pakistan's{' '}
            <span className="gradient-text">Best Pharmacies</span>
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
              fontWeight: 300, maxWidth: '480px',
              margin: '0 auto', lineHeight: 1.75,
            }}
          >
            Real results from pharmacists who've made the switch.
          </motion.p>
        </motion.div>

        {/* ── Cards ── */}
        <div className="testimonials-grid" style={{ marginBottom: '5rem' }}>
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.name}
              data-hoverable
              variants={prefersReduced ? fadeUp : getVariant(t.variant)}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
              animate={prefersReduced ? {} : floatAnim(i * 0.5, 6)}
              whileHover={{
                y: -12,
                boxShadow: '0 28px 60px rgba(37,99,235,0.13)',
                transition: { type: 'spring', stiffness: 380, damping: 22 },
              }}
              style={{
                willChange: 'transform',
                background: 'white',
                borderRadius: 'var(--radius-card)',
                border: '1.5px solid var(--gray-200)',
                padding: '2.25rem',
                boxShadow: 'var(--shadow-card)',
                cursor: 'default',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Accent top border */}
              <motion.div
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.15 + i * 0.1, ease: [0.16,1,0.3,1] }}
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                  background: `linear-gradient(90deg, ${t.accentColor}, ${t.accentColor}50)`,
                  transformOrigin: 'left',
                }}
              />

              {/* Quote icon */}
              <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}>
                <IconQuote color={t.accentColor} />
              </div>

              <StarRating count={t.rating} />

              {/* Metric badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                background: `${t.accentColor}12`,
                border: `1px solid ${t.accentColor}25`,
                color: t.accentColor,
                borderRadius: '100px',
                padding: '0.22rem 0.7rem',
                fontSize: '0.72rem', fontWeight: 700,
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.04em',
                marginBottom: '1rem',
              }}>
                ↑ {t.metric}
              </div>

              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.95rem', lineHeight: 1.8,
                color: 'var(--gray-700)',
                marginBottom: '1.75rem',
                fontStyle: 'italic',
                fontWeight: 300,
              }}>
                "{t.quote}"
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', borderTop: '1px solid var(--gray-100)', paddingTop: '1.25rem' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: t.avatarBg,
                  color: t.avatarColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800, fontSize: '0.8rem',
                  flexShrink: 0,
                  boxShadow: `0 4px 14px ${t.accentColor}25`,
                }}>
                  {t.avatar}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.92rem', color: 'var(--navy)' }}>
                    {t.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-body)', fontSize: '0.77rem', color: 'var(--gray-400)', fontWeight: 400 }}>
                    <IconBuilding />
                    {t.role} · {t.company}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Stats strip ── */}
        <div
          className="stats-strip"
          style={{
            background: 'var(--gray-100)',
            borderTop: '1px solid var(--gray-200)',
            borderBottom: '1px solid var(--gray-200)',
            borderRadius: '0 0 0 0',
          }}
        >
          {STATS.map((stat) => (
            <StatCell key={stat.label} stat={stat} />
          ))}
        </div>
      </div>
    </section>
  )
})

export default Testimonials
