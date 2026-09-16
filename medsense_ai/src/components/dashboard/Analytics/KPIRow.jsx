// src/components/dashboard/Analytics/KPIRow.jsx
// ─────────────────────────────────────────────────────────────────────
// Four KPI cards with:
//  • Inline SVG sparklines (polyline, left-to-right draw animation)
//  • Retention card: SVG semicircle arc animated via stroke-dasharray
//  • Delta arrows: ↑ green / ↓ red / → gray
// ─────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Minus, DollarSign, ShoppingCart, TrendingUp, Users } from 'lucide-react';

// ── Animated SVG Sparkline ─────────────────────────────────────────────
const Sparkline = ({ data, color = 'var(--blue)', width = 80, height = 28 }) => {
  const polyRef = useRef(null);
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const xStep = width / (data.length - 1);
  const points = data.map((d, i) => {
    const x = i * xStep;
    const y = height - ((d - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Animate: draw left-to-right using stroke-dashoffset
  useEffect(() => {
    const el = polyRef.current;
    if (!el) return;
    const len = el.getTotalLength?.() || 200;
    el.style.strokeDasharray  = len;
    el.style.strokeDashoffset = len;
    el.style.transition = 'none';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'stroke-dashoffset 0.5s ease-out';
        el.style.strokeDashoffset = '0';
      });
    });
  }, [data]);

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ overflow: 'visible' }}>
      <polyline ref={polyRef} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
};

// ── Retention Arc (SVG stroke-dasharray semicircle) ─────────────────────
const RetentionArc = ({ value, color = 'var(--blue)' }) => {
  const [animated, setAnimated] = useState(0);
  const size = 56, sw = 6, r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  // Use half-circle (180°) to show retention as semicircle gauge
  const halfCirc = circ / 2;
  const fill = (animated / 100) * halfCirc;

  useEffect(() => {
    setAnimated(0);
    const t = setTimeout(() => setAnimated(value), 50);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <svg width={size} height={size / 2 + sw} aria-hidden="true" style={{ overflow: 'visible' }}>
      {/* Track */}
      <path
        d={`M ${sw / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - sw / 2} ${size / 2}`}
        fill="none"
        stroke="var(--dash-border)"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      {/* Fill arc */}
      <path
        d={`M ${sw / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - sw / 2} ${size / 2}`}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={`${halfCirc} ${halfCirc}`}
        strokeDashoffset={halfCirc - fill}
        style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
      />
      {/* Percentage text */}
      <text x={size / 2} y={size / 2 + 2} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--navy)" fontFamily="var(--font-display)">
        {value.toFixed(0)}%
      </text>
    </svg>
  );
};

// ── Delta badge ──────────────────────────────────────────────────────────
const Delta = ({ value }) => {
  const flat = Math.abs(value) <= 0.5;
  const pos  = value > 0.5;
  const color = flat ? 'var(--gray-400)' : pos ? 'var(--green)' : 'var(--red)';
  const Icon  = flat ? Minus : pos ? ArrowUp : ArrowDown;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:3, fontSize:'0.72rem', fontWeight:700, color, background:`${color}14`, padding:'2px 7px', borderRadius:5, flexShrink:0 }}>
      <Icon size={11} />
      {Math.abs(value).toFixed(1)}%
      <span style={{ fontWeight:400, color:'var(--gray-400)', fontSize:'0.62rem' }}>vs last</span>
    </div>
  );
};

// ── Single KPI Card ───────────────────────────────────────────────────────
const KPICard = ({ title, icon: Icon, iconColor, value, delta, spark, isRetention }) => {
  const fmtValue = () => {
    if (title.includes('Revenue')) return `PKR ${value.toLocaleString()}`;
    if (title.includes('Order Value')) return `PKR ${value.toLocaleString()}`;
    if (title.includes('Retention')) return `${value.toFixed(1)}%`;
    return value.toLocaleString();
  };

  return (
    <div className="dash-card" style={{ padding:'1.25rem', display:'flex', flexDirection:'column', gap:'0.625rem' }}>
      {/* Label */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', color:'var(--gray-400)', fontSize:'0.72rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>
        <div style={{ width:28, height:28, borderRadius:7, background:`${iconColor}15`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Icon size={13} color={iconColor} />
        </div>
        {title}
      </div>

      {/* Value row */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:'0.5rem' }}>
        <div>
          <p style={{ margin:0, fontSize:'1.5rem', fontWeight:700, fontFamily:'var(--font-display)', color:'var(--navy)', lineHeight:1 }}>
            {fmtValue()}
          </p>
        </div>
        <Delta value={delta} />
      </div>

      {/* Sparkline or retention arc */}
      <div style={{ display:'flex', justifyContent: isRetention ? 'center' : 'flex-end', paddingTop:'0.25rem' }}>
        {isRetention
          ? <RetentionArc value={value} color={iconColor} />
          : <Sparkline data={spark} color={iconColor} />
        }
      </div>
    </div>
  );
};

// ── KPI Row ──────────────────────────────────────────────────────────────
export default function KPIRow({ kpis }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(210px, 1fr))', gap:'1rem', marginBottom:'1.5rem' }}>
      <KPICard title="Total Revenue"      icon={DollarSign} iconColor="var(--blue)"  value={kpis.totalRevenue.value}      delta={kpis.totalRevenue.delta}      spark={kpis.totalRevenue.spark} />
      <KPICard title="Total Orders"       icon={ShoppingCart} iconColor="var(--green)" value={kpis.totalOrders.value}       delta={kpis.totalOrders.delta}       spark={kpis.totalOrders.spark} />
      <KPICard title="Avg. Order Value"   icon={TrendingUp}  iconColor="#8b5cf6"      value={kpis.avgOrderValue.value}     delta={kpis.avgOrderValue.delta}     spark={kpis.avgOrderValue.spark} />
      <KPICard title="Customer Retention" icon={Users}       iconColor="var(--amber)" value={kpis.customerRetention.value} delta={kpis.customerRetention.delta} isRetention />
    </div>
  );
}
