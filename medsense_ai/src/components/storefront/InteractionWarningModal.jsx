// SRS §3.2.3 / EUC-04: Warn users when potential medicine interactions are detected.
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShieldAlert, X } from 'lucide-react';

export default function InteractionWarningModal({ isOpen, onClose, warnings }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            className="sf-overlay"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="sf-modal-shell">
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="sf-card sf-modal-card"
              exit={{ opacity: 0, y: 16 }}
              initial={{ opacity: 0, y: 16 }}
              style={{ width: 'min(100%, 620px)', padding: '1.25rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <strong style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
                    Interaction Review
                  </strong>
                  <span className="sf-muted">Mock safety layer for cart and checkout flow</span>
                </div>
                <button className="sf-icon-button" onClick={onClose} type="button">
                  <X size={18} />
                </button>
              </div>
              <div style={{ display: 'grid', gap: '0.9rem' }}>
                {warnings.map((warning) => (
                  <div className="sf-summary-block" key={warning.title}>
                    <div className={warning.severity === 'high' ? 'sf-badge-danger' : 'sf-badge-warning'}>
                      <ShieldAlert size={14} />
                      {warning.severity === 'high' ? 'High priority' : 'Moderate priority'}
                    </div>
                    <strong style={{ display: 'block', marginTop: '0.7rem' }}>{warning.title}</strong>
                    <p className="sf-muted" style={{ marginBottom: 0 }}>
                      {warning.detail}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
