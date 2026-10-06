// src/pages/dashboard/SalesOptimization.jsx
// Real API: /api/sales/*
import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Minus,
  DollarSign, ShoppingCart, Loader2, AlertTriangle, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../services/api';

const PERIODS = [
  { id: '7',  label: 'Last 7 Days'  },
  { id: '30', label: 'Last 30 Days' },
  { id: '60', label: 'Last 60 Days' },
  { id: '90', label: 'Last 90 Days' },
];

const COLORS = ['#2563eb','#7c3aed','#10b981','#f59e0b','#ef4444','#0ea5e9','#8b5cf6','#06b6d4'];

function KPICard({ title, value, delta, icon: Icon, color, currency = false }) {
  const isPos = delta > 0; const isNeg = delta < 0;
  const TrendIcon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  const trendColor = isPos ? '#16a34a' : isNeg ? '#dc2626' : '#94a3b8';
  const displayValue =
    currency && typeof value === 'number'
      ? `PKR ${value.toLocaleString()}`
      : value;
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={color} />
        </div>
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{title}</span>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy)', marginBottom: '0.25rem' }}>
        {displayValue}
      </div>
      {delta !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: trendColor }}>
          <TrendIcon size={12} />
          {Math.abs(delta)}% vs previous period
        </div>
      )}
    </div>
  );
}

