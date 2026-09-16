// src/components/analytics/SeverityPieChart.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="dash-card" style={{ padding: '0.6rem 0.8rem', background: 'white', border: '1px solid var(--dash-border)', boxShadow: 'var(--dash-shadow-hover)' }}>
        <p style={{ margin: '0 0 4px 0', fontWeight: 700, fontSize: '0.8rem', color: 'var(--navy)' }}>{data.name}</p>
        <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', display: 'flex', justifyContent: 'space-between', gap: '1.5rem' }}>
          <span>Count:</span>
          <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{data.value}</span>
        </div>
      </div>
    );
  }
  return null;
};

const renderActiveShape = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

export default function SeverityPieChart({ data }) {
  const [activeIndex, setActiveIndex] = React.useState(-1);
  
  if (!data) return null;

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="dash-card"
      style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.1rem', margin: '0 0 4px 0' }}>Interaction Severity</h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--gray-400)', fontWeight: 300, margin: 0 }}>Chatbot query classification</p>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: '220px', minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(-1)}
              isAnimationActive={true}
              animationDuration={800}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        
        {/* Center Label */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--navy)', margin: 0, fontFamily: 'var(--font-display)' }}>{total.toLocaleString()}</p>
          <p style={{ fontSize: '0.65rem', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', margin: 0, letterSpacing: '0.05em' }}>Total</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginTop: '1.5rem' }}>
        {data.map((item, index) => (
          <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
            <div style={{ flex: 1 }}>
               <p style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy)', margin: 0 }}>{item.name}</p>
               <p style={{ fontSize: '0.68rem', color: 'var(--gray-400)', margin: 0 }}>
                 {item.value} &middot; {((item.value / total) * 100).toFixed(1)}%
               </p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
