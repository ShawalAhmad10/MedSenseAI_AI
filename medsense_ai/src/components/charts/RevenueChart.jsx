// src/components/charts/RevenueChart.jsx
// ─────────────────────────────────────────────────────────────────────
// Full-width line chart showing current vs. previous period revenue.
// • Recharts LineChart with monotone interpolation
// • Two lines: current (blue, solid, dots) / previous (gray, dashed)
// • Animated on mount AND re-animated on every period change via `key`
// • PKR-formatted Y-axis (12K, 1.2L)
// • Custom tooltip with date, both revenues, delta %
// ─────────────────────────────────────────────────────────────────────
import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';

/** Format PKR values for Y-axis ticks */
const formatPKR = (value) => {
  if (value >= 100000) return `PKR ${(value / 100000).toFixed(1)}L`;
  if (value >= 1000)   return `PKR ${(value / 1000).toFixed(0)}K`;
  return `PKR ${value}`;
};

// ── Custom Tooltip ──────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  const current  = payload.find(p => p.dataKey === 'current')?.value  ?? 0;
  const previous = payload.find(p => p.dataKey === 'previous')?.value ?? 0;
  const delta    = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const deltaPos = delta >= 0;

  return (
    <div style={{
      background: 'white',
      border: '1px solid var(--dash-border)',
      borderRadius: 14,
      padding: '0.875rem 1rem',
      boxShadow: 'var(--dash-shadow-hover)',
      minWidth: 190,
      fontFamily: 'var(--font-body)',
    }}>
      <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.82rem', color: 'var(--gray-600)' }}>
        {label}
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
        <span style={{ color: 'var(--blue)', fontWeight: 600, fontSize: '0.82rem' }}>This Period</span>
        <span style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '0.82rem' }}>
          PKR {current.toLocaleString()}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ color: 'var(--gray-400)', fontWeight: 500, fontSize: '0.82rem' }}>Previous</span>
        <span style={{ fontWeight: 600, color: 'var(--gray-600)', fontSize: '0.82rem' }}>
          PKR {previous.toLocaleString()}
        </span>
      </div>
      <div style={{
        borderTop: '1px solid var(--dash-border)',
        paddingTop: '0.4rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>vs. previous</span>
        <span style={{
          fontSize: '0.78rem',
          fontWeight: 700,
          color: deltaPos ? 'var(--green)' : 'var(--red)',
          background: deltaPos ? 'var(--green-light)' : 'var(--red-light)',
          padding: '2px 6px',
          borderRadius: 4,
        }}>
          {deltaPos ? '+' : ''}{delta.toFixed(1)}%
        </span>
      </div>
    </div>
  );
};

// ── Custom Legend ────────────────────────────────────────────────────────
const CustomLegend = () => (
  <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>
      <svg width={24} height={12}>
        <line x1={0} y1={6} x2={24} y2={6} stroke="var(--blue)" strokeWidth={2.5} />
        <circle cx={12} cy={6} r={3} fill="white" stroke="var(--blue)" strokeWidth={2} />
      </svg>
      This Period
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>
      <svg width={24} height={12}>
        <line x1={0} y1={6} x2={24} y2={6} stroke="var(--gray-300)" strokeWidth={2} strokeDasharray="4 3" />
      </svg>
      Previous Period
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────
export default function RevenueChart({ data, selectedPeriod }) {
  return (
    <div
      className="dash-card"
      style={{ padding: '1.25rem' }}
      role="img"
      aria-label="Revenue trend line chart comparing current and previous period"
    >
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(37,99,235,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Activity size={16} color="var(--blue)" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--navy)' }}>
              Revenue Trend
            </h3>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--gray-400)' }}>
              {selectedPeriod === 'last90' ? 'Weekly data points' : 'Daily data points'}
            </p>
          </div>
        </div>
        <CustomLegend />
      </div>

      {/* Chart — key forces unmount/remount → animations replay on period change */}
      <motion.div
        key={selectedPeriod}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        style={{ width: '100%', height: 300, minWidth: 0 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--dash-border)" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--gray-400)', fontFamily: 'var(--font-body)' }}
              interval="preserveStartEnd"
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--gray-400)', fontFamily: 'var(--font-body)' }}
              tickFormatter={formatPKR}
              width={70}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Previous period — dashed gray, no dots */}
            <Line
              name="Previous Period"
              type="monotone"
              dataKey="previous"
              stroke="var(--gray-300)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
              isAnimationActive
              animationDuration={1200}
              animationEasing="ease-out"
            />
            {/* Current period — solid blue with dot markers */}
            <Line
              name="This Period"
              type="monotone"
              dataKey="current"
              stroke="var(--blue)"
              strokeWidth={3}
              dot={{ r: 3.5, strokeWidth: 2, fill: 'white', stroke: 'var(--blue)' }}
              activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--blue)' }}
              isAnimationActive
              animationDuration={1400}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
