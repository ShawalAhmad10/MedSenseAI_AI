import React from 'react';
import { motion } from 'framer-motion';
import { Phone, Mail, MapPin, Star, Send, ArrowUpRight, ArrowDownRight, Minus, Package, Clock, MessageSquare, TrendingUp } from 'lucide-react';
import Drawer from '../common/Drawer';
import { formatDate } from '../../utils/formatters';

const getScoreColor = (score) => {
  if (score >= 80) return '#10b981'; // Hot
  if (score >= 50) return '#f59e0b'; // Warm
  return '#64748b'; // Cold
};

const getScoreSegment = (score) => {
  if (score >= 80) return { label: 'Hot', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
  if (score >= 50) return { label: 'Warm', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
  return { label: 'Cold', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)' };
};

const AnimatedRing = ({ score, size = 80, strokeWidth = 6 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} stroke="var(--dash-border)" strokeWidth={strokeWidth} fill="transparent" />
        <motion.circle
          cx={size/2} cy={size/2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: "easeOut" }}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <span style={{ fontSize: size > 60 ? '1.5rem' : '0.9rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--navy)', lineHeight: 1 }}>{score}</span>
      </div>
    </div>
  );
};

export default function CustomerProfileDrawer({ isOpen, onClose, customer }) {
  if (!customer) return null;

  const segment = getScoreSegment(customer.score);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width={460}>
      {/* HEADER */}
      <div style={{ padding: '2rem 1.5rem', background: 'white', borderBottom: '1px solid var(--dash-border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: customer.color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
              {customer.initials}
            </div>
            <div>
              <h2 style={{ margin: '0 0 0.25rem', fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy)' }}>
                {customer.name}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ padding: '2px 8px', borderRadius: 100, fontSize: '0.75rem', fontWeight: 700, background: segment.bg, color: segment.color }}>
                  {segment.label} Lead
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {customer.trend === 'up' && <ArrowUpRight size={14} color="#10b981" />}
                  {customer.trend === 'down' && <ArrowDownRight size={14} color="#ef4444" />}
                  {customer.trend === 'neutral' && <Minus size={14} color="#64748b" />}
                  Trend
                </span>
              </div>
            </div>
          </div>
          <AnimatedRing score={customer.score} size={70} strokeWidth={6} />
        </div>

        {/* Contact Info */}
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--gray-600)', fontSize: '0.85rem' }}>
            <Phone size={14} /> <span>{customer.phone}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--gray-600)', fontSize: '0.85rem' }}>
            <Mail size={14} /> <span>{customer.email}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--gray-600)', fontSize: '0.85rem' }}>
            <MapPin size={14} /> <span>Default Address (mocked)</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* SCORE BREAKDOWN */}
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={16} color="var(--blue)" /> Score Breakdown
          </h3>
          <div style={{ background: 'white', borderRadius: 12, padding: '1rem', border: '1px solid var(--dash-border)' }}>
            {[
              { label: 'Purchase Frequency', max: 30, val: customer.factors.frequency, color: '#3b82f6' },
              { label: 'Recency', max: 25, val: customer.factors.recency, color: '#10b981' },
              { label: 'Order Value', max: 25, val: customer.factors.value, color: '#8b5cf6' },
              { label: 'Engagement', max: 20, val: customer.factors.engagement, color: '#f59e0b' }
            ].map(factor => (
              <div key={factor.label} style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--gray-600)', fontWeight: 500 }}>{factor.label}</span>
                  <span style={{ color: 'var(--navy)', fontWeight: 700 }}>{factor.val}/{factor.max}</span>
                </div>
                <div style={{ width: '100%', height: 6, background: 'var(--dash-bg)', borderRadius: 100, overflow: 'hidden' }}>
                  <motion.div 
                    initial={{ width: 0 }} animate={{ width: `${(factor.val / factor.max) * 100}%` }} 
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    style={{ height: '100%', background: factor.color, borderRadius: 100 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* MEDICINES BOUGHT */}
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Package size={16} color="var(--blue)" /> Medicines Bought
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {customer.medicines.map(med => (
              <div key={med.name} style={{ background: 'white', border: '1px solid var(--dash-border)', padding: '0.25rem 0.5rem', borderRadius: 100, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{med.name}</span>
                <span style={{ background: 'var(--dash-bg)', color: 'var(--gray-600)', padding: '0px 6px', borderRadius: 100, fontSize: '0.7rem' }}>×{med.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CHATBOT INTERACTIONS */}
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageSquare size={16} color="var(--blue)" /> Chatbot Interactions
          </h3>
          {customer.chats.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-400)', fontStyle: 'italic' }}>No chatbot sessions recorded.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 5, top: 10, bottom: 10, width: 2, background: 'var(--dash-border)', zIndex: 0 }} />
              {customer.chats.map((chat, i) => (
                <div key={i} style={{ display: 'flex', gap: '1rem', position: 'relative', zIndex: 1 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--blue)', border: '2px solid white', marginTop: 4, flexShrink: 0 }} />
                  <div style={{ background: 'white', border: '1px solid var(--dash-border)', borderRadius: 12, padding: '0.75rem', flex: 1 }}>
                    <p style={{ margin: '0 0 0.25rem', fontSize: '0.7rem', color: 'var(--gray-400)' }}>{formatDate(chat.date)}</p>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--navy)' }}>"{chat.text}"</p>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 100, background: 'var(--dash-bg)', color: 'var(--gray-600)', fontSize: '0.7rem', fontWeight: 600 }}>
                      Outcome: {chat.outcome}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PURCHASE HISTORY TABLE */}
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} color="var(--blue)" /> Purchase History
          </h3>
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid var(--dash-border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                  <th style={{ padding: '0.75rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Order</th>
                  <th style={{ padding: '0.75rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Date</th>
                  <th style={{ padding: '0.75rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {customer.history.slice(0, 10).map((order) => (
                  <tr key={order.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                    <td style={{ padding: '0.75rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy)' }}>{order.id}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--gray-600)' }}>{formatDate(order.date)}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy)', textAlign: 'right' }}>Rs. {order.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* FOOTER ACTIONS */}
      <div style={{ padding: '1.5rem', background: 'white', borderTop: '1px solid var(--dash-border)', display: 'flex', gap: '1rem', marginTop: 'auto' }}>
        <motion.button
          whileHover={{ y: -2, boxShadow: 'var(--dash-shadow-hover)' }} whileTap={{ scale: 0.95 }}
          style={{ flex: 1, padding: '0.75rem', borderRadius: 100, background: 'var(--navy)', color: 'white', border: 'none', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
          onClick={() => {
            console.log(`[Toast]: Promo sent to ${customer.name}`);
            onClose();
          }}
        >
          <Send size={16} /> Send Promo
        </motion.button>
        <motion.button
          whileHover={{ background: 'var(--dash-bg)' }} whileTap={{ scale: 0.95 }}
          style={{ width: 44, height: 44, borderRadius: '50%', background: 'white', color: 'var(--gray-400)', border: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          onClick={() => {
            console.log(`[Toast]: ${customer.name} marked as VIP`);
          }}
        >
          <Star size={20} />
        </motion.button>
      </div>
    </Drawer>
  );
}
