/**
 * useRipple — creates an expanding circle ripple on button click.
 * Usage: const createRipple = useRipple()
 *        <button onMouseDown={createRipple}>...</button>
 */
export function useRipple() {
  const createRipple = (e) => {
    const button = e.currentTarget
    const rect = button.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height) * 2
    const x = e.clientX - rect.left - size / 2
    const y = e.clientY - rect.top - size / 2

    const ripple = document.createElement('span')
    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      pointer-events: none;
      animation: ripple-expand 0.6s ease-out forwards;
    `
    button.style.position = 'relative'
    button.style.overflow = 'hidden'
    button.appendChild(ripple)
    setTimeout(() => ripple.remove(), 700)
  }

  return createRipple
}
