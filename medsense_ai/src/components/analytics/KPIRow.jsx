import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const Sparkline = ({ data = [], color, width = 100, height = 40 }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!Array.isArray(data) || data.length === 0) return null;

  const numeric = data.map((value) => Number(value) || 0);
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const range = max - min || 1;
  const denominator = Math.max(numeric.length - 1, 1);

  const points = numeric
    .map((value, index) => {
      const x = (index / denominator) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <motion.polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={mounted ? { pathLength: 1, opacity: 1 } : {}}
        transition={{ duration: 0.8 }}
      />
    </svg>
  );
};

const PercentArc = ({ value, size = 48 }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const numericValue =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(100, value))
      : 0;

  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const offset =
    circumference - (numericValue / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      style={{ transform: 'rotate(-90deg)' }}
    >
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
        stroke="var(--blue)"
        strokeWidth="4"
        fill="none"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={
          mounted
            ? { strokeDashoffset: offset }
            : {}
        }
        transition={{ duration: 1 }}
        strokeLinecap="round"
      />
    </svg>
  );
};

const KPICard = ({
  title,
  value,
  delta = null,
  spark = [],
  prefix = '',
  suffix = '',
  percentage = false,
  comparisonLabel = 'vs previous equal period',
  index
}) => {
  const hasDelta =
    typeof delta === 'number' &&
    Number.isFinite(delta);

  const neutral =
    hasDelta && Math.abs(delta) <= 0.005;

  const positive =
    hasDelta && delta > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="dash-card"
      style={{
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        minHeight: 140,
        overflow: 'hidden'
      }}
    >
      <div>
        <p
          style={{
            fontSize: 'var(--text-label)',
            color: 'var(--gray-400)',
            fontWeight: 600,
            textTransform: 'uppercase',
            marginBottom: '0.5rem',
            letterSpacing: '0.05em'
          }}
        >
          {title}
        </p>

        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.75rem',
            fontWeight: 800,
            color: 'var(--navy)',
            margin: 0
          }}
        >
          {prefix}
          {typeof value === 'number'
            ? value.toLocaleString()
            : value}
          {suffix}
        </h2>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginTop: '0.75rem'
        }}
      >
        {hasDelta ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                color: neutral
                  ? 'var(--gray-400)'
                  : positive
                  ? 'var(--green)'
                  : 'var(--red)',
                fontSize: '0.85rem',
                fontWeight: 600
              }}
            >
              {neutral ? (
                <Minus size={14} />
              ) : positive ? (
                <TrendingUp size={14} />
              ) : (
                <TrendingDown size={14} />
              )}

              <span style={{ marginLeft: 2 }}>
                {Math.abs(delta)}%
              </span>
            </div>

            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--gray-400)'
              }}
            >
              {comparisonLabel}
            </span>
          </>
        ) : (
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--gray-400)'
            }}
          >
            {comparisonLabel}
          </span>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '1.25rem',
          right: '1.25rem'
        }}
      >
        {percentage ? (
          <PercentArc value={value} />
        ) : (
          <Sparkline
            data={spark}
            color={
              hasDelta && positive
                ? 'var(--green)'
                : 'var(--blue)'
            }
          />
        )}
      </div>
    </motion.div>
  );
};

export default function KPIRow({ data }) {
  if (!data) return null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns:
          'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1.25rem',
        width: '100%'
      }}
    >
      <KPICard
        index={0}
        title="Recorded Sales"
        value={data.recordedSales.value}
        delta={data.recordedSales.delta}
        spark={data.recordedSales.spark}
        prefix={
          typeof data.recordedSales.value === 'number'
            ? 'PKR '
            : ''
        }
      />

      <KPICard
        index={1}
        title="Invoices / Orders"
        value={data.orders.value}
        delta={data.orders.delta}
        spark={data.orders.spark}
      />

      <KPICard
        index={2}
        title="Avg. Invoice Value"
        value={data.avgInvoiceValue.value}
        delta={data.avgInvoiceValue.delta}
        spark={data.avgInvoiceValue.spark}
        prefix={
          typeof data.avgInvoiceValue.value === 'number'
            ? 'PKR '
            : ''
        }
      />

      <KPICard
        index={3}
        title="Observed Funnel Conversion"
        value={data.funnelConversion.value}
        suffix={
          typeof data.funnelConversion.value === 'number'
            ? '%'
            : ''
        }
        percentage={true}
        comparisonLabel="all-time observed storefront sessions"
      />
    </div>
  );
}