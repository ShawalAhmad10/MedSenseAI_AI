// SRS §3.2.2 / EUC-02: Prescription history and extracted-data review trail.
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { prescriptionHistory } from '../../services/storefrontData';

export default function PrescriptionHistoryPage() {
  const { isAuthenticated, openAuthModal } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="storefront-shell">
        <div className="sf-card sf-section-card">
          <h1 style={{ fontFamily: 'var(--font-display)' }}>Prescription history is account-only</h1>
          <button className="sf-button" onClick={() => openAuthModal('prescription')} type="button">
            Sign in to view history
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="storefront-shell">
      <div className="sf-card sf-section-card">
        <div className="sf-page-header">
          <div>
            <h1>Prescription History</h1>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Mock audit trail for uploaded prescriptions and OCR verification events.
            </p>
          </div>
          <Link className="sf-link" to="/prescription/upload">Upload another</Link>
        </div>
        {prescriptionHistory.length === 0 ? (
          <div className="sf-empty">No prescriptions uploaded yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            {prescriptionHistory.map((item) => (
              <article className="sf-summary-block" key={item.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ display: 'block' }}>{item.id}</strong>
                    <span className="sf-muted">Uploaded on {item.uploadedAt}</span>
                  </div>
                  <span className={item.status === 'Verified' ? 'sf-badge-success' : 'sf-badge-warning'}>
                    {item.status}
                  </span>
                </div>
                <p className="sf-muted" style={{ marginBottom: 0 }}>{item.notes}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
