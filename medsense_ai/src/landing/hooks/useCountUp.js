import { useEffect, useRef, useState } from 'react'

/**
 * useCountUp — counts from 0 to target when element is visible.
 * @param {number} target
 * @param {number} duration  ms
 * @param {string} suffix    e.g. '+', 'M+', '%', '★'
 * @param {number} decimals  decimal places (0 or 1)
 */
export function useCountUp(target, duration = 2000, suffix = '', decimals = 0) {
  const [value, setValue] = useState(decimals > 0 ? '0.0' : '0')
  const ref = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          observer.disconnect()

          const startTime = performance.now()

          const tick = (now) => {
            const elapsed = now - startTime
            const progress = Math.min(elapsed / duration, 1)
            // easeOut curve
            const eased = 1 - Math.pow(1 - progress, 3)
            const current = eased * target

            if (decimals > 0) {
              setValue(current.toFixed(decimals) + suffix)
            } else {
              setValue(Math.floor(current) + suffix)
            }

            if (progress < 1) {
              requestAnimationFrame(tick)
            } else {
              setValue(decimals > 0 ? target.toFixed(decimals) + suffix : target + suffix)
            }
          }

          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.3 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [target, duration, suffix, decimals])

  return [value, ref]
}
