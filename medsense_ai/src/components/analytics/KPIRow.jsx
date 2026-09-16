// src/components/analytics/KPIRow.jsx
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const Sparkline = ({ data, color, width = 100, height = 40 }) => {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  if (!data || data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <motion.polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={isMounted ? { pathLength: 1, opacity: 1 } : {}}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </svg>
  );
};

const RetentionArc = ({ value, color, size = 48 }) => {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="var(--dash-border)"
        strokeWidth="4"
        fill="none"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth="4"
        fill="none"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={isMounted ? { strokeDashoffset: offset } : {}}
        transition={{ duration: 1, ease: "easeOut" }}
        strokeLinecap="round"
      />
    </svg>
  );
};

const KPICard = ({ title, value, delta, spark, prefix = '', suffix = '', isRetention = false, index }) => {
  const isPositive = delta > 0;
  const isNeutral = Math.abs(delta) <= 0.5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="dash-card"
      style={{
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        minHeight: '140px',
        overflow: 'hidden'
      }}
    >
      <div>
        <p style={{ fontSize: 'var(--text-label)', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
          {title}
        </p>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, color: 'var(--navy)', margin: 0 }}>
          {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
        </h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', color: isNeutral ? 'var(--gray-400)' : isPositive ? 'var(--green)' : 'var(--red)', fontSize: '0.85rem', fontWeight: 600 }}>
          {isNeutral ? <Minus size={14} /> : isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          <span style={{ marginLeft: '2px' }}>{Math.abs(delta)}%</span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 400 }}>vs last period</span>
      </div>

      <div style={{ position: 'absolute', bottom: '1.25rem', right: '1.25rem' }}>
        {isRetention ? (
          <RetentionArc value={value} color="var(--blue)" />
        ) : (
          <Sparkline data={spark} color={isPositive ? 'var(--green)' : 'var(--blue)'} />
        )}
      </div>
    </motion.div>
  );
};

export default function KPIRow({ data }) {
  if (!data) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', width: '100%' }}>
      <KPICard 
        index={0}
        title="Total Revenue" 
        value={data.totalRevenue.value} 
        delta={data.totalRevenue.delta} 
        spark={data.totalRevenue.spark} 
        prefix="PKR " 
      />
      <KPICard 
        index={1}
        title="Total Orders" 
        value={data.totalOrders.value} 
        delta={data.totalOrders.delta} 
        spark={data.totalOrders.spark} 
      />
      <KPICard 
        index={2}
        title="Avg. Order Value" 
        value={data.avgOrderValue.value} 
        delta={data.avgOrderValue.delta} 
        spark={data.avgOrderValue.spark} 
        prefix="PKR " 
      />
      <KPICard 
        index={3}
        title="Customer Retention" 
        value={data.customerRetention.value} 
        delta={data.customerRetention.delta} 
        suffix="%" 
        isRetention={true} 
      />
    </div>
  );
}
