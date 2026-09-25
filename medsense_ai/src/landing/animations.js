// ══════════════════════════════════════════════
// MEDSENSEAI — FRAMER MOTION ANIMATION VARIANTS
// ══════════════════════════════════════════════

// Page load — hero elements (word-by-word reveal)
export const heroHeadline = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

export const heroWord = {
  hidden: { y: 48, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
}

// Scroll reveal — standard fade up
export const fadeUp = {
  hidden: { y: 60, opacity: 0 },
  visible: (i = 0) => ({
    y: 0,
    opacity: 1,
    transition: { duration: 0.7, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] },
  }),
}

// Scroll reveal — cards with 3D tilt entry
export const cardReveal = {
  hidden: { y: 80, opacity: 0, rotateX: 10 },
  visible: (i = 0) => ({
    y: 0,
    opacity: 1,
    rotateX: 0,
    transition: { duration: 0.8, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] },
  }),
}

// Step number circles — spring bounce
export const stepBounce = {
  hidden: { scale: 0, opacity: 0 },
  visible: (i = 0) => ({
    scale: 1,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 15,
      delay: i * 0.15,
    },
  }),
}

// Perpetual float — returns animate prop object
export const floatAnim = (delay = 0, amplitude = 8) => ({
  y: [0, -amplitude, 0],
  transition: {
    duration: 4 + delay * 0.5,
    repeat: Infinity,
    ease: 'easeInOut',
    delay,
  },
})

// Alternating slide — testimonials
export const slideLeft = {
  hidden: { x: -80, opacity: 0 },
  visible: (i = 0) => ({
    x: 0,
    opacity: 1,
    transition: { duration: 0.8, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] },
  }),
}

export const slideRight = {
  hidden: { x: 80, opacity: 0 },
  visible: (i = 0) => ({
    x: 0,
    opacity: 1,
    transition: { duration: 0.8, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] },
  }),
}

// Navbar entry
export const navbarSlide = {
  hidden: { y: -80, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
}

// Orb drift (CTA background)
export const orbDrift = (xRange, yRange, dur) => ({
  x: xRange,
  y: yRange,
  transition: {
    duration: dur,
    repeat: Infinity,
    repeatType: 'mirror',
    ease: 'easeInOut',
  },
})
