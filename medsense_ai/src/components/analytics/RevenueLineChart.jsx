// src/components/analytics/RevenueLineChart.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const current = payload[0].value;
    const previous = payload[1]?.value;
    const delta = previous ? ((current - previous) / previous * 100).toFixed(1) : 0;
    
    return (
      <div className="dash-card" style={{ padding: '0.75rem 1rem', background: 'white', border: '1px solid var(--dash-border)', boxShadow: 'var(--dash-shadow-hover)' }}>
        <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, fontSize: '0.85rem', color: 'var(--navy)' }}>{label}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>Current Period</span>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy)' }}>PKR {current.toLocaleString()}</span>
          </div>
          {previous !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gray-300)' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>Previous Period</span>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy)' }}>PKR {previous.toLocaleString()}</span>
            </div>
          )}
          <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid var(--dash-border)', display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: parseFloat(delta) >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {parseFloat(delta) >= 0 ? '↑' : '↓'} {Math.abs(delta)}%
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function RevenueLineChart({ trendData, period }) {
  const [granularity, setGranularity] = useState('daily');

  // Auto-select granularity based on period
  useEffect(() => {
    if (period === 'last7') setGranularity('daily');
    else if (period === 'last30') setGranularity('weekly');
    else if (period === 'last90') setGranularity('monthly');
  }, [period]);

  const chartData = trendData[granularity] || [];

  const formatYAxis = (value) => {
    if (value >= 100000) return `₨${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₨${(value / 1000).toFixed(0)}K`;
    return `₨${value}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="dash-card"
      style={{ padding: '1.5rem', width: '100%' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.1rem', margin: '0 0 4px 0' }}>Revenue Trend</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--gray-400)', fontWeight: 300, margin: 0 }}>Comparison of current vs previous period revenue</p>
        </div>
        
        <div style={{ display: 'flex', gap: '4px', background: 'var(--dash-bg)', padding: '4px', borderRadius: '100px' }}>
          {['daily', 'weekly', 'monthly'].map((type) => (
            <button
              key={type}
              onClick={() => setGranularity(type)}
              style={{
                padding: '6px 14px',
                borderRadius: '100px',
                border: 'none',
                background: granularity === type ? 'var(--navy)' : 'transparent',
                color: granularity === type ? 'white' : 'var(--gray-600)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textTransform: 'capitalize'
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: 300, width: '100%', minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="var(--blue)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--dash-border)" />
            <XAxis 
              dataKey="label" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 11, fill: 'var(--gray-400)' }} 
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 11, fill: 'var(--gray-400)' }} 
              tickFormatter={formatYAxis}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Previous Period Line (Dashed) */}
            <Area
              type="monotone"
              dataKey="previous"
              stroke="var(--gray-300)"
              strokeWidth={2}
              strokeDasharray="5 5"
              fill="transparent"
              isAnimationActive={true}
              animationDuration={800}
            />

            {/* Current Period Area */}
            <Area
              type="monotone"
              dataKey="current"
              stroke="var(--blue)"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorCurrent)"
              dot={{ r: 4, fill: 'var(--blue)', strokeWidth: 2, stroke: 'white' }}
              activeDot={{ r: 6, strokeWidth: 0 }}
              isAnimationActive={true}
              animationDuration={1000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 12, height: 3, background: 'var(--blue)', borderRadius: '2px' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>Current Period</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 12, height: 3, border: '1px dashed var(--gray-300)', borderRadius: '2px' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>Previous Period</span>
        </div>
      </div>
    </motion.div>
  );
}
