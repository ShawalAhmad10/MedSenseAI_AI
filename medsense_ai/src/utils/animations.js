// src/utils/animations.js

export const fadeUp = {
  hidden: { y: 60, opacity: 0 },
  visible: (i = 0) => ({
    y: 0,
    opacity: 1,
    transition: { duration: 0.7, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] },
  }),
}

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: (i = 0) => ({
    opacity: 1,
    transition: { duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] },
  }),
}

export const scaleIn = {
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

export const cardReveal = {
  hidden: { y: 80, opacity: 0, rotateX: 10 },
  visible: (i = 0) => ({
    y: 0,
    opacity: 1,
    rotateX: 0,
    transition: { duration: 0.8, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] },
  }),
}

export const navbarSlide = {
  hidden: { y: -80, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
}

export const floatAnim = (delay = 0, amplitude = 8) => ({
  y: [0, -amplitude, 0],
  transition: {
    duration: 4 + delay * 0.5,
    repeat: Infinity,
    ease: 'easeInOut',
    delay,
  },
})

export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } }
}
