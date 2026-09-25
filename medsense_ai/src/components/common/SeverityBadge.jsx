// src/components/common/SeverityBadge.jsx
import React from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

const config = {
  critical: {
    bg: 'var(--severity-critical-bg)',
    color: 'var(--severity-critical)',
    label: 'Critical',
    Icon: AlertTriangle,
  },
  warning: {
    bg: 'var(--severity-warning-bg)',
    color: 'var(--severity-warning)',
    label: 'Warning',
    Icon: AlertCircle,
  },
  info: {
    bg: 'var(--severity-info-bg)',
    color: 'var(--severity-info)',
    label: 'Info',
    Icon: Info,
  },
};

export default function SeverityBadge({ severity }) {
  const c = config[severity] || config.info;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: c.bg,
        color: c.color,
        borderRadius: 100,
        padding: '3px 8px',
        fontSize: '0.68rem',
        fontWeight: 600,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      <c.Icon size={10} />
      {c.label}
    </div>
  );
}
