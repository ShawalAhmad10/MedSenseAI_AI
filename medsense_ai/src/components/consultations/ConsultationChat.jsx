// src/components/consultations/ConsultationChat.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, Share2, MoreHorizontal, Send, Zap, 
  Paperclip, ChevronDown, ChevronUp, Bot, Star, X
} from 'lucide-react';
import { chatHistory, cannedResponses } from '../../utils/consultationData';

export default function ConsultationChat({ patient, onResolve, onToggleQueue, isTablet, isProfileOpen, onToggleProfile }) {
  const [messages, setMessages] = useState(chatHistory[patient.id] || []);
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);
  const [waitTime, setWaitTime] = useState(Math.floor((Date.now() - new Date(patient.waitStart)) / 1000));
  const scrollRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setWaitTime(Math.floor((Date.now() - new Date(patient.waitStart)) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [patient.waitStart]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, showHistory]);

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    return `${mins}m ${s % 60}s`;
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const newMsg = {
      id: Date.now(),
      role: 'pharmacist',
      text: input,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages([...messages, newMsg]);
    setInput('');
  };

  const insertCanned = (text) => {
    setInput(text);
    setShowCanned(false);
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white', position: 'relative', minWidth: 0, height: '100%' }}>
      {/* HEADER (Redesigned) */}
      <div style={{ borderBottom: '1px solid var(--dash-border)', background: 'white', height: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'center', flexShrink: 0 }}>
        {/* Row 1: Name and Actions */}
        <div style={{ padding: '0 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isTablet && (
              <button onClick={onToggleQueue} style={{ background: 'var(--dash-bg)', border: '1px solid var(--dash-border)', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--navy)', cursor: 'pointer' }}>Queue</button>
            )}
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--navy)', margin: 0 }}>{patient.name}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              onClick={onToggleProfile}
              style={{ background: 'white', border: '1px solid var(--dash-border)', color: 'var(--gray-600)', padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              {isProfileOpen ? 'Close Profile' : 'View Profile'}
            </button>
            <button style={{ background: 'white', border: '1px solid var(--dash-border)', borderRadius: '8px', padding: '8px', cursor: 'pointer' }}><Share2 size={16} color="var(--gray-600)" /></button>
            <button style={{ background: 'white', border: '1px solid var(--dash-border)', borderRadius: '8px', padding: '8px', cursor: 'pointer' }}><MoreHorizontal size={16} color="var(--gray-600)" /></button>
            <button 
              onClick={() => setShowResolveConfirm(true)}
              style={{ background: 'var(--green)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <CheckCircle size={18} /> Mark Resolved
            </button>
          </div>
        </div>
        
        {/* Row 2: Badges and Context */}
        <div style={{ padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', padding: '1px 8px', borderRadius: '4px', fontWeight: 500, ...getUrgencyBadgeStyles(patient.urgency) }}>
            {patient.urgency.toUpperCase()}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--dash-bg)', padding: '1px 8px', borderRadius: '4px' }}>
            Waiting {formatTime(waitTime)}
          </span>
          <span style={{ color: 'var(--gray-200)', margin: '0 4px' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--gray-600)', minWidth: 0 }}>
            <span style={{ color: 'var(--gray-400)', fontWeight: 500 }}>AI Context:</span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 400 }}>
              {patient.handoff.summary}
            </span>
          </div>
        </div>
      </div>

      {/* MESSAGE AREA */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#fafbfc' }} className="no-scrollbar">
        {/* AI Handoff Summary Card (Redesigned) */}
        <div style={{ 
          background: 'var(--severity-warning-bg)', border: '1px solid rgba(245, 158, 11, 0.1)', 
          borderLeft: '3px solid var(--severity-warning)', borderRadius: '12px', padding: '1.25rem', marginBottom: '2rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
            <Bot size={18} color="var(--severity-warning)" />
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>AI Handoff Summary</h4>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <SummaryItem label="Patient" value={patient.name} />
            <SummaryItem label="Query" value={patient.handoff.query} isQuery />
            <SummaryItem label="AI Confidence" value={patient.handoff.confidence} isConfidence />
            <SummaryItem label="Attempted" value={patient.handoff.attempted} />
          </div>
        </div>

        {/* System Timeline Marker */}
        <div style={{ textAlign: 'center', margin: '2rem 0', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--dash-border)', zIndex: 0 }} />
          <span style={{ position: 'relative', zIndex: 1, background: '#fafbfc', padding: '0 1rem', fontSize: '12px', color: 'var(--gray-400)', fontWeight: 400 }}>
            Session escalated by AI &middot; {formatTime(waitTime)} ago
          </span>
        </div>

        {/* Conversation History Toggle */}
        <button 
          onClick={() => setShowHistory(!showHistory)}
          style={{ width: '100%', marginBottom: '2rem', background: 'transparent', border: 'none', color: 'var(--blue)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
        >
          {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showHistory ? 'Hide interaction history' : `View AI interaction history (${messages.filter(m => m.id.toString().startsWith('m')).length} messages)`}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {messages.map((msg) => {
            const isAIHistory = msg.id.toString().startsWith('m');
            if (isAIHistory && !showHistory) return null;

            const isPharmacist = msg.role === 'pharmacist';
            const isAssistant = msg.role === 'assistant';

            return (
              <div key={msg.id} style={{ alignSelf: isPharmacist ? 'flex-end' : 'flex-start', maxWidth: '80%', display: 'flex', gap: '12px', flexDirection: isPharmacist ? 'row-reverse' : 'row' }}>
                <div style={{ 
                  width: 32, height: 32, borderRadius: '50%', 
                  background: isPharmacist ? 'var(--navy)' : isAssistant ? 'var(--blue-light)' : 'white', 
                  border: isAssistant || isPharmacist ? 'none' : '1px solid var(--dash-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  fontSize: '11px', fontWeight: 800, color: isPharmacist ? 'white' : 'var(--navy)'
                }}>
                  {isPharmacist ? 'YOU' : isAssistant ? <Bot size={16} color="var(--blue)" /> : patient.name[0]}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isPharmacist ? 'flex-end' : 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', fontSize: '12px' }}>
                     <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{isPharmacist ? 'You' : isAssistant ? 'AI Assistant' : patient.name}</span>
                     <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>{msg.time}</span>
                  </div>
                  <div style={{ 
                    padding: '12px 16px', borderRadius: isPharmacist ? '16px 16px 4px 16px' : '16px 16px 16px 4px', 
                    background: isPharmacist ? 'var(--blue)' : 'white', 
                    color: isPharmacist ? 'white' : 'var(--navy)', 
                    fontSize: '14px', lineHeight: 1.6,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)', 
                    border: '1px solid var(--dash-border)'
                  }}>
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MESSAGE COMPOSER (Redesigned) */}
      <div style={{ padding: '16px 1.5rem', borderTop: '1px solid var(--dash-border)', background: 'white', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'white', border: '1px solid var(--dash-border)', borderRadius: '12px', padding: '8px 12px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
             <button onClick={() => setShowCanned(!showCanned)} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', padding: '6px' }} title="Quick Reply"><Zap size={20} fill={showCanned ? 'var(--amber)' : 'none'} /></button>
             <button style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', padding: '6px' }} title="Attach File"><Paperclip size={20} /></button>
          </div>
          
          <textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="Type your response..."
            style={{ flex: 1, minHeight: '24px', maxHeight: '120px', padding: '8px 0', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', fontSize: '14px', color: 'var(--navy)' }}
          />

          <button 
            onClick={handleSend}
            disabled={!input.trim()}
            style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--blue)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: !input.trim() ? 0.5 : 1, flexShrink: 0, transition: 'all 0.2s' }}
          >
            <Send size={18} />
          </button>
        </div>

        {/* Canned Responses Popover */}
        <AnimatePresence>
          {showCanned && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              style={{ position: 'absolute', bottom: '80px', left: '1.5rem', right: '1.5rem', background: 'white', border: '1px solid var(--dash-border)', borderRadius: '16px', boxShadow: '0 -10px 40px rgba(0,0,0,0.1)', overflow: 'hidden', zIndex: 20 }}
            >
              <div style={{ padding: '0.75rem 1.25rem', background: 'var(--dash-bg)', fontSize: '12px', fontWeight: 700, color: 'var(--gray-500)', borderBottom: '1px solid var(--dash-border)' }}>QUICK RESPONSES</div>
              <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                {cannedResponses.map((res, i) => (
                  <button key={i} onClick={() => insertCanned(res)} style={{ width: '100%', padding: '0.85rem 1.25rem', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--dash-border)', fontSize: '14px', color: 'var(--navy)', cursor: 'pointer' }} onMouseEnter={(e) => e.target.style.background = 'var(--dash-bg)'} onMouseLeave={(e) => e.target.style.background = 'none'}>{res}</button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* RESOLVE CONFIRMATION OVERLAY (Unchanged) */}
      <AnimatePresence>
        {showResolveConfirm && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              style={{ width: '320px', background: 'white', border: '1px solid var(--dash-border)', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', padding: '2rem', textAlign: 'center' }}
            >
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--green-light)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <CheckCircle size={32} />
              </div>
              <h3 style={{ fontSize: '1.2rem', color: 'var(--navy)', margin: '0 0 0.5rem 0' }}>Resolve Consultation?</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--gray-400)', marginBottom: '1.5rem' }}>This will remove the patient from the queue and archive the session.</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setShowResolveConfirm(false); setIsResolving(true); }} style={{ flex: 1, padding: '0.75rem', background: 'var(--green)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}>Resolve</button>
                <button onClick={() => setShowResolveConfirm(false)} style={{ flex: 1, padding: '0.75rem', background: 'var(--dash-bg)', color: 'var(--gray-600)', border: 'none', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RESOLUTION PANEL (Slide up - Unchanged) */}
      <AnimatePresence>
        {isResolving && (
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            style={{ position: 'absolute', inset: 0, background: 'white', zIndex: 110, display: 'flex', flexDirection: 'column', padding: '2rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
               <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--navy)' }}>Resolution & Closing</h3>
               <button onClick={() => setIsResolving(false)} style={{ background: 'var(--dash-bg)', border: 'none', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}><X size={20} color="var(--gray-600)" /></button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', flex: 1 }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gray-600)', display: 'block', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Patient Satisfaction</label>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '2rem' }}>
                  {[1,2,3,4,5].map(s => <Star key={s} size={32} color="var(--amber)" fill={s <= 4 ? "var(--amber)" : "none"} style={{ cursor: 'pointer' }} />)}
                </div>
                
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gray-600)', display: 'block', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Final Resolution Note</label>
                <textarea placeholder="Summarize the outcome of this consultation..." style={{ width: '100%', height: '120px', padding: '1rem', borderRadius: '12px', border: '1px solid var(--dash-border)', outline: 'none', fontSize: '14px', lineHeight: 1.6, background: 'var(--dash-bg)' }} />
              </div>
              
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gray-600)', display: 'block', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Categorization Tags</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '2.5rem' }}>
                  {["Drug interaction", "Dosage question", "Prescription review", "Allergy concern", "Side effects", "General advice"].map(t => (
                    <span key={t} style={{ padding: '8px 16px', borderRadius: '100px', border: '1px solid var(--dash-border)', fontSize: '13px', fontWeight: 600, color: 'var(--gray-600)', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => {e.target.style.borderColor = 'var(--blue)'; e.target.style.color = 'var(--blue)'}} onMouseLeave={(e) => {e.target.style.borderColor = 'var(--dash-border)'; e.target.style.color = 'var(--gray-600)'}}>{t}</span>
                  ))}
                </div>
                
                <button 
                  onClick={() => onResolve(patient.id)}
                  style={{ width: '100%', padding: '1rem', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: '16px', fontWeight: 700, fontSize: '16px', cursor: 'pointer', boxShadow: '0 10px 20px rgba(13, 17, 23, 0.2)' }}
                >
                  Save & Close Consultation
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryItem({ label, value, isQuery, isConfidence }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <span style={{ width: '110px', fontSize: '12px', fontWeight: 500, color: 'var(--gray-400)', flexShrink: 0, paddingTop: '2px' }}>{label}</span>
      {isConfidence ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ 
            fontSize: '11px', padding: '1px 8px', borderRadius: '4px', fontWeight: 700,
            background: value > 80 ? 'var(--green-light)' : value > 50 ? 'var(--amber-light)' : 'var(--red-light)',
            color: value > 80 ? 'var(--green)' : value > 50 ? 'var(--amber)' : 'var(--red)',
            border: `1px solid ${value > 80 ? 'rgba(16, 185, 129, 0.2)' : value > 50 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
          }}>
            {value}%
          </span>
        </div>
      ) : isQuery ? (
        <span style={{ fontSize: '13px', color: 'var(--navy)', fontWeight: 400, fontStyle: 'italic', background: 'rgba(255,255,255,0.5)', padding: '2px 6px', borderRadius: '4px', border: '1px dashed var(--dash-border)' }}>
          "{value}"
        </span>
      ) : (
        <span style={{ fontSize: '13px', color: 'var(--navy)', fontWeight: 500 }}>{value}</span>
      )}
    </div>
  );
}

