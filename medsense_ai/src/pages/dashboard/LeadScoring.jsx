import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Sparkles, Users, Flame, AlertTriangle, TrendingUp, ArrowUp, ArrowDown, Minus, User as UserIcon, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { formatDate, formatTimeAgo } from '../../utils/formatters';
import CustomerProfileDrawer from '../../components/drawers/CustomerProfileDrawer';
import api from '../../services/api';

const getScoreColor = (score) => {
  if (score >= 80) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#64748b';
};

const AnimatedRingTable = ({ score, delay = 0 }) => {
  const size = 36;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} stroke="var(--dash-border)" strokeWidth={strokeWidth} fill="transparent" />
        <motion.circle
          cx={size/2} cy={size/2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.8, delay, ease: "easeOut" }}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--navy)' }}>
        {score}
      </div>
    </div>
  );
};

export default function LeadScoring() {
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [activeSegment, setActiveSegment] = useState('All');
  const [sortField, setSortField] = useState('score');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        // Step 1: trigger recalculation silently
        await api.post('/leads/recalculate').catch(() => {});

        // Step 2: fetch calculated scores from DB
        const res = await api.get('/leads?limit=100').catch(() => null);
        const rows = res?.data?.data?.leads ?? [];

        if (rows.length > 0) {
          const COLORS = ['#2563eb','#7c3aed','#10b981','#f59e0b','#ef4444','#0ea5e9','#8b5cf6','#06b6d4'];
          const realLeads = rows.map((row, i) => {
            const name = row.user?.full_name ?? 'Unknown';
            const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            const score = Math.round(parseFloat(row.score ?? 0));
            const daysSince = row.last_order_at
              ? Math.floor((Date.now() - new Date(row.last_order_at).getTime()) / 86400000)
              : 99;

            return {
              id:            row.id,
              name,
              email:         row.user?.email ?? '',
              phone:         row.user?.phone ?? '—',
              initials,
              color:         COLORS[i % COLORS.length],
              score,
              tier:          row.tier ?? 'cold',
              spend:         Math.round(parseFloat(row.total_spent ?? 0)),
              lifetimeOrders:parseInt(row.total_orders ?? 0, 10),
              lastOrderDate: row.last_order_at ?? new Date().toISOString(),
              recency:       daysSince === 0 ? 'Today' : daysSince === 1 ? 'Yesterday' : `${daysSince}d ago`,
              trend:         score >= 60 ? 'up' : score >= 40 ? 'stable' : 'down',
              segment:       row.tier === 'champion' ? 'Champion'
                           : row.tier === 'hot'      ? 'High Value'
                           : row.tier === 'warm'     ? 'Moderate'
                           : 'Low Engagement',
            };
          });
          setLeads(realLeads);
        } else {
          setLeads([]); // no data yet
        }
      } catch (e) {
        console.error('Lead scoring load error:', e.message);
        setLeads([]);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const handleReanalyze = async () => {
    setIsReanalyzing(true);
    try {
      await api.post('/leads/recalculate').catch(() => {});
      const res = await api.get('/leads?limit=100').catch(() => null);
      const rows = res?.data?.data?.leads ?? [];
      // re-run same mapping
      const COLORS = ['#2563eb','#7c3aed','#10b981','#f59e0b','#ef4444','#0ea5e9','#8b5cf6','#06b6d4'];
      setLeads(rows.map((row, i) => {
        const name = row.user?.full_name ?? 'Unknown';
        return {
          id: row.id,
          name, email: row.user?.email ?? '', phone: row.user?.phone ?? '—',
          initials: name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
          color: COLORS[i % COLORS.length],
          score: Math.round(parseFloat(row.score ?? 0)),
          tier: row.tier ?? 'cold',
          spend: Math.round(parseFloat(row.total_spent ?? 0)),
          lifetimeOrders: parseInt(row.total_orders ?? 0, 10),
          lastOrderDate: row.last_order_at ?? new Date().toISOString(),
          recency: (() => { const d = Math.floor((Date.now() - new Date(row.last_order_at ?? 0)) / 86400000); return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d}d ago`; })(),
          trend: parseFloat(row.score) >= 60 ? 'up' : parseFloat(row.score) >= 40 ? 'stable' : 'down',
          segment: row.tier === 'champion' ? 'Champion' : row.tier === 'hot' ? 'High Value' : row.tier === 'warm' ? 'Moderate' : 'Low Engagement',
        };
      }));
    } catch {}
    setIsReanalyzing(false);
  };

  const getSegmentCount = (seg) => {
    if (seg === 'All') return leads.length;
    if (seg === 'Hot') return leads.filter(l => l.score >= 80).length;
    if (seg === 'Warm') return leads.filter(l => l.score >= 50 && l.score < 80).length;
    if (seg === 'Cold') return leads.filter(l => l.score < 50).length;
    return 0;
  };

  const filteredLeads = useMemo(() => {
    let result = leads;
    if (activeSegment === 'Hot') result = result.filter(l => l.score >= 80);
    if (activeSegment === 'Warm') result = result.filter(l => l.score >= 50 && l.score < 80);
    if (activeSegment === 'Cold') result = result.filter(l => l.score < 50);

    return result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (sortField === 'date') {
        aVal = new Date(a.lastOrderDate).getTime();
        bVal = new Date(b.lastOrderDate).getTime();
      }
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [leads, activeSegment, sortField, sortOrder]);

  const handleSort = (field) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  };

  const segments = [
    { id: 'All', label: 'All', color: 'var(--navy)' },
    { id: 'Hot', label: 'Hot', color: '#10b981' },
    { id: 'Warm', label: 'Warm', color: '#f59e0b' },
    { id: 'Cold', label: 'Cold', color: '#64748b' }
  ];

  return (
    <div style={{ padding: '1.5rem', width: '100%', maxWidth: 1600, margin: '0 auto' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.6rem', color: 'var(--navy)', marginBottom: 2 }}>
            AI Lead Scoring
          </h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--gray-400)', fontWeight: 300, margin: 0 }}>
            AI-powered customer ranking based on purchase behavior & engagement
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 500, margin: 0, fontStyle: 'italic' }}>
            Last analyzed: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
          <motion.button whileHover={{ y: -2, boxShadow: 'var(--dash-shadow-hover)' }} whileTap={{ scale: 0.97 }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
            <Download size={14} /> Export CSV
          </motion.button>
          <motion.button whileHover={{ y: -2, boxShadow: 'var(--dash-shadow-hover)' }} whileTap={{ scale: 0.97 }} onClick={handleReanalyze} disabled={isReanalyzing} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 100, border: 'none', background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)', color: 'white', fontSize: '0.82rem', fontWeight: 600, cursor: isReanalyzing ? 'not-allowed' : 'pointer', opacity: isReanalyzing ? 0.8 : 1 }}>
            <Sparkles size={14} /> {isReanalyzing ? 'Analyzing...' : 'Re-analyze All'}
          </motion.button>
        </div>
      </div>

      {/* SEGMENT TABS & STATS ROW */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', padding: '1.25rem', border: '1px solid var(--dash-border)', boxShadow: 'var(--dash-shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem', color: 'var(--gray-400)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}><Users size={14}/> Total Customers</div>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--navy)', margin: 0 }}>{leads.length}</p>
          </div>
          <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', padding: '1.25rem', border: '1px solid var(--dash-border)', boxShadow: 'var(--dash-shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem', color: '#10b981', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}><Flame size={14}/> Hot Leads</div>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--navy)', margin: 0 }}>{getSegmentCount('Hot')}</p>
          </div>
          <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', padding: '1.25rem', border: '1px solid var(--dash-border)', boxShadow: 'var(--dash-shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem', color: 'var(--blue)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}><Activity size={14}/> Avg. Lead Score</div>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--navy)', margin: 0 }}>{leads.length > 0 ? Math.round(leads.reduce((s,l)=>s+l.score,0)/leads.length) : 0}</p>
          </div>
          <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', padding: '1.25rem', border: '1px solid var(--dash-border)', boxShadow: 'var(--dash-shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}><AlertTriangle size={14}/> At-Risk Customers</div>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--navy)', margin: 0 }}>{leads.filter(l=>l.score<30).length}</p>
          </div>
        </div>
      </div>

      {/* SCORE BREAKDOWN MODEL CARD */}
      <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', padding: '1.25rem', border: '1px solid var(--dash-border)', boxShadow: 'var(--dash-shadow)', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy)', margin: '0 0 0.25rem' }}>Score Breakdown Model</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', margin: '0 0 1rem' }}>How AI weights each behavioral signal</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
          {[
            { label: 'Purchase Frequency', weight: 30, color: '#3b82f6', desc: 'How often the customer places orders' },
            { label: 'Recency', weight: 25, color: '#10b981', desc: 'How recently they last ordered' },
            { label: 'Order Value', weight: 25, color: '#8b5cf6', desc: 'Average basket size vs. cohort' },
            { label: 'Engagement', weight: 20, color: '#f59e0b', desc: 'Chatbot interactions & app opens' }
          ].map(w => (
            <div key={w.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--navy)' }}>
                <span>{w.label}</span>
                <span style={{ color: w.color }}>{w.weight}%</span>
              </div>
              <div style={{ width: '100%', height: 6, background: 'var(--dash-bg)', borderRadius: 100, overflow: 'hidden', marginBottom: '0.25rem' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${w.weight}%` }} transition={{ duration: 1, ease: "easeOut" }} style={{ height: '100%', background: w.color, borderRadius: 100 }} />
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--gray-400)', margin: 0 }}>{w.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {segments.map(seg => (
          <button key={seg.id} onClick={() => setActiveSegment(seg.id)} style={{ padding: '0.4rem 1.25rem', borderRadius: 100, border: '1px solid', borderColor: activeSegment === seg.id ? seg.color : 'var(--dash-border)', background: activeSegment === seg.id ? seg.color : 'white', color: activeSegment === seg.id ? 'white' : 'var(--gray-600)', fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6 }}>
            {seg.label}
            <span style={{ background: activeSegment === seg.id ? 'rgba(255,255,255,0.2)' : 'var(--dash-bg)', color: activeSegment === seg.id ? 'white' : 'var(--navy)', padding: '2px 6px', borderRadius: 10, fontSize: '0.7rem' }}>{getSegmentCount(seg.id)}</span>
          </button>
        ))}
      </div>

      {/* TABLE */}
      <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', boxShadow: 'var(--dash-shadow)', overflow: 'hidden', position: 'relative' }}>
        
        {/* Re-analyze Overlay */}
        <AnimatePresence>
          {isReanalyzing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(2px)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 200, height: 4, background: 'var(--dash-bg)', borderRadius: 100, overflow: 'hidden', marginBottom: '1rem' }}>
                <motion.div animate={{ x: [-200, 200] }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, #2563eb, #7c3aed)', borderRadius: 100 }} />
              </div>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Running AI Analysis...</p>
            </motion.div>
          )}
        </AnimatePresence>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
              <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', width: 60, textAlign: 'center' }}>Rank</th>
              <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Customer</th>
              <th onClick={() => handleSort('score')} style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Score {sortField === 'score' ? (sortOrder === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>) : null}</div>
              </th>
              <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Frequency</th>
              <th onClick={() => handleSort('date')} style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Last Order {sortField === 'date' ? (sortOrder === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>) : null}</div>
              </th>
              <th onClick={() => handleSort('spend')} style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Total Spend {sortField === 'spend' ? (sortOrder === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>) : null}</div>
              </th>
              <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Trend</th>
              <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} style={{ padding: '1rem' }}>
                      <div style={{ height: 20, background: 'var(--dash-bg)', borderRadius: 4, opacity: 0.5 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                  <Users size={48} color="var(--gray-200)" strokeWidth={1} style={{ marginBottom: '1rem', margin: '0 auto' }} />
                  <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--gray-400)', fontSize: '1.2rem', margin: '0.5rem 0' }}>No customers in this segment</p>
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead, index) => {
                const rank = sortField === 'score' && sortOrder === 'desc' && activeSegment === 'All' ? index + 1 : '-';
                return (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
                    key={lead.id} onClick={() => setSelectedCustomer(lead)}
                    style={{ borderBottom: '1px solid var(--dash-border)', cursor: 'pointer' }}
                    className="rx-table-row"
                  >
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      {rank === 1 ? <span style={{ fontSize: '1.2rem' }}>🥇</span> : 
                       rank === 2 ? <span style={{ fontSize: '1.2rem' }}>🥈</span> : 
                       rank === 3 ? <span style={{ fontSize: '1.2rem' }}>🥉</span> : 
                       <span style={{ fontWeight: 700, color: 'var(--gray-400)' }}>#{rank}</span>}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: lead.color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>
                          {lead.initials}
                        </div>
                        <div>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: 'var(--navy)' }}>{lead.name}</p>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--gray-400)' }}>{lead.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <AnimatedRingTable score={lead.score} delay={index * 0.05} />
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--navy)', fontWeight: 500 }}>{lead.frequency}</p>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <p style={{ margin: 0, fontWeight: 500, fontSize: '0.85rem', color: 'var(--navy)' }}>{formatDate(lead.lastOrderDate)}</p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--gray-400)' }}>{lead.recency}</p>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)' }}>Rs. {lead.spend.toLocaleString()}</p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--gray-400)' }}>{lead.lifetimeOrders} orders</p>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', fontWeight: 600, color: lead.trend === 'up' ? '#10b981' : lead.trend === 'down' ? '#ef4444' : '#64748b' }}>
                        {lead.trend === 'up' ? <ArrowUp size={14} /> : lead.trend === 'down' ? <ArrowDown size={14} /> : <Minus size={14} />}
                        {lead.delta > 0 ? `+${lead.delta}` : lead.delta}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <motion.button whileHover={{ scale: 1.1, color: 'var(--blue)' }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); setSelectedCustomer(lead); }} style={{ background: 'transparent', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', padding: 4 }}>
                        <UserIcon size={18} />
                      </motion.button>
                    </td>
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
        
        {!isLoading && filteredLeads.length > 0 && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--dash-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>Showing 1–{filteredLeads.length} of {filteredLeads.length} customers</span>
          </div>
        )}
      </div>

      <CustomerProfileDrawer isOpen={!!selectedCustomer} onClose={() => setSelectedCustomer(null)} customer={selectedCustomer} />
    </div>
  );
}
