// SRS EUC-02: authenticated customer prescription upload and governed OCR review.
import React from 'react';
import { Link } from 'react-router-dom';

import PrescriptionDropzone from '../../components/storefront/PrescriptionDropzone';
import { useAuth } from '../../context/AuthContext';

export default function PrescriptionUploadPage() {
  const {
    isAuthenticated,
    openAuthModal,
  } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="storefront-shell">
        <div className="sf-card sf-section-card">
          <h1
            style={{
              fontFamily:
                'var(--font-display)',
            }}
          >
            Sign in before uploading prescriptions
          </h1>

          <p className="sf-muted">
            Prescription OCR results and manual confirmations are stored against your customer account.
          </p>

          <div
            style={{
              display:
                'flex',

              gap:
                '0.75rem',

              flexWrap:
                'wrap',
            }}
          >
            <button
              className="sf-button"
              onClick={
                () =>
                  openAuthModal(
                    'prescription'
                  )
              }
              type="button"
            >
              Sign in to upload
            </button>

            <Link
              className="sf-button-secondary"
              style={{
                textDecoration:
                  'none',
              }}
              to="/"
            >
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
            <h1>
              Prescription Upload & OCR Review
            </h1>

            <p
              className="sf-section-subcopy"
              style={{
                marginBottom: 0,
              }}
            >
              Upload a PNG or JPEG prescription. The real OCR service extracts medicine text, then you review and confirm the result.
            </p>
          </div>

          <Link
            className="sf-link"
            to="/prescription/history"
          >
            Prescription history
          </Link>
        </div>

        <PrescriptionDropzone />
      </div>
    </div>
  );
}
