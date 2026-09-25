// src/components/dashboard/SalesOptimization/ProductPerformanceTable.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, AlertTriangle, ArrowUp, ArrowDown, Minus, ChevronUp, ChevronDown } from 'lucide-react';

// ── Inline SVG Sparkline ──────────────────────────────────────────────
// Pixel-accurate to trendData values using linear interpolation
const Sparkline = ({ data, color, width = 80, height = 24 }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const xStep = width / (data.length - 1);
  const points = data
    .map((d, i) => {
      const x = i * xStep;
      const y = height - ((d - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
};

// ── Toast ─────────────────────────────────────────────────────────────
const Toast = ({ msg }) => (
  <AnimatePresence>
    {msg && (
      <motion.div
        initial={{ opacity: 0, y: -20, x: '-50%' }}
        animate={{ opacity: 1, y: 0, x: '-50%' }}
        exit={{ opacity: 0, y: -20, x: '-50%' }}
        style={{ position: 'absolute', top: 14, left: '50%', background: 'var(--navy)', color: 'white', padding: '0.4rem 1rem', borderRadius: 100, fontSize: '0.78rem', fontWeight: 600, zIndex: 50, boxShadow: 'var(--dash-shadow-hover)', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}
      >{msg}</motion.div>
    )}
  </AnimatePresence>
);

const PAGE_SIZE = 10;

export default function ProductPerformanceTable({ data, selectedPeriod }) {
  const [search,         setSearch]         = useState('');
  const [filterCategory, setFilterCategory] = useState('All Categories');
  const [filterStatus,   setFilterStatus]   = useState('All');
  const [sortField,      setSortField]      = useState('revenue');
  const [sortOrder,      setSortOrder]      = useState('desc');
  const [isLoading,      setIsLoading]      = useState(false);
  const [toastMsg,       setToastMsg]       = useState('');
  const [page,           setPage]           = useState(1);

  // Show skeleton on period change
  useEffect(() => {
    setIsLoading(true);
    setPage(1);
    const t = setTimeout(() => setIsLoading(false), 400);
    return () => clearTimeout(t);
  }, [selectedPeriod]);

  const categories = useMemo(() => {
    const cats = new Set(data.map(p => p.category));
    return ['All Categories', ...Array.from(cats).sort()];
  }, [data]);

  const maxUnits = useMemo(() => Math.max(...data.map(p => p.unitsSold), 1), [data]);

  const filtered = useMemo(() => {
    return data
      .filter(item => {
        if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterCategory !== 'All Categories' && item.category !== filterCategory) return false;
        if (filterStatus === 'Low Stock' && item.stockLeft > item.reorderPoint) return false;
        if (filterStatus === 'High Performers' && item.revenue < 50000) return false;
        return true;
      })
      .sort((a, b) => {
        const vA = a[sortField], vB = b[sortField];
        if (vA < vB) return sortOrder === 'asc' ? -1 : 1;
        if (vA > vB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [data, search, filterCategory, filterStatus, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (field) => {
    if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3 }}><ChevronDown size={11} /></span>;
    return sortOrder === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
  };

  const toast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); };

  const thStyle = (clickable = false) => ({
    padding: '0.875rem 1rem',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'var(--gray-400)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    userSelect: 'none',
    cursor: clickable ? 'pointer' : 'default',
    whiteSpace: 'nowrap',
  });

  return (
    <div className="dash-card" style={{ marginBottom: '1.5rem', overflow: 'hidden', position: 'relative' }}>
      <Toast msg={toastMsg} />

      {/* ── Header ── */}
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--navy)' }}>
          Product Performance
        </h2>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={13} color="var(--gray-400)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search medicines..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ padding: '0.4rem 0.75rem 0.4rem 2rem', borderRadius: 8, border: '1px solid var(--dash-border)', background: 'var(--dash-bg)', fontSize: '0.78rem', outline: 'none', width: 180, fontFamily: 'var(--font-body)' }}
            />
          </div>

          {/* Category dropdown */}
          <select
            value={filterCategory}
            onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
            style={{ padding: '0.4rem 2rem 0.4rem 0.75rem', borderRadius: 8, border: '1px solid var(--dash-border)', background: 'white', fontSize: '0.78rem', outline: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', appearance: 'none', backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Status toggle */}
          <div style={{ display: 'flex', background: 'var(--dash-bg)', borderRadius: 100, padding: 2 }}>
            {['All', 'Low Stock', 'High Performers'].map(s => (
              <button key={s} onClick={() => { setFilterStatus(s); setPage(1); }} style={{ background: filterStatus === s ? 'white' : 'transparent', color: filterStatus === s ? 'var(--navy)' : 'var(--gray-400)', boxShadow: filterStatus === s ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', border: 'none', borderRadius: 100, padding: '0.25rem 0.75rem', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 820 }}>
          <thead>
            <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
              <th scope="col" style={{ ...thStyle(), padding: '0.875rem 1.5rem' }}>Medicine</th>
              <th scope="col" style={thStyle(true)} onClick={() => handleSort('unitsSold')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>Units Sold <SortIcon field="unitsSold" /></div>
              </th>
              <th scope="col" style={thStyle(true)} onClick={() => handleSort('revenue')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>Revenue <SortIcon field="revenue" /></div>
              </th>
              <th scope="col" style={thStyle(true)} onClick={() => handleSort('stockLeft')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>Stock Left <SortIcon field="stockLeft" /></div>
              </th>
              <th scope="col" style={thStyle()}>Reorder Pt.</th>
              <th scope="col" style={thStyle()}>Trend</th>
              <th scope="col" style={{ ...thStyle(), textAlign: 'right', padding: '0.875rem 1.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} style={{ padding: '1rem' }}>
                      <div className="dash-shimmer" style={{ height: 14, borderRadius: 4, width: j === 0 ? '65%' : '80%' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : pageData.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>
                  No products match the selected filters.
                </td>
              </tr>
            ) : (
              pageData.map((item, idx) => {
                const isCritical = item.stockLeft <= item.reorderPoint;
                const isWarning  = !isCritical && item.stockLeft <= item.reorderPoint * 1.5;
                const stockColor = isCritical ? 'var(--red)' : isWarning ? 'var(--amber)' : 'var(--green)';
                const trendColor = item.trendDirection === 'up' ? 'var(--green)' : item.trendDirection === 'down' ? 'var(--red)' : 'var(--gray-400)';

                return (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.025 }}
                    style={{ borderBottom: '1px solid var(--dash-border)', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--dash-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Medicine name + category */}
                    <td style={{ padding: '0.875rem 1.5rem' }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.84rem', color: 'var(--navy)' }}>{item.name}</p>
                      <span style={{ fontSize: '0.68rem', color: 'var(--gray-400)', background: 'var(--dash-bg)', padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>{item.category}</span>
                    </td>

                    {/* Units sold + mini bar */}
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--navy)' }}>{item.unitsSold.toLocaleString()}</span>
                      <div style={{ width: 56, height: 3, background: 'var(--dash-bg)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--blue)', width: `${(item.unitsSold / maxUnits) * 100}%`, borderRadius: 2 }} />
                      </div>
                    </td>

                    {/* Revenue */}
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--navy)' }}>
                        PKR {item.revenue.toLocaleString()}
                      </span>
                    </td>

                    {/* Stock left */}
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div
                        role={isCritical ? 'alert' : undefined}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, color: stockColor, fontWeight: 600, fontSize: '0.84rem' }}
                      >
                        {item.stockLeft}
                        {(isCritical || isWarning) && (
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <AlertTriangle size={13} />
                            {isCritical && (
                              <div style={{ position: 'absolute', top: -2, right: -2, width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', animation: 'alertPulse 1.5s ease-in-out infinite' }} />
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Reorder point */}
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span style={{ fontSize: '0.84rem', color: 'var(--gray-400)' }}>{item.reorderPoint}</span>
                    </td>

                    {/* Sparkline + trend arrow */}
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Sparkline data={item.trendData} color={trendColor} />
                        <span style={{ color: trendColor }}>
                          {item.trendDirection === 'up'   ? <ArrowUp size={13} />   :
                           item.trendDirection === 'down' ? <ArrowDown size={13} /> :
                           <Minus size={13} />}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '0.875rem 1.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {isCritical && (
                          <button onClick={() => toast(`Reorder initiated for ${item.name}`)} style={{ background: 'var(--red-light)', color: 'var(--red)', border: 'none', padding: '3px 8px', borderRadius: 5, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            Reorder
                          </button>
                        )}
                        <button onClick={() => toast(`Promotion created for ${item.name}`)} style={{ background: 'var(--dash-bg)', color: 'var(--gray-600)', border: 'none', padding: '3px 8px', borderRadius: 5, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                          Promo
                        </button>
                        <button onClick={() => toast(`Viewing details for ${item.name}`)} style={{ background: 'var(--dash-bg)', color: 'var(--gray-600)', border: 'none', padding: '3px 8px', borderRadius: 5, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                          Details
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!isLoading && filtered.length > 0 && (
          <div style={{ padding: '0.875rem 1.5rem', borderTop: '1px solid var(--dash-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--gray-400)' }}>
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} products
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ padding: '0.3rem 0.75rem', border: '1px solid var(--dash-border)', borderRadius: 6, background: 'white', color: page === 1 ? 'var(--gray-300)' : 'var(--navy)', fontSize: '0.75rem', cursor: page === 1 ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}
              >Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} style={{ padding: '0.3rem 0.6rem', border: '1px solid', borderColor: page === p ? 'var(--blue)' : 'var(--dash-border)', borderRadius: 6, background: page === p ? 'var(--blue)' : 'white', color: page === p ? 'white' : 'var(--navy)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: page === p ? 700 : 400, fontFamily: 'var(--font-body)' }}>
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ padding: '0.3rem 0.75rem', border: '1px solid var(--dash-border)', borderRadius: 6, background: 'white', color: page === totalPages ? 'var(--gray-300)' : 'var(--navy)', fontSize: '0.75rem', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}
              >Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
