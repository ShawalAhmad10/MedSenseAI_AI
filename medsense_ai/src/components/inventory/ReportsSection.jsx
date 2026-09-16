import React from 'react';
import { Loader2, Package, PackagePlus } from 'lucide-react';

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

export default function ReportsSection({ 
  profitLossData, 
  batchReportData, 
  reportLoading, 
  reportPeriod, 
  setReportPeriod 
}) {
  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Period:</span>
        {['today', 'week', 'month'].map(period => (
          <button
            key={period}
            onClick={() => setReportPeriod(period)}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: 8,
              border: '1px solid var(--dash-border)',
              background: reportPeriod === period ? '#1e3a8a' : 'white',
              color: reportPeriod === period ? 'white' : 'var(--gray-600)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
          </button>
        ))}
      </div>

      {/* Profit & Loss Report */}
      <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)' }}>
        📊 Profit & Loss Report (FIFO Method)
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
            <th style={thStyle}>Product</th>
            <th style={thStyle}>Supplier</th>
            <th style={thStyle}>Qty Sold</th>
            <th style={thStyle}>Revenue</th>
            <th style={thStyle}>Cost (FIFO)</th>
            <th style={thStyle}>Profit</th>
            <th style={thStyle}>Margin %</th>
          </tr>
        </thead>
        <tbody>
          {reportLoading ? (
            <tr>
              <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                <div>Calculating profits with FIFO method...</div>
              </td>
            </tr>
          ) : !profitLossData?.productBreakdown || profitLossData.productBreakdown.length === 0 ? (
            <tr>
              <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                <Package size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                <div>No sales data for selected period</div>
              </td>
            </tr>
          ) : (
            profitLossData.productBreakdown.map((product, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{product.productName}</div>
                </td>
                <td style={tdStyle}>{product.supplier || '-'}</td>
                <td style={tdStyle}>{product.totalQuantity}</td>
                <td style={tdStyle}>PKR {product.totalRevenue.toLocaleString()}</td>
                <td style={tdStyle}>PKR {product.totalCost.toLocaleString()}</td>
                <td style={tdStyle}>
                  <span style={{ 
                    fontWeight: 700,
                    color: product.totalProfit >= 0 ? '#16a34a' : '#dc2626'
                  }}>
                    PKR {product.totalProfit.toLocaleString()}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ 
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: product.profitMargin >= 20 ? '#dcfce7' : product.profitMargin >= 10 ? '#fef3c7' : '#fee2e2',
                    color: product.profitMargin >= 20 ? '#166534' : product.profitMargin >= 10 ? '#92400e' : '#991b1b'
                  }}>
                    {product.profitMargin}%
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Batch-wise Report */}
      <h3 style={{ margin: '2rem 0 1rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)' }}>
        📦 Batch-wise Stock Report
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
            <th style={thStyle}>STK#</th>
            <th style={thStyle}>Bill#</th>
            <th style={thStyle}>Batch#</th>
            <th style={thStyle}>Product</th>
            <th style={thStyle}>Qty In</th>
            <th style={thStyle}>Qty Sold</th>
            <th style={thStyle}>Remaining</th>
            <th style={thStyle}>Expiry</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {reportLoading ? (
            <tr>
              <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                <div>Loading batch report...</div>
              </td>
            </tr>
          ) : !batchReportData?.batches || batchReportData.batches.length === 0 ? (
            <tr>
              <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                <PackagePlus size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                <div>No batch data available</div>
              </td>
            </tr>
          ) : (
            batchReportData.batches.slice(0, 50).map((batch, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 600, color: '#2563eb' }}>{batch.stockNumber}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{ 
                    fontWeight: 600, 
                    color: batch.bill_no ? '#2563eb' : 'var(--gray-400)',
                    background: batch.bill_no ? '#eff6ff' : 'transparent',
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: '0.78rem'
                  }}>
                    {batch.bill_no || 'No Bill'}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 600, color: '#7c3aed' }}>{batch.batch_number}</span>
                </td>
                <td style={tdStyle}>{batch.product_title}</td>
                <td style={tdStyle}>{batch.qty_in}</td>
                <td style={tdStyle}>{batch.qty_sold || 0}</td>
                <td style={tdStyle}>
                  <span style={{ 
                    fontWeight: 700,
                    color: batch.qty_remaining === 0 ? '#dc2626' : batch.qty_remaining < 10 ? '#f59e0b' : '#16a34a'
                  }}>
                    {batch.qty_remaining}
                  </span>
                </td>
                <td style={tdStyle}>
                  {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : '-'}
                </td>
                <td style={tdStyle}>
                  <span style={{ 
                    padding: '4px 8px', 
                    borderRadius: 999, 
                    fontSize: '0.7rem', 
                    fontWeight: 600,
                    background: batch.status === 'active' ? '#dcfce7' : batch.status === 'expired' ? '#fee2e2' : batch.status === 'expiring_soon' ? '#fed7aa' : '#e5e7eb',
                    color: batch.status === 'active' ? '#166534' : batch.status === 'expired' ? '#991b1b' : batch.status === 'expiring_soon' ? '#9a3412' : '#374151'
                  }}>
                    {batch.status.replace('_', ' ').toUpperCase()}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {batchReportData?.batches && batchReportData.batches.length > 50 && (
        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--gray-500)', fontSize: '0.85rem' }}>
          Showing first 50 batches of {batchReportData.batches.length} total batches
        </div>
      )}
    </div>
  );
}
