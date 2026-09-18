import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;

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
          fontWeight: 700,
          fontSize: '0.85rem',
          color: 'var(--navy)'
        }}
      >
        {data.name}
      </p>

      <div
        style={{
          fontSize: '0.75rem',
          color: 'var(--gray-600)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4
        }}
      >
        <span>
          Units sold: <strong>{data.units}</strong>
        </span>

        <span>
          Recorded sales:{' '}
          <strong>
            PKR {Number(data.recordedSales ?? data.revenue ?? 0).toLocaleString()}
          </strong>
        </span>

        <span>
          Share of units:{' '}
          <strong>{data.pctOfTotal}%</strong>
        </span>
      </div>
    </div>
  );
};

export default function MedicineDemandChart({
  data = []
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="dash-card"
      style={{
        padding: '1.5rem',
        height: '100%'
      }}
    >
      <div style={{ marginBottom: '1.5rem' }}>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '1.1rem',
            margin: '0 0 4px'
          }}
        >
          Medicine Demand
        </h3>

        <p
          style={{
            fontSize: '0.78rem',
            color: 'var(--gray-400)',
            margin: 0
          }}
        >
          Ranked by actual units sold from active invoice lines
        </p>
      </div>

      <div
        style={{
          height: 400,
          width: '100%',
          minWidth: 0
        }}
      >
        {data.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--gray-400)',
              fontSize: '0.85rem'
            }}
          >
            No sold medicines in the selected period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{
                left: 0,
                right: 40,
                top: 0,
                bottom: 0
              }}
            >
              <XAxis type="number" hide />

              <YAxis
                type="category"
                dataKey="name"
                width={120}
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: 11,
                  fill: 'var(--navy)',
                  fontWeight: 500
                }}
                tickFormatter={(value) =>
                  value.length > 20
                    ? value.substring(0, 17) + '...'
                    : value
                }
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'var(--dash-bg)' }}
              />

              <Bar
                dataKey="units"
                radius={[0, 4, 4, 0]}
                barSize={20}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={entry.productId || index}
                    fill={
                      index < 3
                        ? 'var(--blue)'
                        : 'var(--blue-mid)'
                    }
                    style={{
                      opacity: index < 3 ? 1 : 0.45
                    }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {data.length > 0 && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: 'var(--dash-bg)',
            borderRadius: 12,
            fontSize: '0.72rem',
            color: 'var(--gray-600)'
          }}
        >
          <strong>{data[0].name}</strong> currently leads with{' '}
          <strong>{data[0].units}</strong> recorded units sold.
        </div>
      )}
    </motion.div>
  );
}