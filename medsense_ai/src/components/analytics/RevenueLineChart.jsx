import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const currentEntry =
    payload.find((entry) => entry.dataKey === 'current');

  const previousEntry =
    payload.find((entry) => entry.dataKey === 'previous');

  const current =
    Number(currentEntry?.value || 0);

  const previous =
    Number(previousEntry?.value || 0);

  return (
    <div
      className="dash-card"
      style={{
        padding: '0.75rem 1rem',
        background: 'white',
        border: '1px solid var(--dash-border)',
        boxShadow: 'var(--dash-shadow-hover)'
      }}
    >
      <p
        style={{
          margin: '0 0 0.5rem',
          fontWeight: 600,
          fontSize: '0.85rem',
          color: 'var(--navy)'
        }}
      >
        {label}
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          fontSize: '0.75rem'
        }}
      >
        <span>
          Current recorded sales:{' '}
          <strong>PKR {current.toLocaleString()}</strong>
        </span>

        <span>
          Previous equal period:{' '}
          <strong>PKR {previous.toLocaleString()}</strong>
        </span>
      </div>
    </div>
  );
};

export default function RevenueLineChart({
  trendData,
  period
}) {
  const [granularity, setGranularity] =
    useState('daily');

  useEffect(() => {
    if (period === 'last7') {
      setGranularity('daily');
    }

    if (period === 'last30') {
      setGranularity('weekly');
    }

    if (period === 'last90') {
      setGranularity('monthly');
    }
  }, [period]);

  const chartData =
    trendData?.[granularity] || [];

  const formatYAxis = (value) => {
    const number = Number(value || 0);

    if (number >= 100000) {
      return `PKR ${(number / 100000).toFixed(1)}L`;
    }

    if (number >= 1000) {
      return `PKR ${(number / 1000).toFixed(0)}K`;
    }

    return `PKR ${number}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="dash-card"
      style={{
        padding: '1.5rem',
        width: '100%'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.5rem',
          gap: '1rem',
          flexWrap: 'wrap'
        }}
      >
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '1.1rem',
              margin: '0 0 4px'
            }}
          >
            Recorded Sales Trend
          </h3>

          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--gray-400)',
              margin: 0
            }}
          >
            Active invoice totals compared with the immediately
            preceding equal-length period
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 4,
            background: 'var(--dash-bg)',
            padding: 4,
            borderRadius: 100
          }}
        >
          {['daily', 'weekly', 'monthly'].map((type) => (
            <button
              key={type}
              onClick={() => setGranularity(type)}
              style={{
                padding: '6px 14px',
                borderRadius: 100,
                border: 'none',
                background:
                  granularity === type
                    ? 'var(--navy)'
                    : 'transparent',
                color:
                  granularity === type
                    ? 'white'
                    : 'var(--gray-600)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          height: 300,
          width: '100%',
          minWidth: 0
        }}
      >
        {chartData.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--gray-400)',
              fontSize: '0.85rem'
            }}
          >
            No recorded sales data for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{
                top: 10,
                right: 10,
                left: 0,
                bottom: 0
              }}
            >
              <defs>
                <linearGradient
                  id="recordedSalesCurrent"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="var(--blue)"
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--blue)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--dash-border)"
              />

              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: 11,
                  fill: 'var(--gray-400)'
                }}
                dy={10}
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: 11,
                  fill: 'var(--gray-400)'
                }}
                tickFormatter={formatYAxis}
              />

              <Tooltip content={<CustomTooltip />} />

              <Area
                type="monotone"
                dataKey="previous"
                stroke="var(--gray-300)"
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="transparent"
              />

              <Area
                type="monotone"
                dataKey="current"
                stroke="var(--blue)"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#recordedSalesCurrent)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}