// SRS §3.2.2 / EUC-02: Prescription upload and OCR review entry page.
import React from 'react';
import { Link } from 'react-router-dom';
import PrescriptionDropzone from '../../components/storefront/PrescriptionDropzone';
import { useAuth } from '../../context/AuthContext';
import { ocrRows } from '../../services/storefrontData';

export default function PrescriptionUploadPage() {
  const { isAuthenticated, openAuthModal } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="storefront-shell">
        <div className="sf-card sf-section-card">
          <h1 style={{ fontFamily: 'var(--font-display)' }}>Sign in before uploading prescriptions</h1>
          <p className="sf-muted">
            Public browsing remains open, but prescriptions are tied to account history and verification events.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="sf-button" onClick={() => openAuthModal('prescription')} type="button">
              Sign in to upload
            </button>
            <Link className="sf-button-secondary" style={{ textDecoration: 'none' }} to="/">
              Keep browsing
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="storefront-shell">
      <div className="sf-card sf-section-card">
        <div className="sf-page-header">
          <div>
            <h1>Prescription Upload & OCR Review</h1>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Editable review table with confidence badges and manual correction for low-confidence rows.
            </p>
          </div>
        </div>
        <PrescriptionDropzone rows={ocrRows} />
      </div>
    </div>
  );
}
