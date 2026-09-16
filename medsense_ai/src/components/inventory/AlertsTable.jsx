import React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

const thStyle = {
  padding: '0.875rem 1rem',
  textAlign: 'left',
  fontSize: '0.72rem',
  fontWeight: 700,
  color: 'var(--gray-600)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle = {
  padding: '0.875rem 1rem',
  fontSize: '0.82rem',
  color: 'var(--gray-700)',
};

export default function AlertsTable({ alerts, isLoading }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
          <th style={thStyle}>Type</th>
          <th style={thStyle}>Product/Batch</th>
          <th style={thStyle}>Details</th>
          <th style={thStyle}>Severity</th>
          <th style={thStyle}>Message</th>
        </tr>
      </thead>
      <tbody>
        {isLoading ? (
          <tr>
            <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
              <div>Loading alerts...</div>
            </td>
          </tr>
        ) : alerts.length === 0 ? (
          <tr>
            <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
              <AlertTriangle size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
              <div>No alerts - Everything is good!</div>
            </td>
          </tr>
        ) : (
          alerts.map((alert, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid var(--dash-border)' }}>
              <td style={tdStyle}>
                <span style={{ 
                  padding: '4px 8px', 
                  borderRadius: 999, 
                  fontSize: '0.7rem', 
                  fontWeight: 600,
                  background: alert.type === 'low_stock' ? '#fef3c7' : alert.type === 'out_of_stock' ? '#fee2e2' : alert.type === 'expired' ? '#fecaca' : '#fed7aa',
                  color: alert.type === 'low_stock' ? '#92400e' : alert.type === 'out_of_stock' ? '#991b1b' : alert.type === 'expired' ? '#7f1d1d' : '#9a3412'
                }}>
                  {alert.type.replace('_', ' ').toUpperCase()}
                </span>
              </td>
              <td style={tdStyle}>
                <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{alert.productName}</div>
                {alert.batchNumber && <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>Batch: {alert.batchNumber}</div>}
              </td>
              <td style={tdStyle}>
                {alert.currentStock !== undefined && <div>Stock: {alert.currentStock}</div>}
                {alert.expiryDate && <div>Expiry: {new Date(alert.expiryDate).toLocaleDateString()}</div>}
                {alert.daysRemaining !== undefined && <div style={{ fontWeight: 600, color: alert.daysRemaining <= 7 ? '#dc2626' : '#f59e0b' }}>{alert.daysRemaining} days left</div>}
              </td>
              <td style={tdStyle}>
                <span style={{ 
                  padding: '4px 10px', 
                  borderRadius: 999, 
                  fontSize: '0.7rem', 
                  fontWeight: 700,
                  background: alert.severity === 'critical' ? '#dc2626' : '#f59e0b',
                  color: 'white'
                }}>
                  {alert.severity.toUpperCase()}
                </span>
              </td>
              <td style={tdStyle}>{alert.message}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
