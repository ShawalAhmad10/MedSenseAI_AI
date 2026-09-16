import React from 'react'
import { motion } from 'framer-motion'

export default function ConfidenceBar({ value, showLabel = true, compact = false }) {
  let color = 'var(--confidence-low)'
  let label = 'Low'
  if (value >= 85) {
    color = 'var(--confidence-high)'
    label = 'High'
  } else if (value >= 60) {
    color = 'var(--confidence-medium)'
    label = 'Medium'
  }

  if (compact) {
    return (
      <div style={{ height: 3, background: 'var(--gray-200)', borderRadius: 100, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ height: '100%', background: color, borderRadius: 100 }}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {showLabel && (
          <span style={{ fontSize: '0.68rem', color: 'var(--gray-400)', fontWeight: 500 }}>
            OCR Confidence
          </span>
        )}
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>
          {value}%
        </span>
      </div>
      <div style={{ height: 5, background: 'var(--gray-200)', borderRadius: 100, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ height: '100%', background: color, borderRadius: 100 }}
        />
      </div>
    </div>
  )
}
