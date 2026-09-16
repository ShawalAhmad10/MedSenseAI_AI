// src/components/common/ToastContainer.jsx
// Listens for 'medsense:toast' events and shows visible toasts
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

const ICONS = {
  success: { icon: CheckCircle, color: '#16a34a', bg: '#dcfce7', border: '#86efac' },
  error:   { icon: XCircle,    color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
  warning: { icon: AlertCircle,color: '#d97706', bg: '#fef3c7', border: '#fcd34d' },
  info:    { icon: Info,       color: '#2563eb', bg: '#dbeafe', border: '#93c5fd' },
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      const { type = 'info', message = '' } = e.detail ?? {};
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
    };
    window.addEventListener('medsense:toast', handler);
    return () => window.removeEventListener('medsense:toast', handler);
  }, []);

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
      display: 'flex', flexDirection: 'column', gap: '0.5rem',
      pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {toasts.map(t => {
          const cfg = ICONS[t.type] ?? ICONS.info;
          const Icon = cfg.icon;
          return (
            <motion.div
              key={t.id}
              initial={{ x: 80, opacity: 0 }}
              animate={{ x: 0,  opacity: 1 }}
              exit={{   x: 80, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                padding: '0.75rem 1rem',
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                borderRadius: 12,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                maxWidth: 360,
                pointerEvents: 'all',
              }}
            >
              <Icon size={18} color={cfg.color} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1e293b', flex: 1 }}>
                {t.message}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
