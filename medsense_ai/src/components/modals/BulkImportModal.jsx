import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, X } from 'lucide-react';

export default function BulkCSVImportModal({ isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(13, 17, 23, 0.4)',
              backdropFilter: 'blur(4px)',
            }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 520,
              background: 'white',
              borderRadius: 'var(--dash-radius)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--dash-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  margin: 0,
                }}
              >
                Bulk Import Inventory
              </h3>

              <button
                type="button"
                onClick={onClose}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--gray-400)',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '0.9rem',
                  padding: '1rem',
                  borderRadius: 12,
                  border: '1px solid var(--dash-border)',
                  background: 'var(--dash-bg)',
                }}
              >
                <Info
                  size={20}
                  color="var(--blue)"
                  style={{ flexShrink: 0, marginTop: 2 }}
                />

                <div>
                  <p
                    style={{
                      margin: '0 0 0.4rem',
                      fontWeight: 700,
                      color: 'var(--navy)',
                    }}
                  >
                    Bulk import is not enabled in this release.
                  </p>

                  <p
                    style={{
                      margin: 0,
                      lineHeight: 1.6,
                      fontSize: '0.82rem',
                      color: 'var(--gray-600)',
                    }}
                  >
                    Add or update inventory through the standard inventory
                    workflow so records are validated and stored through the
                    existing backend and PostgreSQL database.
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--dash-border)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: 100,
                  border: 'none',
                  background: 'var(--navy)',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
