import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertTriangle, FileText, User, Calendar } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

/**
 * Implements Alert Resolution Flow per MedSenseAI SRS Section 3.2.08.
 * Allows pharmacists to resolve interaction alerts with mandatory notes.
 */
export default function AlertResolutionModal({ isOpen, onClose, alert, onResolve }) {
  const { showToast } = useToast();
  const [resolutionType, setResolutionType] = useState('Dose Adjusted');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNote('');
      setResolutionType('Dose Adjusted');
    }
  }, [isOpen]);

  const resolutionOptions = [
    'Dose Adjusted', 
    'Alternative Prescribed', 
    'Patient Counselled', 
    'Monitoring Increased', 
    'Prescriber Consulted', 
    'Other'
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (note.length < 10) return;

    setIsSubmitting(true);
    // Simulate async resolve
    setTimeout(() => {
      onResolve(alert.id, {
        resolutionType,
        note,
        resolvedBy: 'Pharmacist Sarah', // Mocked user
        timestamp: new Date().toISOString()
      });
      showToast({ type: 'success', message: 'Alert marked as resolved' });
      setIsSubmitting(false);
      onClose();
    }, 800);
  };

  const isInvalid = note.length < 10;

  if (!alert) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'absolute', inset: 0, background: 'rgba(13, 17, 23, 0.4)', backdropFilter: 'blur(4px)' }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            style={{
              position: 'relative', width: '100%', maxWidth: 500,
              background: 'var(--dash-card)', borderRadius: 'var(--dash-radius)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.15)', overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle size={20} color="var(--green)" />
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--navy)', margin: 0 }}>
                  Resolve Alert
                </h3>
              </div>
              <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              {/* Alert Recap Card */}
              <div style={{ background: 'var(--dash-bg)', padding: '1rem', borderRadius: 12, marginBottom: '1.5rem', border: '1px solid var(--dash-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy)' }}>
                    {alert.medicines.join(' + ')}
                  </p>
                  <span style={{ 
                    padding: '2px 8px', borderRadius: 100, fontSize: '0.65rem', fontWeight: 700, 
                    background: `var(--severity-${alert.severity}-bg)`, color: `var(--severity-${alert.severity})`,
                    textTransform: 'uppercase'
                  }}>
                    {alert.severity}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--gray-600)', lineHeight: 1.4 }}>
                  {alert.description}
                </p>
              </div>

              <form onSubmit={handleSubmit}>
                {/* Resolution Type */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                    Resolution Type *
                  </label>
                  <select
                    value={resolutionType}
                    onChange={(e) => setResolutionType(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: 10, border: '1.5px solid var(--dash-border)', outline: 'none', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}
                  >
                    {resolutionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>

                {/* Resolution Note */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)' }}>
                      Resolution Note *
                    </label>
                    <span style={{ fontSize: '0.7rem', color: note.length < 10 ? 'var(--red)' : 'var(--gray-400)' }}>
                      {note.length}/500
                    </span>
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 500))}
                    placeholder="Describe the action taken (min 10 characters)..."
                    style={{ 
                      width: '100%', padding: '0.75rem 1rem', borderRadius: 10, 
                      border: `1.5px solid ${note.length > 0 && note.length < 10 ? 'var(--red)' : 'var(--dash-border)'}`, 
                      outline: 'none', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                      minHeight: 100, resize: 'none'
                    }}
                  />
                  {note.length > 0 && note.length < 10 && (
                    <p style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 4 }}>Note must be at least 10 characters.</p>
                  )}
                </div>

                {/* Read-only Meta */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem', background: 'var(--dash-bg)', borderRadius: 10 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                     <User size={14} color="var(--gray-400)" />
                     <div style={{ overflow: 'hidden' }}>
                       <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase' }}>Resolved By</p>
                       <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--navy)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Pharmacist Sarah</p>
                     </div>
                   </div>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                     <Calendar size={14} color="var(--gray-400)" />
                     <div>
                       <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase' }}>Timestamp</p>
                       <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--navy)', fontWeight: 600 }}>{new Date().toLocaleDateString()}</p>
                     </div>
                   </div>
                </div>
              </form>
            </div>

            {/* Footer */}
            <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--dash-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <motion.button
                whileHover={{ background: 'var(--dash-bg)' }} whileTap={{ scale: 0.97 }}
                onClick={onClose}
                style={{ padding: '0.6rem 1.25rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--gray-600)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={!isInvalid ? { scale: 1.02, boxShadow: '0 4px 12px rgba(16,185,129,0.2)' } : {}} 
                whileTap={!isInvalid ? { scale: 0.98 } : {}}
                onClick={handleSubmit}
                disabled={isInvalid || isSubmitting}
                style={{
                  padding: '0.6rem 1.5rem', borderRadius: 100, border: 'none', background: 'var(--green)', color: 'white',
                  fontSize: '0.85rem', fontWeight: 600, cursor: isInvalid ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  opacity: isInvalid || isSubmitting ? 0.6 : 1
                }}
              >
                {isSubmitting ? 'Resolving...' : 'Mark as Resolved'}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
