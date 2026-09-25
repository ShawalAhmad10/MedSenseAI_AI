import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, Video, Laptop, CheckCircle2, ArrowRight, User, Mail, Building2, Phone } from 'lucide-react';

/**
 * Implements Demo Booking Flow for MedSenseAI.
 * Personalized scheduling with interactive success state.
 */
export default function BookDemoModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    name: '', email: '', pharmacy: '', phone: '', date: '', time: '', source: ''
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const times = ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'];

  const handleInputChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitted(true);
      setIsSubmitting(false);
    }, 1200);
  };

  const isInvalid = !formData.name || !formData.email || !formData.pharmacy || !formData.phone || !formData.date || !formData.time;

  const inputStyle = {
    width: '100%', padding: '0.65rem 1rem', borderRadius: 10, border: '1.5px solid var(--dash-border)',
    outline: 'none', fontFamily: 'var(--font-body)', fontSize: '0.85rem'
  };

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
              position: 'relative', width: '100%', maxWidth: 550,
              background: 'white', borderRadius: 'var(--dash-radius)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.15)', overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
               <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Book a MedSense AI Demo</h3>
               <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)' }}>
                 <X size={20} />
               </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <AnimatePresence mode="wait">
                {!isSubmitted ? (
                  <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {/* Value Props */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                       {[
                         { icon: Video, label: 'Live Walkthrough' },
                         { icon: Laptop, label: 'Custom Sandbox' },
                         { icon: CheckCircle2, label: 'Free Trial Setup' }
                       ].map((p, i) => (
                         <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--dash-bg)', borderRadius: 100, fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-600)' }}>
                            <p.icon size={12} color="var(--blue)" />
                            {p.label}
                         </div>
                       ))}
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                       <div style={{ gridColumn: 'span 2' }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.4rem' }}>Full Name *</label>
                          <div style={{ position: 'relative' }}>
                             <User size={14} color="var(--gray-400)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                             <input name="name" value={formData.name} onChange={handleInputChange} placeholder="Sarah Ahmed" style={{ ...inputStyle, paddingLeft: '2.5rem' }} />
                          </div>
                       </div>
                       <div style={{ gridColumn: 'span 2' }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.4rem' }}>Email Address *</label>
                          <div style={{ position: 'relative' }}>
                             <Mail size={14} color="var(--gray-400)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                             <input name="email" type="email" value={formData.email} onChange={handleInputChange} placeholder="sarah@pharmacy.com" style={{ ...inputStyle, paddingLeft: '2.5rem' }} />
                          </div>
                       </div>
                       <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.4rem' }}>Pharmacy Name *</label>
                          <div style={{ position: 'relative' }}>
                             <Building2 size={14} color="var(--gray-400)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                             <input name="pharmacy" value={formData.pharmacy} onChange={handleInputChange} placeholder="MedLife Pharmacy" style={{ ...inputStyle, paddingLeft: '2.5rem' }} />
                          </div>
                       </div>
                       <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.4rem' }}>Phone Number *</label>
                          <div style={{ position: 'relative' }}>
                             <Phone size={14} color="var(--gray-400)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                             <input name="phone" value={formData.phone} onChange={handleInputChange} placeholder="+92 3XX XXXXXXX" style={{ ...inputStyle, paddingLeft: '2.5rem' }} />
                          </div>
                       </div>
                       <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.4rem' }}>Preferred Date *</label>
                          <div style={{ position: 'relative' }}>
                             <Calendar size={14} color="var(--gray-400)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                             <input name="date" type="date" min={new Date().toISOString().split('T')[0]} value={formData.date} onChange={handleInputChange} style={{ ...inputStyle, paddingLeft: '2.5rem' }} />
                          </div>
                       </div>
                       <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.4rem' }}>Preferred Time *</label>
                          <div style={{ position: 'relative' }}>
                             <Clock size={14} color="var(--gray-400)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                             <select name="time" value={formData.time} onChange={handleInputChange} style={{ ...inputStyle, paddingLeft: '2.5rem' }}>
                                <option value="">Select Time</option>
                                {times.map(t => <option key={t} value={t}>{t}</option>)}
                             </select>
                          </div>
                       </div>
                    </form>
                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
                       <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                       <motion.button 
                          whileHover={!isInvalid ? { scale: 1.02 } : {}} whileTap={!isInvalid ? { scale: 0.98 } : {}}
                          disabled={isInvalid || isSubmitting}
                          onClick={handleSubmit}
                          style={{ flex: 1.5, padding: '0.75rem', borderRadius: 100, border: 'none', background: 'var(--navy)', color: 'white', fontSize: '0.85rem', fontWeight: 700, cursor: isInvalid ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isInvalid || isSubmitting ? 0.6 : 1 }}
                       >
                          {isSubmitting ? 'Booking...' : 'Confirm Demo'}
                          <ArrowRight size={16} />
                       </motion.button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                     <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                        <CheckCircle2 size={32} color="var(--green)" />
                     </div>
                     <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.4rem', color: 'var(--navy)', margin: '0 0 0.5rem 0' }}>Your demo is booked!</h3>
                     <p style={{ fontSize: '0.9rem', color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                        Hi {formData.name}, we've scheduled your live walkthrough for <strong>{new Date(formData.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</strong> at <strong>{formData.time}</strong>.
                     </p>
                     <div style={{ background: 'var(--dash-bg)', padding: '1rem', borderRadius: 12, marginBottom: '2rem' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--gray-400)' }}>A confirmation email with the video link has been sent to</p>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy)' }}>{formData.email}</p>
                     </div>
                     <motion.button 
                        whileHover={{ background: 'var(--dash-bg)' }} whileTap={{ scale: 0.98 }}
                        onClick={onClose}
                        style={{ width: '100%', padding: '0.85rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
                     >
                        Close
                     </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
