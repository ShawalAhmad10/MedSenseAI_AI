// SRS EUC-04: Inline interaction status feedback for warnings and safe-check confirmations.
import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

const config = {
  low: { className: 'sf-badge-success', icon: CheckCircle2, label: 'Low interaction risk' },
  moderate: { className: 'sf-badge-warning', icon: AlertTriangle, label: 'Review recommended' },
  high: { className: 'sf-badge-danger', icon: ShieldAlert, label: 'Pharmacist review needed' },
};

export default function InteractionBadge({ level = 'low', text }) {
  // DDI callers use factual workflow states rather than clinical severity labels.
  const visualLevel =
    level === 'clear'
      ? 'low'
      : level === 'checking' || level === 'review'
        ? 'moderate'
        : level;
  const entry = config[visualLevel] || config.low;
  const Icon = entry.icon;

  return (
    <span className={entry.className}>
      <Icon size={14} />
      {text || entry.label}
    </span>
  );
}
