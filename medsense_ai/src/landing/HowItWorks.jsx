import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { fadeUp, stepBounce, floatAnim } from './animations'

// ─── SVG Icons ─────────────────────────────────────────────────
const IconLink = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)
const IconBrain = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
    <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
    <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
    <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
    <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
    <path d="M6 18a4 4 0 0 1-1.967-.516"/>
    <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
  </svg>
)
const IconZap = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
)

const STEPS = [
  {
    number: '01',
    Icon: IconLink,
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    glowColor: 'rgba(37,99,235,0.2)',
    title: 'Connect Your Pharmacy',
    desc: 'Import your existing medicine catalogue and patient records in minutes via our secure onboarding wizard.',
    tags: ['Secure import', 'HIPAA-compliant'],
  },
  {
    number: '02',
    Icon: IconBrain,
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    glowColor: 'rgba(37,99,235,0.2)',
    title: 'AI Analyses Everything',
    desc: 'Our models scan interactions, rank leads, forecast demand, and surface insights — all in real-time.',
    tags: ['Real-time', 'GPT-powered'],
  },
  {
    number: '03',
    Icon: IconZap,
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    glowColor: 'rgba(37,99,235,0.2)',
    title: 'Act on Smart Insights',
    desc: 'Receive prioritised alerts, AI-drafted responses, and automated inventory orders to keep you ahead.',
    tags: ['Auto-reorder', 'Smart alerts'],
  },
]

function HowItWorks() {
  const prefersReduced = useReducedMotion()

  return (
    <section
      id="how-it-works"
      style={{ background: 'var(--white)', padding: '7rem 5vw', position: 'relative', overflow: 'hidden' }}
    >
      {/* Subtle bg grid lines */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(var(--gray-200) 1px, transparent 1px), linear-gradient(90deg, var(--gray-200) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        opacity: 0.3,
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 50%, black 40%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 50%, black 40%, transparent 100%)',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Header ── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          style={{ textAlign: 'center', marginBottom: '5rem' }}
        >
          <motion.span
            className="section-tag"
            initial={{ opacity: 0, scale: 0.85 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            ✦ How It Works
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
            Up and Running in{' '}
            <span className="gradient-text">3 Simple Steps</span>
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
              maxWidth: '480px',
              margin: '0 auto',
              lineHeight: 1.75,
            }}
          >
            No complex setup. No IT team needed. Just connect and go.
          </motion.p>
        </motion.div>

        {/* ── Steps ── */}
        <div className="steps-grid">
          {/* SVG connector line */}
          <motion.div
            style={{
              position: 'absolute',
              top: 42,
              left: 'calc(16.67% + 40px)',
              right: 'calc(16.67% + 40px)',
              height: 2,
              background: 'var(--blue)',
              originX: 0,
              zIndex: 0,
              borderRadius: 2,
            }}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          />

          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              variants={fadeUp}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              style={{
                position: 'relative', zIndex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', textAlign: 'center',
              }}
            >
              {/* Step circle */}
              <motion.div
                variants={stepBounce}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                animate={prefersReduced ? {} : floatAnim(i * 0.7, 5)}
                whileHover={{ scale: 1.12 }}
                style={{
                  willChange: 'transform',
                  width: 64, height: 64,
                  borderRadius: '50%',
                  background: step.iconBg,
                  border: `2px solid ${step.iconColor}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: step.iconColor,
                  marginBottom: '1.75rem',
                  position: 'relative',
                  boxShadow: `0 8px 28px ${step.glowColor}`,
                }}
              >
                <step.Icon />

                {/* Step number badge */}
                <div style={{
                  position: 'absolute', top: -8, right: -8,
                  width: 22, height: 22,
                  borderRadius: '50%',
                  background: step.iconColor,
                  color: 'white',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: '0.65rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 2px 8px ${step.glowColor}`,
                }}>
                  {i + 1}
                </div>

                {/* Pulse ring */}
                <motion.div
                  animate={prefersReduced ? {} : {
                    scale: [1, 1.7, 1],
                    opacity: [0.5, 0, 0.5],
                  }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }}
                  style={{
                    position: 'absolute', inset: -7,
                    borderRadius: '50%',
                    border: `2px solid ${step.iconColor}`,
                    pointerEvents: 'none',
                  }}
                />
              </motion.div>

              {/* Card */}
              <motion.div
                whileHover={{
                  y: -8,
                  boxShadow: `0 24px 48px ${step.glowColor}`,
                  transition: { type: 'spring', stiffness: 400, damping: 22 },
                }}
                style={{
                  background: 'white',
                  borderRadius: 'var(--radius-card)',
                  border: '1.5px solid var(--gray-200)',
                  padding: '1.75rem',
                  boxShadow: 'var(--shadow-card)',
                  width: '100%',
                }}
              >
                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700, fontSize: '1.1rem',
                  color: 'var(--navy)', marginBottom: '0.65rem',
                }}>
                  {step.title}
                </h3>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 300, fontSize: '0.9rem',
                  color: 'var(--gray-600)', lineHeight: 1.7,
                  marginBottom: '1.25rem',
                }}>
                  {step.desc}
                </p>
                {/* Tags */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {step.tags.map((tag) => (
                    <span key={tag} style={{
                      background: `${step.glowColor}`,
                      color: step.iconColor,
                      border: `1px solid ${step.iconColor}25`,
                      borderRadius: '100px',
                      padding: '0.2rem 0.65rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      fontFamily: 'var(--font-body)',
                      letterSpacing: '0.03em',
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
