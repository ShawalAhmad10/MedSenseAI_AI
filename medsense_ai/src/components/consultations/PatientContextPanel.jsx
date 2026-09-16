// src/components/consultations/PatientContextPanel.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Calendar, Activity, AlertCircle, 
  History, Pill, ExternalLink, ShoppingCart,
  ChevronDown, ChevronRight, Clock, Users, TrendingUp,
  Package, DollarSign, AlertTriangle
} from 'lucide-react';
import { patientContexts } from '../../utils/consultationData';

export default function PatientContextPanel({ patient, isOpen }) {
  const context = patientContexts[patient.id] || { allergies: [], medications: [], history: [], cart: [] };
  const [expandedSections, setExpandedSections] = useState(['overview', 'allergies', 'meds', 'pharmacy']);

  const toggleSection = (section) => {
    setExpandedSections(prev => 
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  if (!isOpen) return null;

  return (
    <div style={{ 
      width: '300px', minWidth: '300px', background: 'white', 
      borderLeft: '1px solid var(--dash-border)', display: 'flex', 
      flexDirection: 'column', height: '100%', overflowY: 'auto',
      zIndex: 20
    }} className="no-scrollbar">
      
      {/* PROFILE HEADER */}
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--dash-border)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ 
            width: '48px', height: '48px', borderRadius: '12px', 
            background: 'var(--dash-bg)', border: '1px solid var(--dash-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', fontWeight: 700, color: 'var(--blue)'
          }}>
            {patient.name[0]}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--navy)' }}>{patient.name}</h3>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--gray-400)', fontWeight: 400 }}>{patient.age}y &bull; {patient.gender}</p>
          </div>
        </div>
        <a href={`/patients/${patient.id}`} style={{ fontSize: '13px', color: 'var(--blue)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          View Full EMR <ExternalLink size={14} />
        </a>
      </div>

      {/* LIVE OVERVIEW */}
      <CollapsibleSection 
        title="Live Overview" 
        icon={Activity} 
        isOpen={expandedSections.includes('overview')}
        onToggle={() => toggleSection('overview')}
        accent="var(--blue)"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <StatCard label="Wait Time" value="12m" icon={Clock} color="var(--amber)" />
          <StatCard label="Queue Pos" value="#3" icon={Users} color="var(--blue)" />
          <StatCard label="Complexity" value="High" icon={TrendingUp} color="var(--red)" />
          <StatCard label="Last Visit" value="2w ago" icon={Calendar} color="var(--green)" />
        </div>
      </CollapsibleSection>

      {/* ALLERGIES */}
      <CollapsibleSection 
        title="Active Allergies" 
        icon={AlertCircle} 
        isOpen={expandedSections.includes('allergies')}
        onToggle={() => toggleSection('allergies')}
        accent="var(--red)"
        count={context.allergies.length}
      >
        {context.allergies.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {context.allergies.map((allergy, i) => (
              <span key={i} title={allergy.severity} style={{ 
                padding: '4px 12px', borderRadius: '100px', 
                background: 'var(--red-light)', color: 'var(--red)',
                fontSize: '12px', fontWeight: 500, border: '1px solid rgba(239, 68, 68, 0.1)'
              }}>
                {allergy.name}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--gray-400)', fontStyle: 'italic' }}>No known allergies</p>
        )}
      </CollapsibleSection>

      {/* MEDICATIONS */}
      <CollapsibleSection 
        title="Current Medications" 
        icon={Pill} 
        isOpen={expandedSections.includes('meds')}
        onToggle={() => toggleSection('meds')}
        accent="var(--green)"
        count={context.medications.length}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {context.medications.map((med, i) => (
            <div key={i} style={{ 
              padding: '12px', borderRadius: '8px', background: 'var(--dash-bg)',
              border: '1px solid var(--dash-border)'
            }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--navy)', marginBottom: '2px' }}>{med.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--gray-500)', fontWeight: 400 }}>{med.dosage}</span>
                <span style={{ color: 'var(--blue)', fontWeight: 500 }}>{med.since}</span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* CLINICAL HISTORY */}
      <CollapsibleSection 
        title="Prescription History" 
        icon={History} 
        isOpen={expandedSections.includes('history')}
        onToggle={() => toggleSection('history')}
        count={context.history.length}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {context.history.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px' }}>
              <div style={{ width: '2px', background: 'var(--dash-border)', position: 'relative', margin: '4px 0' }}>
                <div style={{ position: 'absolute', top: '0', left: '-4px', width: '10px', height: '10px', borderRadius: '50%', background: h.status === 'Active' ? 'var(--green)' : 'var(--gray-300)', border: '2px solid white' }} />
              </div>
              <div style={{ fontSize: '13px', color: 'var(--navy)', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontWeight: 600 }}>{h.date}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: h.status === 'Active' ? 'var(--green)' : 'var(--gray-400)' }}>{h.status.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--gray-400)', fontWeight: 400 }}>{h.items.join(', ')}</div>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* CURRENT CART */}
      <CollapsibleSection 
        title="Active Cart" 
        icon={ShoppingCart} 
        isOpen={expandedSections.includes('cart')}
        onToggle={() => toggleSection('cart')}
        accent="var(--navy)"
      >
        {context.cart.length > 0 ? (
          <div style={{ background: 'var(--navy)', borderRadius: '12px', padding: '1rem', color: 'white' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem' }}>
              {context.cart.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ opacity: 0.8, fontWeight: 400 }}>{item.qty}x {item.name}</span>
                  <span style={{ fontWeight: 600 }}>₨{item.price}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.75rem', fontWeight: 700, fontSize: '14px' }}>
              <span>Total</span>
              <span>₨{context.cart.reduce((acc, curr) => acc + curr.price, 0)}</span>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--gray-400)', fontStyle: 'italic' }}>Cart is empty</p>
        )}
      </CollapsibleSection>

      {/* PHARMACY OVERVIEW (Moved from dashboard) */}
      <CollapsibleSection 
        title="Pharmacy Overview" 
        icon={Package} 
        isOpen={expandedSections.includes('pharmacy')}
        onToggle={() => toggleSection('pharmacy')}
        accent="var(--amber)"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <OverviewCard label="Orders Today" value="42" icon={Package} color="var(--blue)" />
          <OverviewCard label="Revenue" value="₨12,450" icon={DollarSign} color="var(--green)" />
          <OverviewCard label="Urgent Alerts" value="3" icon={AlertTriangle} color="var(--red)" />
        </div>
      </CollapsibleSection>

      <div style={{ padding: '1.5rem', marginTop: 'auto', borderTop: '1px solid var(--dash-border)', background: 'var(--dash-bg)' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gray-400)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Private Consultation Notes</div>
        <textarea 
          placeholder="Add consultation notes..."
          style={{ width: '100%', height: '100px', padding: '12px', borderRadius: '12px', border: '1px solid var(--dash-border)', outline: 'none', fontSize: '13px', lineHeight: 1.5, background: 'white', resize: 'none', fontFamily: 'inherit' }}
        />
      </div>

    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, children, isOpen, onToggle, accent = 'var(--gray-400)', count }) {
  return (
    <div style={{ borderBottom: '1px solid var(--dash-border)' }}>
      <button 
        onClick={onToggle}
        style={{ 
          width: '100%', padding: '1.25rem 1.5rem', border: 'none', background: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon size={18} color={accent} />
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--navy)' }}>{title}</span>
          {count !== undefined && count > 0 && (
             <span style={{ fontSize: '11px', background: 'var(--dash-bg)', padding: '2px 8px', borderRadius: '100px', color: 'var(--gray-600)', fontWeight: 600 }}>{count}</span>
          )}
        </div>
        {isOpen ? <ChevronDown size={18} color="var(--gray-300)" /> : <ChevronRight size={18} color="var(--gray-300)" />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div style={{ 
      padding: '12px', borderRadius: '10px', background: 'var(--dash-bg)',
      border: '1px solid var(--dash-border)', display: 'flex', flexDirection: 'column', gap: '4px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--gray-400)', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--navy)' }}>{value}</div>
    </div>
  );
}

function OverviewCard({ label, value, icon: Icon, color }) {
  return (
    <div style={{ 
      padding: '10px 14px', borderRadius: '10px', background: 'white',
      border: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon size={16} color={color} />
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--navy)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--navy)' }}>{value}</div>
    </div>
  );
}

