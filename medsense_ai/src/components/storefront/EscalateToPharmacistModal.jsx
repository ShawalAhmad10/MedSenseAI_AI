// SRS EUC-08: Escalate interaction concerns to a pharmacist, including unavailable fallback state.
import React from 'react';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PhoneCall, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function EscalateToPharmacistModal({ isOpen, onClose }) {
  const [requestState, setRequestState] = useState('idle');

  useEffect(() => {
    if (!isOpen) {
      setRequestState('idle');
    }
  }, [isOpen]);

  useEffect(() => {
    if (requestState !== 'pending') return undefined;

    const timer = setTimeout(() => {
      setRequestState('unavailable');
    }, 1800);

    return () => clearTimeout(timer);
  }, [requestState]);

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
              style={{ width: 'min(100%, 520px)', padding: '1.25rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <strong style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
                    Escalate to Pharmacist
                  </strong>
                  <span className="sf-muted">Mock handoff UI for high-risk or unclear medicine combinations</span>
                </div>
                <button className="sf-icon-button" onClick={onClose} type="button">
                  <X size={18} />
                </button>
              </div>
              <div className="sf-summary-block" style={{ marginTop: '1rem' }}>
                <div className={requestState === 'unavailable' ? 'sf-badge-danger' : 'sf-badge-warning'}>
                  <PhoneCall size={14} />
                  {requestState === 'unavailable' ? 'Pharmacist unavailable right now' : 'Callback target: within 15 minutes'}
                </div>
                <p className="sf-muted" style={{ marginBottom: 0, marginTop: '0.75rem' }}>
                  {requestState === 'unavailable'
                    ? 'Your escalation was received, but no pharmacist is currently available. Please check again shortly and treat the automated interaction warning as the safe default in the meantime.'
                    : requestState === 'pending'
                      ? 'Your request has been queued. We are checking for an available pharmacist now.'
                      : 'We can later connect this to the real pharmacist escalation queue. For now it demonstrates the public storefront handoff without touching pharmacist portal code.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <button className="sf-button" onClick={() => setRequestState('pending')} type="button">
                  {requestState === 'idle' ? 'Request Callback' : requestState === 'pending' ? 'Checking Availability...' : 'Request Logged'}
                </button>
                <Link className="sf-button-secondary" onClick={onClose} style={{ textDecoration: 'none' }} to="/consult/pharmacist">
                  View Consult Status
                </Link>
                <button className="sf-button-secondary" onClick={onClose} type="button">
                  Continue Reviewing
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
