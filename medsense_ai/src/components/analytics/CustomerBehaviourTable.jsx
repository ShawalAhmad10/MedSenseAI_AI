// src/components/analytics/CustomerBehaviourTable.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const ProgressBar = ({ value, max, color = 'var(--blue)' }) => {
  const percentage = (value / max) * 100;
  return (
    <div style={{ width: '100%', height: '4px', background: 'var(--dash-bg)', borderRadius: '2px', marginTop: '4px' }}>
      <div style={{ width: `${percentage}%`, height: '100%', background: color, borderRadius: '2px' }} />
    </div>
  );
};

export default function CustomerBehaviourTable({ data, periodLabel }) {
  if (!data) return null;

  const maxSessionSeconds = Math.max(...data.map(d => d.sessionSeconds));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="dash-card"
      style={{ padding: '1.5rem', width: '100%', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.1rem', margin: '0 0 4px 0' }}>Customer Behaviour</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--gray-400)', fontWeight: 300, margin: 0 }}>User activity and engagement patterns</p>
        </div>
        <div style={{ padding: '6px 12px', background: 'var(--dash-bg)', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--navy)' }}>
          {periodLabel}
        </div>
      </div>

      <div style={{ overflowX: 'auto', margin: '0 -1.5rem', padding: '0 1.5rem' }} className="no-scrollbar">
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--dash-border)', color: 'var(--gray-400)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Segment</th>
              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Customer Count</th>
              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Avg. Session Duration</th>
              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Chatbot Queries</th>
              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Top Query Topic</th>
              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Conversion Rate</th>
              <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const segmentColors = {
                'New Customers': 'var(--blue)',
                'Returning Customers': 'var(--green)',
                'Inactive (30+ days)': 'var(--gray-400)',
                'VIP (top 10% spend)': 'var(--amber)'
              };
              
              const conversionColor = row.conversionRate > 40 ? 'var(--green)' : row.conversionRate > 20 ? 'var(--amber)' : 'var(--red)';

              return (
                <tr 
                  key={row.segment} 
                  style={{ borderBottom: i !== data.length - 1 ? '1px solid var(--dash-border)' : 'none', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--dash-bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '1rem 0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: 4, height: 24, borderRadius: '2px', background: segmentColors[row.segment] || 'var(--blue)' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy)' }}>{row.segment}</span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem 0.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy)' }}>{row.count.toLocaleString()}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>{row.pctOfTotal}% of total</span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem 0.5rem', width: '180px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--navy)', fontWeight: 500 }}>{row.avgSession}</span>
                      <ProgressBar value={row.sessionSeconds} max={maxSessionSeconds} color={segmentColors[row.segment]} />
                    </div>
                  </td>
                  <td style={{ padding: '1rem 0.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--navy)' }}>{row.chatbotQueries.toLocaleString()} total</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>{row.queriesPerUser}/customer</span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem 0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', background: 'var(--dash-bg)', padding: '4px 10px', borderRadius: '100px', color: 'var(--gray-600)', fontWeight: 500 }}>
                      {row.topTopic}
                    </span>
                  </td>
                  <td style={{ padding: '1rem 0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: conversionColor }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: conversionColor }}>{row.conversionRate}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem 0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: row.trend > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600, fontSize: '0.8rem' }}>
                      {row.trend > 0 ? <TrendingUp size={14} /> : row.trend < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
                      {Math.abs(row.trend)}%
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--dash-border)' }}>
        <p style={{ fontSize: '0.7rem', color: 'var(--gray-400)', fontStyle: 'italic', margin: 0 }}>
          Session data sourced from chatbot interaction logs. Conversion = session resulting in confirmed order.
        </p>
      </div>
    </motion.div>
  );
}
