import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { ZoomIn, ZoomOut, RotateCw, Maximize2 } from 'lucide-react'

export default function ImageViewer({ src, alt, isProcessing }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)
  const containerRef = useRef(null)
  const imageRef = useRef(null)

  const handleWheel = (e) => {
    e.preventDefault()
    setScale(s => Math.min(3, Math.max(0.5, s - e.deltaY * 0.001)))
  }

  const handleMouseDown = (e) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleReset = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  return (
    <div style={{ position: 'relative', background: 'var(--viewer-bg)',
                  borderRadius: 'var(--dash-radius)', overflow: 'hidden',
                  height: '100%', minHeight: 400 }}>

      {/* Toolbar (top overlay) */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10,
                    display: 'flex', gap: '0.4rem' }}>
        {[
          { icon: ZoomIn,   action: () => setScale(s => Math.min(3, s + 0.25)) },
          { icon: ZoomOut,  action: () => setScale(s => Math.max(0.5, s - 0.25)) },
          { icon: RotateCw, action: () => setRotation(r => (r + 90) % 360) },
          { icon: Maximize2,action: () => { setScale(1); setPosition({x:0, y:0}) } },
        ].map((btn, i) => (
          <motion.div key={i}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={btn.action}
            style={{ width: 32, height: 32, borderRadius: 8,
                     background: 'rgba(255,255,255,0.12)',
                     backdropFilter: 'blur(8px)',
                     border: '1px solid rgba(255,255,255,0.15)',
                     display: 'flex', alignItems: 'center', justifyContent: 'center',
                     cursor: 'pointer', color: 'white' }}>
            <btn.icon size={14} />
          </motion.div>
        ))}
      </div>

      {/* Zoom level badge (top right) */}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
                    borderRadius: 100, padding: '4px 10px',
                    fontSize: '0.68rem', fontWeight: 600, color: 'white' }}>
        {Math.round(scale * 100)}%
      </div>

      {/* Image container (pannable) */}
      <div
        ref={containerRef}
        className="viewer-grab"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleReset}
        style={{ width: '100%', height: '100%', display: 'flex',
                 alignItems: 'center', justifyContent: 'center',
                 overflow: 'hidden', userSelect: 'none' }}
      >
        {isProcessing ? (
          /* Processing overlay */
          <div style={{ display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: '1rem' }}>
            {/* Scanning animation */}
            <div style={{ position: 'relative', width: 200, height: 260,
                          borderRadius: 12, overflow: 'hidden',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)' }}>
              <motion.div
                animate={{ y: ['0%', '100%', '0%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'absolute', left: 0, right: 0, height: 3,
                         background: 'linear-gradient(90deg, transparent, #2563eb, transparent)',
                         boxShadow: '0 0 12px rgba(37,99,235,0.8)' }}
              />
              {/* Corner markers */}
              {[{top:8,left:8},{top:8,right:8},{bottom:8,left:8},{bottom:8,right:8}].map((pos,i) => (
                <div key={i} style={{
                  position: 'absolute', width: 16, height: 16, ...pos,
                  borderTop: (i<2) ? '2px solid #2563eb' : 'none',
                  borderBottom: (i>=2) ? '2px solid #2563eb' : 'none',
                  borderLeft: (i%2===0) ? '2px solid #2563eb' : 'none',
                  borderRight: (i%2===1) ? '2px solid #2563eb' : 'none',
                }} />
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'white', fontWeight: 500, fontSize: '0.875rem',
                          animation: 'processingPulse 1.5s infinite' }}>
                Analyzing prescription...
              </p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem',
                          fontWeight: 300, marginTop: 4 }}>
                OCR extraction in progress
              </p>
            </div>
          </div>
        ) : (
          <motion.img
            ref={imageRef}
            src={src}
            alt={alt}
            animate={{
              scale,
              x: position.x,
              y: position.y,
              rotate: rotation,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: 8,
                     objectFit: 'contain', pointerEvents: 'none',
                     boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
            draggable={false}
          />
        )}
      </div>

      {/* Bottom hint */}
      <div style={{ position: 'absolute', bottom: 10, left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
                    borderRadius: 100, padding: '3px 12px',
                    fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)',
                    whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        Scroll to zoom · Drag to pan · Double-click to reset
      </div>
    </div>
  )
}
