import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, AlertTriangle, AlertCircle } from 'lucide-react';

/**
 * Implements Delete Confirmation Flow per MedSenseAI SRS Section 3.2.10.
 * Confirms medicine removal with stock warnings.
 */
export default function DeleteMedicineModal({ isOpen, onClose, medicine, onDelete }) {
  if (!medicine) return null;

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
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'relative', width: '100%', maxWidth: 450,
              background: 'var(--dash-card)', borderRadius: 'var(--dash-radius)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.15)', overflow: 'hidden'
            }}
          >
             {/* Header with Icon */}
             <div style={{ padding: '1.5rem 1.5rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={24} color="var(--red)" />
                </div>
                <motion.button 
                  whileHover={{ background: 'var(--dash-bg)', scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose} 
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)', padding: 4 }}
                >
                  <X size={20} />
                </motion.button>
             </div>
             
             <div style={{ padding: '1.25rem 1.5rem' }}>
               <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.25rem', color: 'var(--navy)', margin: '0 0 0.75rem 0' }}>
                 Remove Medicine?
               </h3>
               <p style={{ fontSize: '0.9rem', color: 'var(--gray-600)', lineHeight: 1.6, margin: '0 0 1.25rem 0' }}>
                 Are you sure you want to remove <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{medicine.name}</span> from your inventory?
               </p>

               {/* Medicine Summary Card */}
               <div style={{ background: 'var(--dash-bg)', padding: '1rem', borderRadius: 12, marginBottom: '1.25rem', border: '1px solid var(--dash-border)' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy)' }}>{medicine.name}</p>
                      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--gray-400)' }}>{medicine.category}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy)' }}>{medicine.stockQty} Units</p>
                      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--gray-400)' }}>Current Stock</p>
                    </div>
                 </div>
               </div>

               {/* Warning Banner */}
               {medicine.stockQty > 0 && (
                 <motion.div 
                   initial={{ opacity: 0, y: 5 }}
                   animate={{ opacity: 1, y: 0 }}
                   style={{ display: 'flex', gap: '0.75rem', padding: '1rem', background: '#fffbeb', borderRadius: 12, border: '1px solid #fef3c7' }}
                 >
                   <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0 }} />
                   <div>
                     <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>Active Inventory Warning</p>
                     <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#b45309', lineHeight: 1.4 }}>
                       This medicine has {medicine.stockQty} units in stock. Deleting it will remove all stock records. This action cannot be undone.
                     </p>
                   </div>
                 </motion.div>
               )}
             </div>

             <div style={{ padding: '1.25rem 1.5rem', background: 'var(--dash-bg)', display: 'flex', gap: '0.75rem' }}>
                <motion.button 
                  whileHover={{ background: 'white' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'transparent', color: 'var(--gray-600)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                >
                  Cancel
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.02, background: '#dc2626' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onDelete(medicine.id)}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: 100, border: 'none', background: 'var(--red)', color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Trash2 size={16} />
                  Confirm Delete
                </motion.button>
             </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
