// SRS EUC-08: Storefront pharmacist consult status page, including unavailable fallback guidance.
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { pharmacistConsultStatus } from '../../services/storefrontData';

export default function PharmacistConsultPage() {
  const { isAuthenticated, openAuthModal } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="storefront-shell">
        <div className="sf-card sf-section-card">
          <h1 style={{ fontFamily: 'var(--font-display)' }}>Pharmacist Consult</h1>
          <p className="sf-muted">
            Consult history and pharmacist replies are tied to the storefront account experience.
          </p>
          <button className="sf-button" onClick={() => openAuthModal('account')} type="button">
            Sign in to view consult
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
            <h1>Pharmacist Consult</h1>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Status page for escalated medicine-safety questions from the storefront flow.
            </p>
          </div>
          <span className={pharmacistConsultStatus.fallback ? 'sf-badge-warning' : 'sf-badge-success'}>
            {pharmacistConsultStatus.status}
          </span>
        </div>

        <div className="sf-grid-2">
          <section className="sf-summary-block">
            <strong style={{ display: 'block', marginBottom: '0.65rem' }}>{pharmacistConsultStatus.id}</strong>
            <p className="sf-muted" style={{ marginTop: 0 }}>
              {pharmacistConsultStatus.summary}
            </p>
            <div className={pharmacistConsultStatus.fallback ? 'sf-badge-warning' : 'sf-badge-success'}>
              {pharmacistConsultStatus.guidance}
            </div>
            <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <Link className="sf-button-secondary" style={{ textDecoration: 'none' }} to="/cart">
                Back to Cart Review
              </Link>
              <Link className="sf-button" style={{ textDecoration: 'none' }} to="/orders">
                Check Order Status
              </Link>
            </div>
          </section>

          <section className="sf-summary-block">
            <strong style={{ display: 'block', marginBottom: '0.75rem' }}>Consult Timeline</strong>
            <div className="sf-timeline">
              {pharmacistConsultStatus.timeline.map((entry) => (
                <div className="sf-timeline-item" key={entry.label}>
                  <span
                    className="sf-timeline-dot"
                    style={{
                      background:
                        entry.state === 'warning'
                          ? 'var(--sf-warning)'
                          : entry.state === 'idle'
                            ? 'var(--gray-400)'
                            : 'var(--sf-primary)',
                    }}
                  />
                  <span>
                    <strong style={{ display: 'block' }}>{entry.label}</strong>
                    <span className="sf-muted">{entry.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
