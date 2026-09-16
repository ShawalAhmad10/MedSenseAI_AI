import React, { useRef, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { heroHeadline, heroWord, fadeUp, floatAnim } from './animations'
import { useRipple } from './hooks/useRipple'

// ─── SVG Icons ─────────────────────────────────────────────────
const IconArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)
const IconPlay = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="white" stroke="none">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
)
const IconShield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
  </svg>
)
const IconStar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="#2563eb" stroke="none">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IconUsers = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

// ─────────────────────────────────────────────────────────────
// CANVAS WAVE — DNA Double-Helix
// ─────────────────────────────────────────────────────────────
function useCanvasWave(canvasRef) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let rafId, t = 0, shimmerT = 0, shimmerActive = false, lastShimmerTime = 0
    const FREQ = Math.PI * 2 * 1.5

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.offsetWidth, h = canvas.offsetHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.scale(dpr, dpr)
    }
    window.addEventListener('resize', resize)
    resize()

    const buildEdges = (phase, W, H) => {
      const N = 120, centerY = H * 0.5, amp = H * 0.22, baseThick = H * 0.14
      const upper = [], lower = []
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * W, xNorm = i / (N - 1)
        const y = centerY + amp * Math.sin(FREQ * xNorm + t + phase)
        const thick = baseThick * (0.4 + 0.6 * Math.abs(Math.cos(FREQ * xNorm + t + phase + Math.PI / 2)))
        upper.push({ x, y: y - thick / 2 }); lower.push({ x, y: y + thick / 2 })
      }
      return { upper, lower, N }
    }

    const drawRibbon = (upper, lower, col) => {
      ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(147,197,253,0.35)'
      ctx.beginPath(); ctx.moveTo(upper[0].x, upper[0].y)
      for (let i = 1; i < upper.length - 1; i++) {
        const mx = (upper[i].x + upper[i+1].x)/2, my = (upper[i].y + upper[i+1].y)/2
        ctx.quadraticCurveTo(upper[i].x, upper[i].y, mx, my)
      }
      ctx.lineTo(upper[upper.length-1].x, upper[upper.length-1].y)
      for (let i = lower.length-1; i > 0; i--) {
        const mx = (lower[i].x + lower[i-1].x)/2, my = (lower[i].y + lower[i-1].y)/2
        ctx.quadraticCurveTo(lower[i].x, lower[i].y, mx, my)
      }
      ctx.lineTo(lower[0].x, lower[0].y); ctx.closePath()
      ctx.fillStyle = col.fill; ctx.fill(); ctx.shadowBlur = 0
      ctx.beginPath(); ctx.moveTo(upper[0].x, upper[0].y)
      for (let i = 1; i < upper.length-1; i++) {
        const mx = (upper[i].x + upper[i+1].x)/2, my = (upper[i].y + upper[i+1].y)/2
        ctx.quadraticCurveTo(upper[i].x, upper[i].y, mx, my)
      }
      ctx.strokeStyle = col.strokeTop; ctx.lineWidth = col.isFront ? 2.5 : 1.5; ctx.stroke()
    }

    const drawPair = (phaseA, phaseB, W, H) => {
      const N = 120
      const ea = buildEdges(phaseA, W, H), eb = buildEdges(phaseB, W, H)
      const crossovers = [Math.floor(N/3), Math.floor(2*N/3), N-1]
      let start = 0, aFront = ea.upper[0].y < eb.upper[0].y
      crossovers.forEach(end => {
        const sAU = ea.upper.slice(start, end+1), sAL = ea.lower.slice(start, end+1)
        const sBU = eb.upper.slice(start, end+1), sBL = eb.lower.slice(start, end+1)
        const back  = { fill:'rgba(186,215,255,0.55)', strokeTop:'rgba(255,255,255,0.45)', isFront:false }
        const front = { fill:'rgba(147,197,253,0.82)', strokeTop:'rgba(255,255,255,0.92)', isFront:true }
        if (aFront) { drawRibbon(sBU,sBL,back); drawRibbon(sAU,sAL,front) }
        else        { drawRibbon(sAU,sAL,back); drawRibbon(sBU,sBL,front) }
        aFront = !aFront; start = end
      })
    }

    const draw = (timestamp) => {
      const W = canvas.offsetWidth, H = canvas.offsetHeight
      ctx.clearRect(0, 0, W, H)
      drawPair(0, Math.PI, W, H); drawPair(Math.PI/2, 3*Math.PI/2, W, H)

      // Shimmer
      if (!shimmerActive && timestamp - lastShimmerTime > 3000) { shimmerActive = true; shimmerT = 0; lastShimmerTime = timestamp }
      if (shimmerActive) {
        shimmerT += 1000/60
        const progress = Math.min(shimmerT/1200, 1)
        const ease = progress < 0.5 ? 2*progress*progress : 1 - Math.pow(-2*progress+2,2)/2
        const shimmerX = ease * W
        const grad = ctx.createLinearGradient(shimmerX-90, 0, shimmerX+90, 0)
        grad.addColorStop(0,'rgba(255,255,255,0)'); grad.addColorStop(0.5,'rgba(255,255,255,0.6)'); grad.addColorStop(1,'rgba(255,255,255,0)')
        const { upper } = buildEdges(0, W, H)
        ctx.save(); ctx.beginPath(); ctx.moveTo(upper[0].x, upper[0].y - 4)
        for (let i = 1; i < upper.length-1; i++) { ctx.lineTo(upper[i].x, upper[i].y - 4) }
        ctx.lineTo(upper[upper.length-1].x, upper[upper.length-1].y + 40)
        ctx.lineTo(upper[0].x, upper[0].y + 40); ctx.closePath()
        ctx.fillStyle = grad; ctx.fill(); ctx.restore()
        if (shimmerT >= 1200) shimmerActive = false
      }

      // Edge fades
      const lf = ctx.createLinearGradient(0,0,W*0.07,0); lf.addColorStop(0,'rgba(240,246,255,1)'); lf.addColorStop(1,'rgba(240,246,255,0)')
      ctx.fillStyle = lf; ctx.fillRect(0,0,W*0.07,H)
      const rf = ctx.createLinearGradient(W*0.93,0,W,0); rf.addColorStop(0,'rgba(240,246,255,0)'); rf.addColorStop(1,'rgba(240,246,255,1)')
      ctx.fillStyle = rf; ctx.fillRect(W*0.93,0,W*0.07,H)
      const bf = ctx.createLinearGradient(0,H*0.68,0,H); bf.addColorStop(0,'rgba(255,255,255,0)'); bf.addColorStop(1,'rgba(255,255,255,0.9)')
      ctx.fillStyle = bf; ctx.fillRect(0,H*0.68,W,H*0.32)

      t += 0.007; rafId = requestAnimationFrame(draw)
    }
    rafId = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(rafId); window.removeEventListener('resize', resize) }
  }, [canvasRef])
}

