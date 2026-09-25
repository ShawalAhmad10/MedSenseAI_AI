import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { navbarSlide } from './animations'
import { useRipple } from './hooks/useRipple'

const NAV_LINKS = [
  { label: 'Features',     href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing',      href: '#pricing' },
  { label: 'Testimonials', href: '#testimonials' },
]

const LogoMark = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="10" fill="#0d1117"/>
    <path d="M18 9v18M9 18h18" stroke="#2563eb" strokeWidth="3.4" strokeLinecap="round"/>
    <circle cx="18" cy="18" r="5" fill="#2563eb" opacity="0.18"/>
    <circle cx="18" cy="18" r="2.5" fill="#2563eb" opacity="0.5"/>
  </svg>
)

function Navbar() {
  const [scrolled,  setScrolled]  = useState(false)
  const [hoveredLink, setHoveredLink] = useState(null)
  const createRipple = useRipple()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.nav
      variants={navbarSlide}
      initial="hidden"
      animate="visible"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 5vw', height: '68px',
        background: scrolled ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: scrolled ? '1px solid rgba(226,232,240,0.7)' : '1px solid transparent',
        boxShadow: scrolled ? '0 4px 32px rgba(0,0,0,0.07)' : 'none',
        transition: 'background 0.4s, border-color 0.4s, box-shadow 0.4s',
      }}
    >
      {/* ── Logo ── */}
      <motion.div
        whileHover={{ scale: 1.03 }}
        style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', cursor: 'pointer' }}
      >
        <LogoMark />
        <div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: '1.18rem', color: 'var(--navy)', lineHeight: 1.1,
          }}>
            MedSenseAI
          </div>
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: '0.63rem', fontWeight: 600,
            color: 'var(--blue)', letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            for Pharmacists
          </div>
        </div>
      </motion.div>

      {/* ── Nav links with floating underline ── */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', position: 'relative' }}>
        {NAV_LINKS.map((link) => (
          <div key={link.label} style={{ position: 'relative' }}>
            <motion.a
              href={link.href}
              className="nav-link"
              onHoverStart={() => setHoveredLink(link.label)}
              onHoverEnd={() => setHoveredLink(null)}
              whileHover={{ color: 'var(--blue)' }}
              style={{
                display: 'block',
                padding: '0.35rem 0.85rem',
                borderRadius: '8px',
                transition: 'color 0.2s',
              }}
            >
              {hoveredLink === link.label && (
                <motion.div
                  layoutId="nav-pill"
                  style={{
                    position: 'absolute', inset: 0,
                    background: 'var(--blue-light)',
                    borderRadius: '8px',
                    zIndex: -1,
                  }}
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              {link.label}
            </motion.a>
          </div>
        ))}
      </nav>

      {/* ── Right CTAs ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <Link
          to="/pharmacist/login"
          style={{
            fontFamily: 'var(--font-body)', fontWeight: 500,
            fontSize: '0.9rem', color: 'var(--gray-600)',
            textDecoration: 'none', transition: 'color 0.2s',
          }}
        >
          <motion.span whileHover={{ color: 'var(--blue)' }}>
            Sign In
          </motion.span>
        </Link>

        <Link to="/pharmacist/login" style={{ textDecoration: 'none' }}>
          <motion.button
            data-hoverable
            whileHover={{
              y: -2,
              boxShadow: '0 8px 28px rgba(37,99,235,0.32)',
              background: '#1d4ed8',
            }}
            whileTap={{ scale: 0.96 }}
            onMouseDown={createRipple}
            style={{
              background: 'var(--blue)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-btn)',
              padding: '0.55rem 1.3rem',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              letterSpacing: '0.01em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'background 0.2s',
            }}
          >
            Start Free Trial
            <motion.span
              animate={{ x: [0, 3, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ display: 'inline-block' }}
            >
              →
            </motion.span>
          </motion.button>
        </Link>
      </div>
    </motion.nav>
  )
}

export default Navbar