export default function SalesOptimization() {
  const [days,         setDays]         = useState('30');
  const [loading,      setLoading]      = useState(true);
  const [overview,     setOverview]     = useState(null);
  const [products,     setProducts]     = useState([]);
  const [slowMovers,   setSlowMovers]   = useState([]);
  const [recommendations, setRecs]     = useState([]);
  const [loadError,       setLoadError]     = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');

    try {
      const params = `?days=${days}`;

      const [ov, pr, sm, rc] = await Promise.all([
        api.get(`/sales/overview${params}`),
        api.get(`/sales/products${params}&limit=8`),
        api.get(`/sales/slow-movers${params}&limit=6`),
        api.get(`/sales/recommendations${params}`),
      ]);

      setOverview(ov.data?.data || null);
      setProducts(Array.isArray(pr.data?.data) ? pr.data.data : []);
      setSlowMovers(Array.isArray(sm.data?.data) ? sm.data.data : []);
      setRecs(Array.isArray(rc.data?.data) ? rc.data.data : []);
    } catch (err) {
      console.error(
        'SalesOptimization load error:',
        err.message
      );

      setOverview(null);
      setProducts([]);
      setSlowMovers([]);
      setRecs([]);
      setLoadError(
        'Sales Optimization data could not be loaded. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [days]);

  const priorityColor = { high: '#dc2626', medium: '#f59e0b', low: '#2563eb' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy)' }}>Sales Optimization</h1>
          <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b' }}>Explainable decision support from real invoice history and current live stock</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setDays(p.id)} style={{
              padding: '0.4rem 0.875rem', borderRadius: 8, border: '1px solid',
              borderColor: days === p.id ? '#2563eb' : '#e2e8f0',
              background: days === p.id ? '#eff6ff' : 'white',
              color: days === p.id ? '#2563eb' : '#64748b',
              fontWeight: days === p.id ? 600 : 400, fontSize: '0.8rem', cursor: 'pointer',
            }}>{p.label}</button>
          ))}
          <button onClick={load} style={{ width: 36, height: 36, borderRadius: 9, border: '1px solid #e2e8f0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader2 size={28} color="#2563eb" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : loadError ? (
        <div
          role="alert"
          style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 12,
            color: '#9a3412',
            padding: '1rem',
            fontSize: '0.82rem',
          }}
        >
          {loadError}
        </div>
      ) : (
        <>
          {/* KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <KPICard title="Recorded Sales" value={overview?.recordedSales?.value || 0} delta={overview?.recordedSales?.delta} icon={DollarSign} color="#2563eb" currency />
            <KPICard title="Total Orders" value={overview?.orders?.value || 0} delta={overview?.orders?.delta} icon={ShoppingCart} color="#7c3aed" />
            <KPICard title="Average Invoice Value" value={overview?.averageInvoiceValue?.value || 0} delta={overview?.averageInvoiceValue?.delta} icon={TrendingUp} color="#16a34a" currency />
          </div>
          {/* Top Products Chart */}
          {products.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1.25rem', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy)' }}>
                Top Medicines by Units Sold
              </h3>
              <div style={{ minWidth: 0 }}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={products} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="medicineName" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={v => [v?.toLocaleString(), 'Units Sold']} />
                    <Bar dataKey="totalQty" radius={[0, 4, 4, 0]}>
                      {products.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Governed operational review flags */}
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.875rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy)' }}>
                Recommendations
              </h3>
              {recommendations.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>No operational review flags for this period.</p>
              ) : (
                recommendations.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', padding: '0.625rem 0', borderBottom: i < recommendations.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: priorityColor[r.priority] || '#94a3b8', marginTop: 6, flexShrink: 0 }} />
                    <div>
                      <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy)' }}>{r.title}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>{r.description}</p>

                      {r.evidence && (
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.35rem',
                          marginTop: '0.45rem'
                        }}>
                          {Object.entries(r.evidence).map(([key, value]) => {
                            const label =
                              key === 'stockQuantity' ? 'Live stock' :
                              key === 'minimumThreshold' ? 'Min. threshold' :
                              key === 'unitsSold' ? 'Units sold' :
                              key === 'periodDays' ? 'Period' :
                              key;

                            return (
                              <span
                                key={key}
                                style={{
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 100,
                                  padding: '2px 7px',
                                  color: '#475569',
                                  fontSize: '0.66rem'
                                }}
                              >
                                {label}: <strong>{value}{key === 'periodDays' ? ' days' : ''}</strong>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <p style={{
                        margin: '0.5rem 0 0',
                        paddingTop: '0.45rem',
                        borderTop: '1px solid #f1f5f9',
                        color: '#475569',
                        fontSize: '0.68rem',
                        lineHeight: 1.45
                      }}>
                        {r.kind === 'REPLENISHMENT_REVIEW'
                          ? 'Recommended review: verify demand and replenishment quantity before purchasing.'
                          : r.kind === 'SLOW_MOVING_STOCK_REVIEW'
                            ? 'Recommended review: inspect stock exposure before further procurement.'
                            : 'No immediate operational action is currently flagged.'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Slow Movers */}
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.875rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={16} color="#f59e0b" /> Slow Movers
              </h3>
              {slowMovers.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>No slow-moving stock flags for this period.</p>
              ) : (
                slowMovers.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: i < slowMovers.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy)' }}>{s.medicineName}</p>
                      <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>{s.category} · {s.quantity} units in stock</p>
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 100 }}>
                      {s.neverSold ? 'Never sold' : `${s.daysNoSales}d no sales`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{
            marginTop: '1rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '0.875rem 1rem',
            color: '#64748b',
            fontSize: '0.72rem',
            lineHeight: 1.55
          }}>
            <strong style={{ color: 'var(--navy)' }}>Methodology:</strong>{' '}
            Sales Optimization uses observed invoice history, current active
            stock and configured minimum stock thresholds to generate
            explainable operational review flags. It does not automatically
            purchase inventory, change medicine prices, create discounts or
            execute promotions.
          </div>

          {/* Product Table */}
          {products.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '1.25rem', marginTop: '1rem', overflowX: 'auto' }}>
              <h3 style={{ margin: '0 0 0.875rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy)' }}>Product Performance</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Rank', 'Medicine', 'Category', 'Qty Sold', 'Product Recorded Sales', 'Orders'].map(h => (
                      <th key={h} style={{ padding: '0.625rem 0.875rem', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p.medicineId} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '0.625rem 0.875rem', fontSize: '0.82rem', fontWeight: 700, color: COLORS[i % COLORS.length] }}>#{p.rank}</td>
                      <td style={{ padding: '0.625rem 0.875rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy)' }}>{p.medicineName}</td>
                      <td style={{ padding: '0.625rem 0.875rem', fontSize: '0.78rem' }}>
                        <span style={{ background: '#eff6ff', color: '#2563eb', padding: '1px 7px', borderRadius: 100, fontSize: '0.68rem', fontWeight: 600 }}>{p.category}</span>
                      </td>
                      <td style={{ padding: '0.625rem 0.875rem', fontSize: '0.82rem' }}>{p.totalQty}</td>
                      <td style={{ padding: '0.625rem 0.875rem', fontSize: '0.82rem', fontWeight: 700 }}>PKR {p.recordedSales.toLocaleString()}</td>
                      <td style={{ padding: '0.625rem 0.875rem', fontSize: '0.82rem' }}>{p.orderCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}