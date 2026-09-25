// src/components/charts/CategoryDonut.jsx
// ─────────────────────────────────────────────────────────────────────
// Donut chart showing revenue split by pharmacy category.
// • Recharts PieChart with custom active-shape explode (translate 6px)
// • Center label shows total revenue for period
// • Arc-draw animation on mount + re-animation on period change via key
// • Custom legend: colored dot + name + PKR value + % share
// • Hover legend item also highlights the corresponding segment
// ─────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Sector, Tooltip } from 'recharts';
import { motion } from 'framer-motion';
import { PieChart as PieChartIcon } from 'lucide-react';

// ── PKR formatter ────────────────────────────────────────────────────────
const fmt = (v) => {
  if (v >= 100000) return `PKR ${(v / 100000).toFixed(1)}L`;
  if (v >= 1000)   return `PKR ${(v / 1000).toFixed(0)}K`;
  return `PKR ${v}`;
};

// ── Active/exploded segment (translates outward 6 px on hover) ──────────
const ActiveShape = (props) => {
  const {
    cx, cy, innerRadius, outerRadius,
    startAngle, endAngle, fill,
  } = props;

  // Midpoint angle for translation direction
  const RADIAN   = Math.PI / 180;
  const midAngle = (startAngle + endAngle) / 2;
  const dx       = Math.cos(-midAngle * RADIAN) * 6;
  const dy       = Math.sin(-midAngle * RADIAN) * 6;

  return (
    <g>
      <Sector
        cx={cx + dx}
        cy={cy + dy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 5}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))', transition: 'all 0.25s ease' }}
      />
    </g>
  );
};

// ── Center label rendered via a regular sector with no fill ─────────────
// We render it separately so it persists while segments are hovered.

// ── Custom Tooltip ────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: 'white',
      border: '1px solid var(--dash-border)',
      borderRadius: 12,
      padding: '0.75rem 1rem',
      boxShadow: 'var(--dash-shadow-hover)',
      fontFamily: 'var(--font-body)',
      minWidth: 160,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.35rem' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '0.85rem' }}>{d.name}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--gray-400)', fontSize: '0.78rem' }}>Revenue</span>
        <span style={{ fontWeight: 700, color: 'var(--blue)', fontSize: '0.82rem' }}>
          PKR {d.value.toLocaleString()}
        </span>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────
export default function CategoryDonut({ data, selectedPeriod }) {
  const [activeIndex, setActiveIndex] = useState(null);

  const totalRevenue = data.reduce((s, item) => s + item.value, 0);

  return (
    <div
      className="dash-card"
      style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column' }}
      role="img"
      aria-label="Donut chart showing revenue breakdown by medicine category"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(139,92,246,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <PieChartIcon size={16} color="#8b5cf6" />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--navy)' }}>
            Sales by Category
          </h3>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--gray-400)' }}>
            Revenue share breakdown
          </p>
        </div>
      </div>

      {/* Donut chart — key forces arc re-animation on period change */}
      <div style={{ position: 'relative', minHeight: 220 }}>
        <motion.div
          key={selectedPeriod}
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ width: '100%', height: 220, minWidth: 0 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={68}
                outerRadius={95}
                paddingAngle={2}
                dataKey="value"
                activeIndex={activeIndex ?? undefined}
                activeShape={<ActiveShape />}
                onMouseEnter={(_, i) => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                isAnimationActive
                animationDuration={1100}
                animationBegin={150}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={entry.color}
                    opacity={activeIndex === null || activeIndex === i ? 1 : 0.6}
                    style={{ transition: 'opacity 0.2s', outline: 'none', cursor: 'pointer' }}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Center label — absolute over chart */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}>
            <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--gray-400)', fontWeight: 500, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              Total
            </p>
            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>
              {fmt(totalRevenue)}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Custom Legend */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.3rem 0.5rem',
        marginTop: '0.5rem',
        overflowY: 'auto',
        maxHeight: 120,
      }} className="no-scrollbar">
        {data.map((entry, i) => {
          const share = totalRevenue > 0
            ? ((entry.value / totalRevenue) * 100).toFixed(1)
            : '0.0';
          const isHovered = activeIndex === i;
          return (
            <div
              key={entry.name}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                padding:        '0.2rem 0.4rem',
                borderRadius:   6,
                background:     isHovered ? 'var(--dash-bg)' : 'transparent',
                cursor:         'pointer',
                transition:     'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', flex: 1 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: entry.color, flexShrink: 0,
                }} />
                <span style={{
                  fontSize: '0.68rem',
                  color: 'var(--gray-600)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontWeight: isHovered ? 600 : 400,
                  transition: 'font-weight 0.15s',
                }}>
                  {entry.name}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 4 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy)' }}>
                  {share}%
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--gray-400)' }}>
                  {fmt(entry.value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
