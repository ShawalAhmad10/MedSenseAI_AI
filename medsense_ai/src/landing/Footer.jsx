import React from 'react'
import { motion } from 'framer-motion'

// ─── SVG Icons ─────────────────────────────────────────────────
const IconTwitter = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
)
const IconLinkedIn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/>
    <circle cx="4" cy="4" r="2"/>
  </svg>
)
const IconMail = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
)
const IconExternalLink = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
)

const LogoMark = () => (
  <svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="10" fill="#2563eb"/>
    <path d="M18 9v18M9 18h18" stroke="white" strokeWidth="3.4" strokeLinecap="round"/>
    <circle cx="18" cy="18" r="5" fill="white" opacity="0.18"/>
  </svg>
)

const FOOTER_LINKS = {
  Product: ['Features', 'Pricing', 'How It Works', 'API Access', 'Changelog'],
  Company: ['About Us', 'Blog', 'Careers', 'Press Kit', 'Contact'],
  Legal: ['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'HIPAA Compliance', 'Security'],
}

const SOCIALS = [
  { Icon: IconTwitter,  href: '#', label: 'Twitter' },
  { Icon: IconLinkedIn, href: '#', label: 'LinkedIn' },
  { Icon: IconMail,     href: '#', label: 'Email' },
]

function Footer() {
  return (
    <footer style={{
      background: 'var(--navy-soft)',
      padding: '5rem 5vw 0',
      color: 'rgba(255,255,255,0.6)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle top glow */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '60%', height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(37,99,235,0.5), transparent)',
      }} />

      <div className="footer-grid" style={{ paddingBottom: '3.5rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {/* ── Column 1: Brand ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <LogoMark />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.12rem', color: 'white', lineHeight: 1.1 }}>
                MedSenseAI
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.63rem', fontWeight: 600, color: '#2563eb', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                for Pharmacists
              </div>
            </div>
          </div>

          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', lineHeight: 1.75, color: 'rgba(255,255,255,0.42)', maxWidth: '230px', marginBottom: '1.75rem' }}>
            AI-powered intelligence for Pakistan's pharmaceutical ecosystem.
          </p>

          {/* Social icons */}
          <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '2rem' }}>
            {SOCIALS.map(({ Icon, href, label }) => (
              <motion.a
                key={label}
                href={href}
                aria-label={label}
                whileHover={{ y: -3, background: '#2563eb', color: 'white' }}
                style={{
                  width: 36, height: 36, borderRadius: '8px',
                  background: 'rgba(255,255,255,0.07)',
                  color: 'rgba(255,255,255,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textDecoration: 'none',
                  transition: 'background 0.2s, color 0.2s',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <Icon />
              </motion.a>
            ))}
          </div>

          {/* Patient link */}
          <motion.a
            href="https://medsenseai.com"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ color: '#93c5fd' }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              fontFamily: 'var(--font-body)', fontSize: '0.82rem',
              color: '#2563eb', textDecoration: 'none', fontWeight: 500,
              transition: 'color 0.2s',
              border: '1px solid rgba(37,99,235,0.25)',
              borderRadius: '100px',
              padding: '0.3rem 0.85rem',
              background: 'rgba(37,99,235,0.08)',
            }}
          >
            Patient portal
            <IconExternalLink />
          </motion.a>
        </div>

        {/* ── Columns 2–4: Links ── */}
        {Object.entries(FOOTER_LINKS).map(([col, links]) => (
          <div key={col}>
            <h4 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700, fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.12em', textTransform: 'uppercase',
              marginBottom: '1.5rem',
            }}>
              {col}
            </h4>
            <ul style={{ listStyle: 'none' }}>
              {links.map((link) => (
                <li key={link} style={{ marginBottom: '0.7rem' }}>
                  <motion.a
                    href="#"
                    whileHover={{ color: 'rgba(255,255,255,0.85)', x: 4 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.88rem',
                      color: 'rgba(255,255,255,0.48)',
                      textDecoration: 'none',
                      display: 'inline-block',
                      transition: 'color 0.2s',
                    }}
                  >
                    {link}
                  </motion.a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '1rem',
        padding: '1.5rem 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.25)' }}>
            © 2026 MedSenseAI. All rights reserved.
          </span>
          <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: '0.8rem' }}>·</span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.2)' }}>
            Built with ❤ for Pakistan
          </span>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {['Privacy', 'Terms', 'Cookies'].map((item) => (
            <motion.a
              key={item}
              href="#"
              whileHover={{ color: 'rgba(255,255,255,0.75)' }}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.8rem',
                color: 'rgba(255,255,255,0.28)',
                textDecoration: 'none', transition: 'color 0.2s',
              }}
            >
              {item}
            </motion.a>
          ))}
        </div>
      </div>
    </footer>
  )
}

export default Footer
