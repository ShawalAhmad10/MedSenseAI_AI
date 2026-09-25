import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, User, MessageCircle, Mail, Bell, Smartphone, FileText } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

/**
 * Implements Patient Communication Flow per MedSenseAI SRS Section 3.2.04.
 * Allows pharmacists to send templated and custom messages to patients.
 */
export default function MessagePatientModal({ isOpen, onClose, patient, context = 'order' }) {
  const { showToast } = useToast();
  const [template, setTemplate] = useState('');
  const [message, setMessage] = useState('');
  const [channels, setChannels] = useState({ inApp: true, email: false });
  const [isSending, setIsSending] = useState(false);

  const templates = {
    order: [
      { id: '1', name: 'Order Processing', text: `Hi ${patient?.name || 'Patient'}, your order for [Medicines] is currently being processed by MedSense AI.` },
      { id: '2', name: 'Ready for Pickup', text: `Hi ${patient?.name || 'Patient'}, your order is ready for pickup at our pharmacy.` }
    ],
    interaction: [
      { id: '3', name: 'Interaction Alert', text: `Hi ${patient?.name || 'Patient'}, our AI detected a potential interaction between your new prescription and your current history. We are consulting with your healthcare provider.` },
      { id: '4', name: 'Counseling Required', text: `Hi ${patient?.name || 'Patient'}, please visit the pharmacy for a brief consultation regarding your new medication.` }
    ],
    prescription_approved: [
      { id: '5', name: 'Rx Approved', text: `Hi ${patient?.name || 'Patient'}, your prescription review is complete and has been approved.` }
    ],
    prescription_rejected: [
      { id: '6', name: 'Rx Rejected', text: `Hi ${patient?.name || 'Patient'}, your prescription review was unsuccessful due to [Reason]. Please contact your healthcare provider.` }
    ]
  };

  const currentTemplates = templates[context] || templates.order;

  useEffect(() => {
    if (isOpen) {
      setTemplate('');
      setMessage('');
      setChannels({ inApp: true, email: false });
    }
  }, [isOpen]);

  const handleTemplateSelect = (e) => {
    const selected = currentTemplates.find(t => t.id === e.target.value);
    setTemplate(e.target.value);
    if (selected) setMessage(selected.text);
  };

  const handleSend = () => {
    if (!message.trim() || (!channels.inApp && !channels.email)) return;
    
    setIsSending(true);
    setTimeout(() => {
      showToast({ type: 'success', message: 'Message sent successfully' });
      setIsSending(false);
      onClose();
    }, 1000);
  };

  if (!patient) return null;

  const isInvalid = !message.trim() || (!channels.inApp && !channels.email);

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'absolute', inset: 0, background: 'rgba(13, 17, 23, 0.4)', backdropFilter: 'blur(4px)' }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            style={{
              position: 'relative', width: '100%', maxWidth: 500,
              background: 'white', borderRadius: 'var(--dash-radius)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.15)', overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageCircle size={18} color="var(--blue)" />
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Message Patient</h3>
               </div>
               <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)' }}>
                 <X size={20} />
               </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              {/* Patient Card */}
              <div style={{ background: 'var(--dash-bg)', padding: '1rem', borderRadius: 12, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                 <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    {patient.name.split(' ').map(n => n[0]).join('')}
                 </div>
                 <div>
                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>{patient.name}</p>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--gray-400)' }}>ID: {patient.id} &middot; {patient.phone}</p>
                 </div>
              </div>

              {/* Template Select */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>Choose Template</label>
                <select 
                  value={template} 
                  onChange={handleTemplateSelect}
                  style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: 10, border: '1.5px solid var(--dash-border)', outline: 'none', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}
                >
                  <option value="">Custom Message...</option>
                  {currentTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              {/* Message Textarea */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                   <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)' }}>Message Body</label>
                   <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>{message.length}/1000</span>
                </div>
                <textarea 
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                  placeholder="Type your message here..."
                  style={{ width: '100%', minHeight: 120, padding: '1rem', borderRadius: 12, border: '1.5px solid var(--dash-border)', outline: 'none', fontFamily: 'var(--font-body)', fontSize: '0.88rem', resize: 'none' }}
                />
              </div>

              {/* Delivery Channels */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.75rem' }}>Delivery Channels</label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                   {[
                     { id: 'inApp', label: 'In-App Notification', icon: Bell },
                     { id: 'email', label: 'Email', icon: Mail }
                   ].map(ch => (
                     <motion.div 
                       key={ch.id}
                       whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                       onClick={() => setChannels(prev => ({ ...prev, [ch.id]: !prev[ch.id] }))}
                       style={{ 
                         flex: 1, padding: '0.65rem', borderRadius: 10, border: '1.5px solid',
                         borderColor: channels[ch.id] ? 'var(--blue)' : 'var(--dash-border)',
                         background: channels[ch.id] ? 'var(--blue-light)' : 'white',
                         color: channels[ch.id] ? 'var(--blue)' : 'var(--gray-400)',
                         display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                         transition: 'all 0.2s'
                       }}
                     >
                       <ch.icon size={16} />
                       <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{ch.label}</span>
                     </motion.div>
                   ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--dash-border)', background: 'var(--dash-bg)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
               <button onClick={onClose} style={{ padding: '0.6rem 1.25rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--gray-600)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                 Cancel
               </button>
               <motion.button
                 whileHover={!isInvalid ? { scale: 1.02 } : {}}
                 whileTap={!isInvalid ? { scale: 0.98 } : {}}
                 disabled={isInvalid || isSending}
                 onClick={handleSend}
                 style={{ 
                    padding: '0.6rem 1.5rem', borderRadius: 100, border: 'none', background: 'var(--blue)', color: 'white', 
                    fontSize: '0.85rem', fontWeight: 600, cursor: isInvalid ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8, opacity: isInvalid || isSending ? 0.6 : 1
                 }}
               >
                 <Send size={16} />
                 {isSending ? 'Sending...' : 'Send Message'}
               </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
