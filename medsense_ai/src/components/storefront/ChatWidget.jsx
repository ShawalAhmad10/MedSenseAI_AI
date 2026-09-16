// SRS §3.2.5: User-facing medication chatbot with quick replies and escalation guidance.
import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Send, ShieldAlert, X } from 'lucide-react';
import { chatQuickReplies } from '../../services/storefrontData';

const botReplies = {
  'Do I need a prescription?': 'Prescription medicines will show an Rx tag and we will prompt you to upload a valid prescription before dispatch.',
  'When will my order arrive?': 'Fast-moving items can usually be dispatched the same day. Track live status from the Orders page.',
  'Suggest an alternative': 'On each product page and checkout review we show suggested alternatives and pharmacist-reviewed substitutes.',
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [thread, setThread] = useState([
    {
      role: 'bot',
      text: 'Hi, I can help with product questions, delivery, alternatives, and prescription upload guidance.',
    },
  ]);

  const pushBotReply = (content) => {
    setTimeout(() => {
      setThread((current) => [...current, { role: 'bot', text: content }]);
    }, 220);
  };

  const handleSend = (content) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    setThread((current) => [...current, { role: 'user', text: trimmed }]);
    setMessage('');
    pushBotReply(botReplies[trimmed] || 'Mock assistant reply: we can wire this to the real storefront support API next.');
  };

  return (
    <div className="sf-chat-launcher">
      <AnimatePresence>
        {open && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="sf-card sf-chat-window"
            exit={{ opacity: 0, y: 12 }}
            initial={{ opacity: 0, y: 12 }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                padding: '1rem 1.1rem',
                background: 'linear-gradient(135deg, var(--sf-secondary), var(--sf-primary))',
                color: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
              }}
            >
              <div>
                <strong style={{ display: 'block' }}>Care Assistant</strong>
                <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.78)' }}>
                  Mock chatbot with escalation path
                </span>
              </div>
              <button className="sf-button-ghost" onClick={() => setOpen(false)} style={{ color: 'white' }} type="button">
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '1rem', display: 'grid', gap: '0.8rem', maxHeight: 320, overflowY: 'auto' }}>
              <div className="sf-badge-warning">
                <ShieldAlert size={14} />
                If symptoms are severe, contact a clinician immediately.
              </div>
              {thread.map((entry, index) => (
                <div
                  key={`${entry.role}-${index}`}
                  style={{
                    justifySelf: entry.role === 'user' ? 'end' : 'start',
                    maxWidth: '88%',
                    background: entry.role === 'user' ? 'var(--sf-primary-soft)' : 'var(--sf-surface-alt)',
                    borderRadius: 18,
                    padding: '0.8rem 0.9rem',
                    lineHeight: 1.6,
                  }}
                >
                  {entry.text}
                </div>
              ))}
            </div>
            <div style={{ padding: '0 1rem 1rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {chatQuickReplies.map((reply) => (
                  <button className="sf-button-secondary" key={reply} onClick={() => handleSend(reply)} style={{ padding: '0.55rem 0.8rem' }} type="button">
                    {reply}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.55rem' }}>
                <input
                  className="sf-input"
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Ask a storefront question"
                  value={message}
                />
                <button className="sf-icon-button" onClick={() => handleSend(message)} type="button">
                  <Send size={17} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button className="sf-icon-button" onClick={() => setOpen((current) => !current)} style={{ width: 60, height: 60, boxShadow: 'var(--sf-shadow-hover)' }} type="button">
        <MessageCircle size={24} />
      </button>
    </div>
  );
}
