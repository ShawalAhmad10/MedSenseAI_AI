import React from 'react'
import { motion } from 'framer-motion'
import { Clock, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

const STATUS_CONFIG = {
  pending: {
    bg: 'var(--rx-pending-bg)',
    color: 'var(--rx-pending)',
    label: 'Pending',
    icon: Clock,
    pulse: true,
  },
  approved: {
    bg: 'var(--rx-approved-bg)',
    color: 'var(--rx-approved)',
    label: 'Approved',
    icon: CheckCircle,
    pulse: false,
  },
  flagged: {
    bg: 'var(--rx-flagged-bg)',
    color: 'var(--rx-flagged)',
    label: 'Flagged',
    icon: AlertTriangle,
    pulse: true,
  },
  rejected: {
    bg: 'var(--rx-rejected-bg)',
    color: 'var(--rx-rejected)',
    label: 'Rejected',
    icon: XCircle,
    pulse: false,
  },
}

export default function StatusBadge({ status, size = 'md' }) {
  const sizes = {
    sm: '2px 7px',
    md: '3px 10px',
    lg: '5px 14px'
  }
  const fontSizes = {
    sm: '0.65rem',
    md: '0.72rem',
    lg: '0.8rem'
  }
  const iconSizes = {
    sm: 10,
    md: 12,
    lg: 14
  }

  const c = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: c.bg, color: c.color,
        borderRadius: 100, padding: sizes[size],
        fontSize: fontSizes[size], fontWeight: 600,
        position: 'relative',
      }}
    >
      {/* Pulse ring for active statuses */}
      {c.pulse && (
        <motion.div
          animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          style={{
            position: 'absolute', inset: 0, borderRadius: 100,
            border: `1.5px solid ${c.color}`, pointerEvents: 'none',
          }}
        />
      )}
      <c.icon size={iconSizes[size]} strokeWidth={2} />
      {c.label}
    </motion.div>
  )
}
