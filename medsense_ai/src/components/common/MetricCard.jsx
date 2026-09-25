// src/components/common/MetricCard.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { useCountUp } from '../../hooks/useCountUp';
import { cardReveal } from '../../utils/animations';

export default function MetricCard({
  label,
  value = 0,
  prefix = '',
  suffix = '',
  trend = 0,
  icon: Icon,
  iconBg = '#dbeafe',
  iconColor = '#2563eb',
  sparkData = [],
  index = 0,
  formatValue,
}) {
  const displayValue = useCountUp(value, 1400);

  const formatted = formatValue
    ? formatValue(displayValue)
    : `${prefix}${displayValue >= 1000 ? (displayValue / 1000).toFixed(1) + 'K' : displayValue}${suffix}`;

  return (
    <motion.div
      variants={cardReveal}
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      whileHover={{
        y: -3,
        boxShadow: 'var(--dash-shadow-hover)',
        transition: { type: 'spring', stiffness: 400, damping: 20 },
      }}
      style={{
        gridColumn: 'span 3',
        background: 'white',
        border: '1px solid var(--dash-border)',
        borderRadius: 'var(--dash-radius)',
        padding: '1.25rem 1.5rem',
        boxShadow: 'var(--dash-shadow)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'default',
      }}
    >
      {/* Top row: label + icon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <p
          style={{
            fontSize: 'var(--text-label)',
            fontWeight: 500,
            color: 'var(--gray-400)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          {label}
        </p>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {Icon && <Icon size={16} color={iconColor} strokeWidth={1.8} />}
        </div>
      </div>

      {/* Big metric number */}
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-metric)',
          fontWeight: 700,
          color: 'var(--navy)',
          lineHeight: 1,
          marginBottom: '0.5rem',
          margin: '0 0 0.5rem 0',
          animation: 'countUp 0.5s ease',
        }}
      >
        {formatted}
      </p>

      {/* Trend row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {trend > 0 ? (
          <TrendingUp size={14} color="var(--green)" />
        ) : (
          <TrendingDown size={14} color="var(--red)" />
        )}
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: trend > 0 ? 'var(--green)' : 'var(--red)',
          }}
        >
          {Math.abs(trend)}%
        </span>
        <span
          style={{
            fontSize: '0.72rem',
            color: 'var(--gray-400)',
            fontWeight: 300,
          }}
        >
          vs last week
        </span>
      </div>

      {/* Mini sparkline */}
      {sparkData.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 80,
            height: 40,
            opacity: 0.5,
            minWidth: 0,
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={iconColor}
                strokeWidth={2}
                dot={false}
                isAnimationActive={true}
                animationDuration={1500}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}
