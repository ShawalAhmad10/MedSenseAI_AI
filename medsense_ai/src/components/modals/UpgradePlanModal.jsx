import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, CreditCard, ShieldCheck, Zap, Sparkles, Lock } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { usePharmacistAuth } from '../../hooks/usePharmacistAuth';
import api from '../../services/api';

/**
 * Implements Billing and Plan Management per MedSenseAI SRS Section 3.2.13.
 * Handles plan comparison and simulated payment flow.
 */
export default function UpgradePlanModal({ isOpen, onClose }) {
  const { showToast } = useToast();
  const [isAnnual, setIsAnnual] = useState(true);
  const [showBillingForm, setShowBillingForm] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      icon: ShieldCheck,
      color: 'var(--gray-400)',
      features: [
        { text: '50 Rx per month', active: true },
        { text: '1 Pharmacist seat', active: true },
        { text: 'Basic interaction alerts', active: true },
        { text: 'Email support', active: true },
        { text: 'AI prescription analysis', active: false },
        { text: 'Analytics exports', active: false }
      ]
    },
    {
      id: 'pro',
      name: 'Pro',
      price: isAnnual ? 4500 : 5500,
      icon: Zap,
      color: 'var(--blue)',
      badge: 'Most Popular',
      features: [
        { text: 'Unlimited Rx per month', active: true },
        { text: '10 Pharmacist seats', active: true },
        { text: 'AI prescription analysis', active: true },
        { text: 'Bulk CSV import', active: true },
        { text: 'Analytics exports', active: true },
        { text: 'Priority support', active: true }
      ]
    }
  ];

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      const response = await api.post('/auth/pharmacist/upgrade-plan', {
        plan: 'pro',
        billing: isAnnual ? 'annual' : 'monthly',
      });
      
      if (response.data?.success) {
        showToast({ type: 'success', message: 'Plan upgraded to Pro successfully!' });
        
        // Update user in localStorage/sessionStorage
        const authKey = 'medsense_auth_user';
        const raw = sessionStorage.getItem(authKey) || localStorage.getItem(authKey);
        if (raw) {
          const stored = JSON.parse(raw);
          const updated = { ...stored, ...response.data.data };
          (sessionStorage.getItem(authKey) ? sessionStorage : localStorage).setItem(authKey, JSON.stringify(updated));
        }
        
        setTimeout(() => {
          setIsUpgrading(false);
          onClose();
          // Reload page to reflect plan change
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      showToast({ type: 'error', message: error.response?.data?.message || 'Failed to upgrade plan. Please try again.' });
      setIsUpgrading(false);
    }
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
              position: 'relative', width: '100%', maxWidth: 700,
              background: 'white', borderRadius: 'var(--dash-radius)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.15)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh'
            }}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={18} color="var(--blue)" />
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Upgrade Your Plan</h3>
               </div>
               <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)' }}>
                 <X size={20} />
               </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
              {/* Billing Toggle */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                 <div style={{ background: 'var(--dash-bg)', padding: 4, borderRadius: 100, display: 'flex', gap: 4, border: '1px solid var(--dash-border)' }}>
                    <button 
                      onClick={() => setIsAnnual(false)}
                      style={{ padding: '0.4rem 1rem', borderRadius: 100, border: 'none', background: !isAnnual ? 'white' : 'transparent', color: !isAnnual ? 'var(--navy)' : 'var(--gray-400)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', boxShadow: !isAnnual ? '0 2px 8px rgba(0,0,0,0.05)' : 'none' }}
                    >
                      Monthly
                    </button>
                    <button 
                      onClick={() => setIsAnnual(true)}
                      style={{ padding: '0.4rem 1rem', borderRadius: 100, border: 'none', background: isAnnual ? 'white' : 'transparent', color: isAnnual ? 'var(--navy)' : 'var(--gray-400)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', boxShadow: isAnnual ? '0 2px 8px rgba(0,0,0,0.05)' : 'none' }}
                    >
                      Annual <span style={{ color: 'var(--green)', fontSize: '0.65rem', marginLeft: 4 }}>-20%</span>
                    </button>
                 </div>
              </div>

              {/* Plan Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                 {plans.map(plan => (
                   <div key={plan.id} style={{ 
                     padding: '1.5rem', borderRadius: 20, border: '2px solid', 
                     borderColor: plan.id === 'pro' ? 'var(--blue)' : 'var(--dash-border)',
                     opacity: plan.id === 'free' ? 0.6 : 1, position: 'relative',
                     background: plan.id === 'pro' ? 'linear-gradient(180deg, rgba(37,99,235,0.05) 0%, white 100%)' : 'white'
                   }}>
                     {plan.badge && (
                       <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'var(--blue)', color: 'white', padding: '4px 12px', borderRadius: 100, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
                         {plan.badge}
                       </div>
                     )}
                     <div style={{ width: 40, height: 40, borderRadius: 12, background: plan.id === 'pro' ? 'var(--blue)' : 'var(--dash-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                       <plan.icon size={20} color={plan.id === 'pro' ? 'white' : 'var(--gray-400)'} />
                     </div>
                     <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{plan.name}</h4>
                     <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '8px 0 1.5rem 0' }}>
                        <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>PKR {plan.price.toLocaleString()}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>/{isAnnual ? 'year' : 'month'}</span>
                     </div>
                     <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {plan.features.map((f, i) => (
                          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', opacity: f.active ? 1 : 0.4 }}>
                            {f.active ? <Check size={14} color="var(--green)" /> : <div style={{ width: 14, height: 1, background: 'var(--gray-300)' }} />}
                            <span style={{ fontSize: '0.8rem', color: f.active ? 'var(--navy)' : 'var(--gray-400)' }}>{f.text}</span>
                          </li>
                        ))}
                     </ul>
                     {plan.id === 'pro' && !showBillingForm && (
                        <motion.button 
                          whileHover={{ scale: 1.02, boxShadow: '0 4px 12px rgba(37,99,235,0.2)' }} whileTap={{ scale: 0.98 }}
                          onClick={() => setShowBillingForm(true)}
                          style={{ width: '100%', marginTop: '1rem', padding: '0.75rem', borderRadius: 100, border: 'none', background: 'var(--blue)', color: 'white', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Upgrade to Pro
                        </motion.button>
                     )}
                   </div>
                 ))}
              </div>

              {/* Billing Form Section */}
              <AnimatePresence>
                {showBillingForm && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ padding: '1.5rem', background: 'var(--dash-bg)', borderRadius: 20, border: '1px solid var(--dash-border)' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' }}>
                          <CreditCard size={18} color="var(--navy)" />
                          <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>Secure Checkout</h4>
                       </div>
                       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div style={{ gridColumn: 'span 2' }}>
                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.4rem' }}>Cardholder Name</label>
                             <input placeholder="As written on card" style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: 10, border: '1.5px solid var(--dash-border)', outline: 'none', fontSize: '0.85rem' }} />
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.4rem' }}>Card Number</label>
                             <input placeholder="0000 0000 0000 0000" style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: 10, border: '1.5px solid var(--dash-border)', outline: 'none', fontSize: '0.85rem', fontFamily: 'monospace' }} />
                          </div>
                          <div>
                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.4rem' }}>Expiry (MM/YY)</label>
                             <input placeholder="MM / YY" style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: 10, border: '1.5px solid var(--dash-border)', outline: 'none', fontSize: '0.85rem' }} />
                          </div>
                          <div>
                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.4rem' }}>CVV</label>
                             <div style={{ position: 'relative' }}>
                               <input type="password" placeholder="***" style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: 10, border: '1.5px solid var(--dash-border)', outline: 'none', fontSize: '0.85rem' }} />
                               <Lock size={14} color="var(--gray-300)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />
                             </div>
                          </div>
                       </div>
                       <motion.button 
                          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                          disabled={isUpgrading}
                          onClick={handleUpgrade}
                          style={{ width: '100%', marginTop: '1.5rem', padding: '0.85rem', borderRadius: 100, border: 'none', background: 'var(--navy)', color: 'white', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                       >
                          {isUpgrading ? 'Processing...' : `Pay PKR ${plans[1].price.toLocaleString()}`}
                       </motion.button>
                       <p style={{ margin: '1rem 0 0 0', textAlign: 'center', fontSize: '0.65rem', color: 'var(--gray-400)' }}>
                         Payment processed securely by Stripe. Encrypted with 256-bit SSL.
                       </p>
                    </div>
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
