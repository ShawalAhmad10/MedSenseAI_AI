import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileDown, Upload, FileText, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

/**
 * Implements Bulk Inventory Import per MedSenseAI SRS Section 3.2.10.
 * Handles CSV template download, file upload, and validation preview.
 */
export default function BulkCSVImportModal({ isOpen, onClose, onImportSuccess }) {
  const { showToast } = useToast();
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [isValidating, setIsValidating] = useState(false);

  const downloadTemplate = () => {
    const headers = "name,generic_name,category,brand,unit_price,stock_qty,min_threshold,expiry_date,requires_prescription";
    const example1 = "Panadol,Paracetamol,Analgesics,GSK,150,1000,100,2027-12-31,false";
    const example2 = "Amoxil,Amoxicillin,Antibiotics,GSK,450,50,20,2026-06-30,true";
    const csvContent = "data:text/csv;charset=utf-8," + [headers, example1, example2].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "medsense_inventory_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast({ type: 'success', message: 'Template downloaded' });
  };

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;
    if (!uploadedFile.name.endsWith('.csv')) {
      showToast({ type: 'error', message: 'Please upload a CSV file' });
      return;
    }

    setFile(uploadedFile);
    setIsValidating(true);

    // Mock parsing and validation
    setTimeout(() => {
      const mockData = [
        { name: 'Augmentin 625mg', generic: 'Co-Amoxiclav', valid: true, error: '' },
        { name: 'Glucophage 500mg', generic: 'Metformin', valid: true, error: '' },
        { name: 'Invalid Med', generic: '', valid: false, error: 'Generic Name required' },
        { name: 'Expiring Soon', generic: 'Test', valid: true, error: '' },
        { name: 'Loprin 75mg', generic: 'Aspirin', valid: true, error: '' },
      ];
      setPreviewData(mockData);
      setIsValidating(false);
    }, 1200);
  };

  const validCount = previewData.filter(d => d.valid).length;

  const handleImport = () => {
    onImportSuccess(previewData.filter(d => d.valid));
    showToast({ type: 'success', message: `Successfully imported ${validCount} items` });
    onClose();
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
              position: 'relative', width: '100%', maxWidth: 650,
              background: 'white', borderRadius: 'var(--dash-radius)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.15)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh'
            }}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--dash-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Upload size={18} color="var(--navy)" />
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Bulk Import Inventory</h3>
              </div>
              <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
              
              {/* Section 1: Template */}
              <div style={{ background: 'var(--dash-bg)', padding: '1.25rem', borderRadius: 12, marginBottom: '1.5rem', border: '1px solid var(--dash-border)' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <Info size={20} color="var(--blue)" style={{ flexShrink: 0 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy)' }}>Required Format</p>
                    <p style={{ margin: '4px 0 12px 0', fontSize: '0.75rem', color: 'var(--gray-600)', lineHeight: 1.4 }}>
                      Your CSV must include: name, generic_name, category, brand, unit_price, stock_qty, and expiry_date.
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.02, background: 'white' }} whileTap={{ scale: 0.98 }}
                      onClick={downloadTemplate}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'transparent', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', color: 'var(--blue)' }}
                    >
                      <FileDown size={14} /> Download CSV Template
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Section 2: Upload Zone */}
              <div style={{ marginBottom: '1.5rem' }}>
                {!file ? (
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--dash-border)', borderRadius: 16, padding: '3rem 2rem', cursor: 'pointer', transition: 'all 0.2s', background: 'white' }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--blue)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--dash-border)'}
                  >
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--dash-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                      <FileText size={24} color="var(--gray-400)" />
                    </div>
                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--navy)' }}>Upload your CSV file</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--gray-400)' }}>Drag and drop or click to browse</p>
                    <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                  </label>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--dash-bg)', borderRadius: 12, border: '1px solid var(--dash-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                       <div style={{ width: 40, height: 40, borderRadius: 10, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <FileText size={20} color="var(--blue)" />
                       </div>
                       <div>
                         <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>{file.name}</p>
                         <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--gray-400)' }}>{(file.size / 1024).toFixed(1)} KB</p>
                       </div>
                    </div>
                    <button onClick={() => { setFile(null); setPreviewData([]); }} style={{ border: 'none', background: 'transparent', color: 'var(--red)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Remove</button>
                  </div>
                )}
              </div>

              {/* Section 3: Preview */}
              <AnimatePresence>
                {isValidating ? (
                  <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-block', marginBottom: '1rem' }}>
                       <Upload size={32} color="var(--blue)" />
                    </motion.div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--gray-400)' }}>Validating records...</p>
                  </div>
                ) : previewData.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                       <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>Data Preview</h4>
                       <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)' }}>
                         {validCount} of {previewData.length} rows valid
                       </p>
                    </div>
                    <div style={{ border: '1px solid var(--dash-border)', borderRadius: 12, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--dash-bg)', textAlign: 'left' }}>
                            <th style={{ padding: '0.75rem', fontWeight: 600 }}>Medicine Name</th>
                            <th style={{ padding: '0.75rem', fontWeight: 600 }}>Generic Name</th>
                            <th style={{ padding: '0.75rem', fontWeight: 600 }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.map((row, i) => (
                            <tr key={i} style={{ borderTop: '1px solid var(--dash-border)' }}>
                              <td style={{ padding: '0.75rem' }}>{row.name}</td>
                              <td style={{ padding: '0.75rem' }}>{row.generic || '—'}</td>
                              <td style={{ padding: '0.75rem' }}>
                                {row.valid ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--green)' }}>
                                    <CheckCircle2 size={14} /> Ready
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--red)' }}>
                                    <AlertCircle size={14} /> {row.error}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--dash-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
               <button onClick={onClose} style={{ padding: '0.6rem 1.25rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--gray-600)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                 Cancel
               </button>
               <motion.button
                 whileHover={validCount > 0 ? { scale: 1.02 } : {}}
                 whileTap={validCount > 0 ? { scale: 0.98 } : {}}
                 disabled={validCount === 0}
                 onClick={handleImport}
                 style={{ 
                    padding: '0.6rem 1.5rem', borderRadius: 100, border: 'none', background: 'var(--navy)', color: 'white', 
                    fontSize: '0.85rem', fontWeight: 600, cursor: validCount > 0 ? 'pointer' : 'not-allowed',
                    opacity: validCount > 0 ? 1 : 0.5
                 }}
               >
                 Import {validCount} Valid Items
               </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
