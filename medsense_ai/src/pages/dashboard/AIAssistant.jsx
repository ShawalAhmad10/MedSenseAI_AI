// src/pages/dashboard/AIAssistant.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Loader2, Table, BarChart3, AlertTriangle, RefreshCcw } from 'lucide-react';

const MESSAGE_TYPES = {
  TEXT: 'text',
  TABLE: 'table',
  CHART: 'chart',
  ALERTS: 'alerts',
  REFILLS: 'refills'
};

const THINKING_DELAYS = {
  [MESSAGE_TYPES.TEXT]: 800,
  [MESSAGE_TYPES.TABLE]: 1000,
  [MESSAGE_TYPES.CHART]: 1200,
  [MESSAGE_TYPES.ALERTS]: 900,
  [MESSAGE_TYPES.REFILLS]: 1100
};

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    { id: 1, role: 'assistant', type: MESSAGE_TYPES.TEXT, content: "Hello! I'm your pharmacy AI assistant. How can I help you today?" }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingType, setThinkingType] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;

    const userMessage = { id: Date.now(), role: 'user', type: MESSAGE_TYPES.TEXT, content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Determine response type based on input (simple keywords for demo)
    let responseType = MESSAGE_TYPES.TEXT;
    if (input.toLowerCase().includes('table') || input.toLowerCase().includes('data')) responseType = MESSAGE_TYPES.TABLE;
    else if (input.toLowerCase().includes('chart') || input.toLowerCase().includes('graph')) responseType = MESSAGE_TYPES.CHART;
    else if (input.toLowerCase().includes('alert')) responseType = MESSAGE_TYPES.ALERTS;
    else if (input.toLowerCase().includes('refill')) responseType = MESSAGE_TYPES.REFILLS;

    setIsThinking(true);
    setThinkingType(responseType);

    // Simulate thinking delay
    await new Promise(resolve => setTimeout(resolve, THINKING_DELAYS[responseType]));

    const assistantMessage = {
      id: Date.now() + 1,
      role: 'assistant',
      type: responseType,
      content: getMockContent(responseType)
    };

    setMessages(prev => [...prev, assistantMessage]);
    setIsThinking(false);
    setThinkingType(null);
  };

  const getMockContent = (type) => {
    switch (type) {
      case MESSAGE_TYPES.TABLE:
        return [
          { item: 'Panadol', stock: 120, status: 'Healthy' },
          { item: 'Amoxicillin', stock: 15, status: 'Low' },
          { item: 'ORS', stock: 45, status: 'Reorder' }
        ];
      case MESSAGE_TYPES.CHART:
        return [
          { day: 'Mon', sales: 4200 },
          { day: 'Tue', sales: 5100 },
          { day: 'Wed', sales: 4800 }
        ];
      case MESSAGE_TYPES.ALERTS:
        return [
          { id: 1, severity: 'high', msg: 'Zinc Sulphate expiring soon' },
          { id: 2, severity: 'med', msg: 'Vitamin D stock low' }
        ];
      case MESSAGE_TYPES.REFILLS:
        return [
          { name: 'Amna Rana', medicine: 'Metformin' },
          { name: 'Zainab Ali', medicine: 'Panadol' }
        ];
      default:
        return "I've analyzed your pharmacy data and everything looks optimal for today. Your current inventory levels are stable except for a few low-stock items.";
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ padding: '1.5rem 0' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--navy)', margin: 0 }}>
          Pharmacy AI Assistant
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--gray-400)', margin: '4px 0 0 0' }}>
          Ask about inventory, sales trends, or customer refills
        </p>
      </div>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        style={{ 
          flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem',
          background: 'white', borderRadius: '20px', border: '1px solid var(--dash-border)', marginBottom: '1.5rem'
        }}
        className="no-scrollbar"
      >
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                display: 'flex',
                gap: '12px',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
              }}
            >
              <div style={{ 
                width: 36, height: 36, borderRadius: '50%', background: msg.role === 'user' ? 'var(--blue)' : 'var(--dash-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                {msg.role === 'user' ? <User size={18} color="white" /> : <Bot size={18} color="var(--blue)" />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{
                  padding: '1rem',
                  borderRadius: msg.role === 'user' ? '20px 4px 20px 20px' : '4px 20px 20px 20px',
                  background: msg.role === 'user' ? 'var(--blue)' : 'var(--dash-bg)',
                  color: msg.role === 'user' ? 'white' : 'var(--navy)',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  boxShadow: msg.role === 'user' ? '0 4px 12px rgba(37,99,235,0.2)' : 'none'
                }}>
                  {renderMessageContent(msg)}
                </div>
              </div>
            </motion.div>
          ))}
          {isThinking && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ alignSelf: 'flex-start', display: 'flex', gap: '12px' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--dash-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={18} color="var(--blue)" />
              </div>
              <div style={{ padding: '0.75rem 1.25rem', background: 'var(--dash-bg)', borderRadius: '4px 20px 20px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={16} className="animate-spin" color="var(--gray-400)" />
                <span style={{ fontSize: '0.8rem', color: 'var(--gray-400)', fontWeight: 500 }}>
                  Thinking ({thinkingType})...
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
        <input 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask me anything... (e.g., 'show inventory table', 'sales chart', 'alerts')"
          style={{
            width: '100%', padding: '1.25rem 4rem 1.25rem 1.5rem', borderRadius: '100px',
            border: '2px solid var(--dash-border)', outline: 'none', fontSize: '1rem',
            fontFamily: 'var(--font-body)', transition: 'all 0.2s', background: 'white'
          }}
          className="chat-input"
        />
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleSend}
          disabled={!input.trim() || isThinking}
          style={{
            position: 'absolute', right: '8px', top: '8px', width: '48px', height: '48px',
            borderRadius: '50%', background: 'var(--navy)', color: 'white', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            opacity: !input.trim() || isThinking ? 0.5 : 1
          }}
        >
          <Send size={20} />
        </motion.button>
      </div>

      <style>{`
        .chat-input:focus { border-color: var(--blue); box-shadow: 0 0 0 4px rgba(37,99,235,0.1); }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function renderMessageContent(msg) {
  switch (msg.type) {
    case MESSAGE_TYPES.TABLE:
      return (
        <div style={{ minWidth: '300px' }}>
          <p style={{ marginBottom: '10px', fontWeight: 600 }}>Inventory Breakdown:</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                <th style={{ textAlign: 'left', padding: '4px' }}>Item</th>
                <th style={{ textAlign: 'center', padding: '4px' }}>Stock</th>
                <th style={{ textAlign: 'right', padding: '4px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {msg.content.map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px' }}>{row.item}</td>
                  <td style={{ textAlign: 'center', padding: '4px' }}>{row.stock}</td>
                  <td style={{ textAlign: 'right', padding: '4px', color: row.status === 'Healthy' ? 'var(--green)' : 'var(--red)' }}>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case MESSAGE_TYPES.CHART:
      return (
        <div style={{ minWidth: '300px' }}>
          <p style={{ marginBottom: '10px', fontWeight: 600 }}>Sales Performance:</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '100px', paddingTop: '10px' }}>
            {msg.content.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '100%', background: 'var(--blue)', height: `${(d.sales / 5100) * 80}px`, borderRadius: '4px' }} />
                <span style={{ fontSize: '0.65rem' }}>{d.day}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case MESSAGE_TYPES.ALERTS:
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '240px' }}>
          <p style={{ fontWeight: 600 }}>Critical Alerts Found:</p>
          {msg.content.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px' }}>
              <AlertTriangle size={14} color={a.severity === 'high' ? 'var(--red)' : 'var(--amber)'} />
              <span style={{ fontSize: '0.8rem' }}>{a.msg}</span>
            </div>
          ))}
        </div>
      );
    case MESSAGE_TYPES.REFILLS:
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '240px' }}>
          <p style={{ fontWeight: 600 }}>Upcoming Refills:</p>
          {msg.content.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>{r.name[0]}</div>
              <span style={{ fontSize: '0.8rem' }}>{r.name} - {r.medicine}</span>
            </div>
          ))}
        </div>
      );
    default:
      return msg.content;
  }
}
