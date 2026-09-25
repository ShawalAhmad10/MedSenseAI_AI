// src/components/charts/ProductBarChart.jsx
// ─────────────────────────────────────────────────────────────────────
// Horizontal bar chart for Top 5 / Bottom 5 products by revenue.
// • Toggle buttons in card header switch between views
// • Top 5 → green bars; Bottom 5 → amber bars
// • AnimatePresence transitions between views (300 ms ease-out)
// • Full Recharts animation on period change via `key` prop
// • Tooltip: category, units sold, revenue, % of total
// ─────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

// ── Custom Y-axis tick (truncates long names) ───────────────────────────
const CustomTick = ({ x, y, payload }) => {
  const name = payload.value.length > 16
    ? payload.value.substring(0, 15) + '…'
    : payload.value;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0} y={0} dy={4}
        textAnchor="end"
        fill="var(--navy)"
        fontSize={11}
        fontWeight={600}
        fontFamily="var(--font-body)"
      >
        {name}
      </text>
    </g>
  );
};

// ── Custom Tooltip ────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, totalRevenue }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = totalRevenue > 0 ? ((d.revenue / totalRevenue) * 100).toFixed(1) : '—';
  return (
    <div style={{
      background: 'white',
      border: '1px solid var(--dash-border)',
      borderRadius: 12,
      padding: '0.875rem 1rem',
      boxShadow: 'var(--dash-shadow-hover)',
      minWidth: 190,
      fontFamily: 'var(--font-body)',
    }}>
      <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.88rem', color: 'var(--navy)' }}>
        {d.name}
      </p>
      <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', color: 'var(--gray-400)' }}>
        {d.category}
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
        <span style={{ color: 'var(--gray-400)', fontSize: '0.78rem' }}>Units Sold</span>
        <span style={{ fontWeight: 600, color: 'var(--gray-600)', fontSize: '0.78rem' }}>
          {d.unitsSold?.toLocaleString()}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--dash-border)', paddingTop: '0.4rem', marginTop: '0.4rem' }}>
        <span style={{ color: 'var(--navy)', fontWeight: 600, fontSize: '0.82rem' }}>Revenue</span>
        <span style={{ fontWeight: 700, color: 'var(--blue)', fontSize: '0.82rem' }}>
          PKR {d.revenue?.toLocaleString()}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>
          {pct}% of total revenue
        </span>
      </div>
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────────────
export default function ProductBarChart({ topProducts, bottomProducts, selectedPeriod }) {
  const [view, setView] = useState('top'); // 'top' | 'bottom'

  const data      = view === 'top' ? topProducts : bottomProducts;
  const barColor  = view === 'top' ? 'var(--green)' : 'var(--amber)';
  const totalRev  = data.reduce((s, d) => s + d.revenue, 0);

  return (
    <div
      className="dash-card"
      style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column' }}
      role="img"
      aria-label={`Horizontal bar chart showing ${view === 'top' ? 'top 5' : 'bottom 5'} products by revenue`}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: view === 'top' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.3s',
          }}>
            {view === 'top'
              ? <TrendingUp size={16} color="var(--green)" />
              : <TrendingDown size={16} color="var(--amber)" />}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--navy)' }}>
              Product Performance
            </h3>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--gray-400)' }}>
              By revenue for the selected period
            </p>
          </div>
        </div>

        {/* Toggle */}
        <div style={{
          display: 'flex',
          background: 'var(--dash-bg)',
          borderRadius: 100,
          padding: 2,
        }}>
          {['top', 'bottom'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                background:   view === v ? 'white' : 'transparent',
                color:        view === v ? 'var(--navy)' : 'var(--gray-400)',
                boxShadow:    view === v ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                border:       'none',
                borderRadius: 100,
                padding:      '0.3rem 0.85rem',
                fontSize:     '0.75rem',
                fontWeight:   600,
                cursor:       'pointer',
                transition:   'all 0.25s',
                fontFamily:   'var(--font-body)',
              }}
            >
              {v === 'top' ? 'Top 5' : 'Bottom 5'}
            </button>
          ))}
        </div>
      </div>

      {/* Chart — AnimatePresence + key force re-animation on view & period change */}
      <div style={{ flex: 1, position: 'relative', minHeight: 260 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedPeriod}-${view}`}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, minWidth: 0 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: 4, right: 48, left: 10, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  vertical
                  stroke="var(--dash-border)"
                />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={<CustomTick />}
                  width={120}
                />
                <Tooltip
                  cursor={{ fill: 'var(--dash-bg)' }}
                  content={<CustomTooltip totalRevenue={totalRev} />}
                />
                <Bar
                  dataKey="revenue"
                  radius={[0, 5, 5, 0]}
                  barSize={18}
                  isAnimationActive
                  animationDuration={900}
                  animationEasing="ease-out"
                >
                  {/* Revenue label at end of bar */}
                  <LabelList
                    dataKey="revenue"
                    position="right"
                    formatter={v => `PKR ${v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v}`}
                    style={{ fontSize: 10, fill: 'var(--gray-600)', fontWeight: 600, fontFamily: 'var(--font-body)' }}
                  />
                  {data.map((_, i) => (
                    <Cell key={i} fill={barColor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
