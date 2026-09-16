import { useEffect } from 'react'

/**
 * useCursorTrail — creates a glowing orb that lerp-follows the mouse.
 * Scales up on [data-hoverable] elements.
 */
export function useCursorTrail() {
  useEffect(() => {
    // Only run on devices with fine pointer (mouse)
    if (!window.matchMedia('(pointer: fine)').matches) return

    const cursor = document.createElement('div')
    cursor.id = 'medsense-cursor-trail'
    Object.assign(cursor.style, {
      position: 'fixed',
      width: '16px',
      height: '16px',
      borderRadius: '50%',
      background: 'rgba(37, 99, 235, 0.18)',
      boxShadow: '0 0 20px rgba(37, 99, 235, 0.25)',
      pointerEvents: 'none',
      zIndex: '99999',
      transform: 'translate(-50%, -50%) scale(1)',
      transition: 'background 0.2s, box-shadow 0.2s',
      top: '0px',
      left: '0px',
    })
    document.body.appendChild(cursor)

    let mouseX = 0
    let mouseY = 0
    let curX = 0
    let curY = 0
    let rafId = null
    let isHovering = false

    const onMouseMove = (e) => {
      mouseX = e.clientX
      mouseY = e.clientY

      const target = e.target
      const hoverable = target.closest('[data-hoverable]')
      if (hoverable && !isHovering) {
        isHovering = true
        cursor.style.transform = 'translate(-50%, -50%) scale(2.5)'
        cursor.style.background = 'rgba(37, 99, 235, 0.12)'
        cursor.style.mixBlendMode = 'multiply'
      } else if (!hoverable && isHovering) {
        isHovering = false
        cursor.style.transform = 'translate(-50%, -50%) scale(1)'
        cursor.style.background = 'rgba(37, 99, 235, 0.18)'
        cursor.style.mixBlendMode = 'normal'
      }
    }

    const tick = () => {
      curX += (mouseX - curX) * 0.12
      curY += (mouseY - curY) * 0.12
      cursor.style.left = `${curX}px`
      cursor.style.top = `${curY}px`
      rafId = requestAnimationFrame(tick)
    }

    document.addEventListener('mousemove', onMouseMove)
    rafId = requestAnimationFrame(tick)

    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      cancelAnimationFrame(rafId)
      cursor.remove()
    }
  }, [])
}