// ─────────────────────────────────────────────────────────────
// HERO SECTION
// ─────────────────────────────────────────────────────────────
const HEADLINE = 'AI-Powered Pharmacy Intelligence at Your Fingertips'
const HIGHLIGHT_WORDS = ['AI-Powered', 'Intelligence']
const SUBHEADLINE = 'MedSenseAI detects drug interactions, scores leads, automates inventory, and surfaces insights — so you can focus on patient care.'
const PILLS = ['PharmaCo', 'MediRx', 'HealthHub', 'CarePoint', 'PharmaNet']

function HeroSection() {
  const canvasRef = useRef(null)
  const prefersReduced = useReducedMotion()
  const createRipple = useRipple()
  useCanvasWave(canvasRef)

  const words = HEADLINE.split(' ')

  return (
    <section id="hero" style={{ paddingTop: '68px', overflow: 'hidden' }}>
      {/* ── Canvas wave ── */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%', height: '52vh', display: 'block',
          background: 'linear-gradient(180deg, #eff6ff 0%, #f8fafc 60%, #ffffff 100%)',
        }}
      />

      {/* ── Hero content ── */}
      <div className="hero-content">
        {/* Left column */}
        <div>
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16,1,0.3,1] }}
            style={{ marginBottom: '1.5rem' }}
          >
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
              background: 'white',
              border: '1px solid var(--gray-200)',
              borderRadius: '100px',
              padding: '0.35rem 0.9rem 0.35rem 0.5rem',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'var(--blue)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IconCheck />
              </div>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-700)' }}>
                Trusted by
              </span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.82rem', color: 'var(--navy)' }}>
                500+ Pharmacies
              </span>
              <div style={{ display: 'flex', gap: '1px' }}>
                {[0,1,2,3,4].map(i => <IconStar key={i} />)}
              </div>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={heroHeadline}
            initial="hidden"
            animate="visible"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(2.1rem, 4vw, 3.4rem)',
              lineHeight: 1.12,
              color: 'var(--navy)',
              marginBottom: '1.5rem',
            }}
          >
            {words.map((word, i) => (
              <motion.span
                key={i}
                variants={heroWord}
                style={{
                  display: 'inline-block',
                  marginRight: '0.28em',
                  ...(HIGHLIGHT_WORDS.includes(word) ? {
                    color: 'var(--blue)',
                  } : {}),
                }}
              >
                {word}
              </motion.span>
            ))}
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.52, ease: [0.16,1,0.3,1] }}
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300, fontSize: '1.08rem',
              lineHeight: 1.75, color: 'var(--gray-600)',
              marginBottom: '2.25rem', maxWidth: '520px',
            }}
          >
            {SUBHEADLINE}
          </motion.p>

          {/* Feature bullets */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: [0.16,1,0.3,1] }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2.25rem' }}
          >
            {['Real-time drug interaction detection', 'AI-powered lead scoring & analytics', 'Smart inventory management'].map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--blue-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--gray-600)', fontWeight: 400 }}>
                  {item}
                </span>
              </div>
            ))}
          </motion.div>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.68, ease: [0.16,1,0.3,1] }}
            style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}
          >
            {/* Primary CTA */}
            <motion.button
              data-hoverable
              animate={prefersReduced ? {} : {
                boxShadow: ['0 0 0px rgba(37,99,235,0)', '0 0 28px rgba(37,99,235,0.42)', '0 0 0px rgba(37,99,235,0)'],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              whileHover={{ scale: 1.03, y: -3, boxShadow: '0 14px 36px rgba(37,99,235,0.38)' }}
              whileTap={{ scale: 0.97 }}
              onMouseDown={createRipple}
              style={{
                background: 'var(--blue)',
                color: 'white', border: 'none',
                borderRadius: 'var(--radius-btn)',
                padding: '0.88rem 1.85rem',
                fontFamily: 'var(--font-body)', fontWeight: 700,
                fontSize: '1rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}
            >
              Start Free Trial
              <motion.span
                animate={prefersReduced ? {} : { x: [0, 4, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <IconArrowRight />
              </motion.span>
            </motion.button>

            {/* Ghost CTA */}
            <motion.button
              data-hoverable
              whileHover={{ backgroundColor: 'var(--blue-light)', borderColor: '#93c5fd', y: -2 }}
              whileTap={{ scale: 0.97 }}
              style={{
                background: 'transparent', color: 'var(--navy)',
                border: '1.5px solid var(--gray-200)',
                borderRadius: 'var(--radius-btn)',
                padding: '0.88rem 1.6rem',
                fontFamily: 'var(--font-body)', fontWeight: 600,
                fontSize: '1rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'var(--blue)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                paddingLeft: '2px',
              }}>
                <IconPlay />
              </div>
              Watch Demo
            </motion.button>
          </motion.div>
        </div>

        {/* Right column — floating card */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <motion.div
            animate={prefersReduced ? {} : floatAnim(0, 14)}
            style={{
              willChange: 'transform',
              background: 'white',
              borderRadius: '24px',
              border: '1.5px solid var(--gray-200)',
              boxShadow: '0 28px 70px rgba(37,99,235,0.15)',
              padding: '2.25rem',
              maxWidth: '340px', width: '100%',
              position: 'relative', overflow: 'hidden',
            }}
          >
            {/* Corner gradient blob */}
            <div style={{
              position: 'absolute', top: -40, right: -40,
              width: 130, height: 130, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(37,99,235,0.14) 0%, transparent 70%)',
            }} />

            {/* Status badge */}
            <motion.div
              animate={prefersReduced ? {} : { scale: [1, 1.04, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                background: 'var(--blue-light)', borderRadius: '100px',
                border: '1px solid var(--blue-mid)',
                padding: '0.28rem 0.8rem', marginBottom: '1.5rem',
              }}
            >
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--blue)' }}
              />
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-body)' }}>
                Live Platform
              </span>
            </motion.div>

            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', marginBottom: '0.5rem', color: 'var(--navy)', position: 'relative' }}>
              Start Free Trial
            </h3>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--gray-500)', marginBottom: '1.75rem' }}>
              Full access · No credit card · 14 days
            </p>

            {/* Mini metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1.75rem' }}>
              {[['500+', 'Pharmacies'], ['98%', 'Accuracy'], ['14d', 'Free trial']].map(([val, lbl]) => (
                <div key={lbl} style={{
                  textAlign: 'center',
                  background: 'var(--gray-100)',
                  borderRadius: '12px',
                  padding: '0.6rem 0.25rem',
                  border: '1px solid var(--gray-200)',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--blue)' }}>{val}</div>
                  <div style={{ fontSize: '0.63rem', color: 'var(--gray-500)', fontWeight: 400, marginTop: 2, fontFamily: 'var(--font-body)' }}>{lbl}</div>
                </div>
              ))}
            </div>

            {/* Trust items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.75rem' }}>
              {[['HIPAA-compliant', 'green'], ['Enterprise-grade security', 'blue'], ['24/7 support included', 'purple']].map(([item, clr]) => {
                const colors = { green: ['var(--blue-light)','var(--blue)'], blue: ['var(--blue-light)','var(--blue)'], purple: ['var(--blue-light)','var(--blue)'] }
                const [bg, fg] = colors[clr]
                return (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 400 }}>{item}</span>
                  </div>
                )
              })}
            </div>

            <motion.button
              data-hoverable
              whileHover={{ y: -2, boxShadow: '0 10px 28px rgba(37,99,235,0.38)', background: '#1d4ed8' }}
              whileTap={{ scale: 0.97 }}
              onMouseDown={createRipple}
              style={{
                width: '100%',
                background: 'var(--blue)',
                color: 'white', border: 'none',
                borderRadius: 'var(--radius-btn)',
                padding: '0.88rem',
                fontFamily: 'var(--font-body)', fontWeight: 700,
                fontSize: '0.95rem', cursor: 'pointer',
                transition: 'background 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              }}
            >
              Get Started Free
              <IconArrowRight />
            </motion.button>
          </motion.div>
        </div>
      </div>

      {/* ── Social proof bar ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.92, ease: [0.16,1,0.3,1] }}
        style={{
          padding: '1.5rem 5vw 3.5rem',
          display: 'flex', alignItems: 'center',
          gap: '1rem', flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <IconUsers />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', color: 'var(--gray-400)', fontWeight: 500 }}>
            Trusted by
          </span>
        </div>
        {PILLS.map((name, i) => (
          <motion.span
            key={name}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.95 + i * 0.06, type: 'spring', stiffness: 400, damping: 22 }}
            whileHover={{ backgroundColor: 'var(--blue-light)', color: 'var(--blue)', y: -2, borderColor: '#93c5fd' }}
            style={{
              display: 'inline-block',
              background: 'var(--gray-100)',
              color: 'var(--gray-600)',
              borderRadius: '100px',
              padding: '0.3rem 0.9rem',
              fontSize: '0.8rem', fontWeight: 500,
              border: '1px solid var(--gray-200)',
              cursor: 'default',
              transition: 'background 0.2s, color 0.2s, border-color 0.2s',
              fontFamily: 'var(--font-body)',
            }}
          >
            {name}
          </motion.span>
        ))}
      </motion.div>
    </section>
  )
}

export default HeroSection
