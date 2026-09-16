// SRS §3.2.6 / EUC-06: Refill reminders with overdue follow-up escalation state.
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { refillAlerts } from '../../services/storefrontData';

export default function RefillAlertsPage() {
  const { isAuthenticated, openAuthModal } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="storefront-shell">
        <div className="sf-card sf-section-card">
          <h1 style={{ fontFamily: 'var(--font-display)' }}>Refill Alerts</h1>
          <p className="sf-muted">
            Refill reminders are account-based because they follow your previous orders and saved medicines.
          </p>
          <button className="sf-button" onClick={() => openAuthModal('account')} type="button">
            Sign in for refill alerts
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
            <h1>Refill Alerts</h1>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Reorder actions and reminder follow-ups for repeat-purchase behavior.
            </p>
          </div>
        </div>
        {refillAlerts.length === 0 ? (
          <div className="sf-empty">No refill alerts are active yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {refillAlerts.map((alert) => (
              <article
                className="sf-summary-block"
                key={alert.id}
                style={{
                  borderColor: alert.notificationType === 'follow-up' ? 'rgba(220, 38, 38, 0.24)' : undefined,
                  background: alert.notificationType === 'follow-up' ? '#fff7f7' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ display: 'block' }}>{alert.medicine}</strong>
                    <span className="sf-muted">Due on {alert.dueDate} · {alert.remaining}</span>
                  </div>
                  <span className={alert.notificationType === 'follow-up' ? 'sf-badge-danger' : 'sf-badge-warning'}>
                    {alert.status}
                  </span>
                </div>
                <p className="sf-muted" style={{ marginBottom: 0 }}>{alert.notificationMessage}</p>
                <Link className="sf-link" style={{ display: 'inline-block', marginTop: '0.85rem' }} to="/search?q=paracetamol">
                  Reorder medicine
                </Link>
              </article>
            ))}

            <div className="sf-summary-block">
              <strong style={{ display: 'block', marginBottom: '0.75rem' }}>Notification Activity</strong>
              <div style={{ display: 'grid', gap: '0.65rem' }}>
                {refillAlerts.map((alert) => (
                  <div
                    key={`${alert.id}-notification`}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}
                  >
                    <span className="sf-muted">{alert.notificationMessage}</span>
                    <span className={alert.notificationType === 'follow-up' ? 'sf-badge-danger' : 'sf-badge'}>
                      {alert.notificationType === 'follow-up' ? 'Follow-up reminder' : 'Initial reminder'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
