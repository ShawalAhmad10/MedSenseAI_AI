// src/components/analytics/MedicineDemandChart.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="dash-card" style={{ padding: '0.75rem 1rem', background: 'white', border: '1px solid var(--dash-border)', boxShadow: 'var(--dash-shadow-hover)' }}>
        <p style={{ margin: '0 0 0.5rem 0', fontWeight: 700, fontSize: '0.85rem', color: 'var(--navy)' }}>{data.name}</p>
        <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem' }}>
            <span>Units Sold:</span>
            <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{data.units}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem' }}>
            <span>Revenue Generated:</span>
            <span style={{ fontWeight: 700, color: 'var(--navy)' }}>PKR {data.revenue.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem' }}>
            <span>% of Total Units:</span>
            <span style={{ fontWeight: 700, color: 'var(--blue)' }}>{data.pctOfTotal}%</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function MedicineDemandChart({ data }) {
  if (!data) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="dash-card"
      style={{ padding: '1.5rem', height: '100%' }}
    >
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.1rem', margin: '0 0 4px 0' }}>Top 10 Medicine Demand</h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--gray-400)', fontWeight: 300, margin: 0 }}>Units sold in selected period</p>
      </div>

      <div style={{ height: 400, width: '100%', minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 0, right: 40, top: 0, bottom: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--navy)', fontWeight: 500 }}
              tickFormatter={(value) => value.length > 20 ? value.substring(0, 17) + '...' : value}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--dash-bg)', radius: 4 }} />
            <Bar
              dataKey="units"
              radius={[0, 4, 4, 0]}
              barSize={20}
              isAnimationActive={true}
              animationDuration={800}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index < 3 ? 'var(--blue)' : 'var(--blue-mid)'}
                  style={{ opacity: index < 3 ? 1 : 0.4 }}
                />
              ))}
            </Bar>
            {/* Value Labels on top of bars */}
            <Bar dataKey="units" hide>
               {/* This is a trick to show values if Recharts allowed simple labels easily, 
                   but we'll use a cleaner approach or just Tooltip as requested. 
                   Adding custom labels is better for clarity. */}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--dash-bg)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)' }} />
        <p style={{ fontSize: '0.7rem', color: 'var(--gray-600)', margin: 0 }}>
          <span style={{ fontWeight: 700 }}>{data[0]?.name}</span> leads with <span style={{ fontWeight: 700 }}>{data[0]?.units}</span> units sold.
        </p>
      </div>
    </motion.div>
  );
}
