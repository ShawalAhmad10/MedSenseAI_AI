// src/components/consultations/ConsultationQueue.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SortDesc, Users, Clock } from 'lucide-react';

export default function ConsultationQueue({ queue, activeId, onSelect }) {
  const [sortBy, setSortBy] = useState('urgency');

  const sortedQueue = [...queue].sort((a, b) => {
    if (sortBy === 'urgency') {
      const levels = { critical: 0, high: 1, medium: 2, low: 3 };
      return levels[a.urgency] - levels[b.urgency];
    }
    return new Date(a.waitStart) - new Date(b.waitStart);
  });

  return (
    <div style={{ 
      width: '300px', minWidth: '300px', background: 'white', 
      display: 'flex', flexDirection: 'column', height: '100%', 
      position: 'relative', zIndex: 10
    }}>
      <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--dash-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            Escalated Queue
            <span style={{ background: 'var(--dash-bg)', color: 'var(--gray-600)', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '100px', fontWeight: 600 }}>
              {queue.length}
            </span>
          </h3>
          <div className="pulse-container">
             <div className="pulse-dot"></div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <SortButton active={sortBy === 'urgency'} onClick={() => setSortBy('urgency')}>Urgency</SortButton>
          <SortButton active={sortBy === 'wait'} onClick={() => setSortBy('wait')}>Wait Time</SortButton>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0' }} className="no-scrollbar">
        <AnimatePresence initial={false}>
          {sortedQueue.length > 0 ? (
            sortedQueue.map((item) => (
              <QueueItem 
                key={item.id} 
                item={item} 
                isActive={activeId === item.id} 
                onClick={() => onSelect(item.id)} 
              />
            ))
          ) : (
            <div style={{ textAlign: 'center', paddingTop: '4rem', color: 'var(--gray-300)' }}>
              <Users size={40} strokeWidth={1.5} style={{ marginBottom: '1rem', opacity: 0.5 }} />
              <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>No patients in queue</p>
            </div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        .pulse-container {
          width: 8px;
          height: 8px;
          background: var(--green);
          border-radius: 50%;
          position: relative;
        }
        .pulse-dot {
          position: absolute;
          width: 100%;
          height: 100%;
          background: var(--green);
          border-radius: 50%;
          animation: queuePulse 2s infinite;
        }
        @keyframes queuePulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function QueueItem({ item, isActive, onClick }) {
  const [waitTime, setWaitTime] = useState(Math.floor((Date.now() - new Date(item.waitStart)) / 1000));

  useEffect(() => {
    const timer = setInterval(() => {
      setWaitTime(Math.floor((Date.now() - new Date(item.waitStart)) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [item.waitStart]);

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    return `${mins}m`;
  };

  const getTimerColor = () => {
    if (waitTime >= 600) return 'var(--red)';
    if (waitTime >= 300) return 'var(--amber)';
    return 'var(--green)';
  };

  const getUrgencyBadgeStyles = (urgency) => {
    const configs = {
      critical: { color: 'var(--red)', bg: 'var(--red-light)', border: '1px solid rgba(239, 68, 68, 0.2)' },
      high: { color: 'var(--red)', bg: 'var(--red-light)', border: '1px solid rgba(239, 68, 68, 0.2)' },
      medium: { color: 'var(--amber)', bg: 'var(--amber-light)', border: '1px solid rgba(245, 158, 11, 0.2)' },
      low: { color: 'var(--green)', bg: 'var(--green-light)', border: '1px solid rgba(16, 185, 129, 0.2)' }
    };
    return configs[urgency] || configs.medium;
  };

  const avatarHue = item.name.length * 13 % 360;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ background: isActive ? 'rgba(37, 99, 235, 0.08)' : 'var(--dash-bg)' }}
      onClick={onClick}
      style={{
        padding: '12px',
        borderBottom: '1px solid var(--dash-border)',
        background: isActive ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
        borderLeft: `3px solid ${isActive ? 'var(--blue)' : 'transparent'}`,
        cursor: 'pointer',
        height: '88px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        transition: 'all 0.2s',
        overflow: 'hidden'
      }}
    >
      {/* Row 1: Avatar + Name + Age */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
        <div style={{ 
          width: '36px', height: '36px', borderRadius: '50%', 
          background: `hsl(${avatarHue}, 60%, 90%)`, color: `hsl(${avatarHue}, 70%, 40%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 600, fontSize: '13px', flexShrink: 0
        }}>
          {item.name.split(' ').map(n => n[0]).join('')}
        </div>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: '16px', color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.name}, {item.age}
          </span>
          {item.unread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)', border: '2px solid white', boxShadow: '0 0 0 1px var(--blue)' }} />}
        </div>
      </div>

      {/* Row 2: Message Preview */}
      <p style={{ 
        fontSize: '14px', fontWeight: 500, color: 'var(--gray-400)', margin: '0 0 4px 0', 
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        paddingLeft: '46px'
      }}>
        {item.preview}
      </p>

      {/* Row 3: Wait Time + Badges */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: '46px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 400, color: getTimerColor() }}>
          <Clock size={12} />
          {formatTime(waitTime)}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ 
            fontSize: '12px', padding: '1px 8px', borderRadius: '4px', 
            background: item.source === 'AI Escalation' ? 'rgba(37, 99, 235, 0.08)' : 'var(--dash-bg)',
            border: item.source === 'AI Escalation' ? '1px solid rgba(37, 99, 235, 0.2)' : '1px solid var(--dash-border)',
            color: item.source === 'AI Escalation' ? 'var(--blue)' : 'var(--gray-600)',
            fontWeight: 400
          }}>
            {item.source}
          </span>
          <span style={{ 
            fontSize: '12px', padding: '1px 8px', borderRadius: '4px',
            fontWeight: 400,
            ...getUrgencyBadgeStyles(item.urgency)
          }}>
            {item.urgency.toUpperCase()}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function SortButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        fontSize: '12px',
        fontWeight: 600,
        borderRadius: '100px',
        border: '1px solid',
        borderColor: active ? 'var(--navy)' : 'var(--dash-border)',
        background: active ? 'var(--navy)' : 'white',
        color: active ? 'white' : 'var(--gray-600)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}
    >
      <SortDesc size={12} />
      {children}
    </button>
  );
}

