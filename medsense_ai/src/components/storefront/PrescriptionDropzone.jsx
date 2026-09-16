// SRS §3.2.2 / EUC-02: Prescription upload, OCR extraction, and manual correction flow.
import React, { useMemo, useState } from 'react';
import { AlertCircle, FileText, LoaderCircle, UploadCloud } from 'lucide-react';

function confidenceLabel(confidence) {
  if (confidence >= 0.9) return { className: 'sf-badge-success', text: 'High confidence' };
  if (confidence >= 0.7) return { className: 'sf-badge-warning', text: 'Review suggested' };
  return { className: 'sf-badge-danger', text: 'Needs manual edit' };
}

export default function PrescriptionDropzone({ rows }) {
  const [fileName, setFileName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [editableRows, setEditableRows] = useState(rows);
  const [fileError, setFileError] = useState('');

  const lowConfidenceCount = useMemo(
    () => editableRows.filter((row) => row.confidence < 0.7).length,
    [editableRows],
  );

  const handleFileSelect = (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    // Reset error
    setFileError('');

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(selected.type)) {
      setFileError('Only PNG, JPG, JPEG, and PDF files are allowed');
      event.target.value = ''; // Clear the input
      return;
    }

    // Validate file size (5MB = 5 * 1024 * 1024 bytes)
    const maxSize = 5 * 1024 * 1024;
    if (selected.size > maxSize) {
      setFileError('File size must be less than 5MB');
      event.target.value = ''; // Clear the input
      return;
    }

    setFileName(selected.name);
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
    }, 900);
  };

  const updateRow = (id, field, value) => {
    setEditableRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="sf-card sf-section-card" style={{ borderStyle: 'dashed', textAlign: 'center' }}>
        <UploadCloud color="var(--blue)" size={42} />
        <h3 style={{ marginBottom: '0.35rem', fontFamily: 'var(--font-display)' }}>Upload prescription image or PDF</h3>
        <p className="sf-muted" style={{ marginTop: 0 }}>
          Supported formats: PNG, JPG, JPEG, PDF (max 5MB)
        </p>
        <input accept=".png,.jpg,.jpeg,.pdf" onChange={handleFileSelect} style={{ marginTop: '0.65rem' }} type="file" />
        
        {fileError && (
          <div style={{ 
            marginTop: '0.9rem', 
            padding: '0.75rem', 
            borderRadius: '8px', 
            background: 'rgba(239,68,68,0.1)', 
            border: '1px solid rgba(239,68,68,0.3)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: '0.5rem' 
          }}>
            <AlertCircle size={16} color="#dc2626" />
            <span style={{ fontSize: '0.875rem', color: '#dc2626' }}>{fileError}</span>
          </div>
        )}
        
        {fileName && !fileError && (
          <div className="sf-badge-success" style={{ marginTop: '0.9rem' }}>
            <FileText size={14} />
            {fileName}
          </div>
        )}
      </div>

      <div className="sf-card sf-section-card">
        <div className="sf-page-header">
          <div>
            <h2>OCR Review</h2>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Editable line items with confidence badges and manual fallback for uncertain rows.
            </p>
          </div>
          <div className={lowConfidenceCount ? 'sf-badge-danger' : 'sf-badge-success'}>
            {lowConfidenceCount ? `${lowConfidenceCount} rows need review` : 'All rows look good'}
          </div>
        </div>

        {processing ? (
          <div className="sf-loading">
            <LoaderCircle size={24} style={{ animation: 'clockTick 1s linear infinite' }} />
            <div style={{ marginTop: '0.75rem' }}>Processing prescription and extracting medicines…</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--sf-text-muted)' }}>
                  <th style={{ padding: '0.85rem 0.5rem' }}>Medicine</th>
                  <th style={{ padding: '0.85rem 0.5rem' }}>Dosage</th>
                  <th style={{ padding: '0.85rem 0.5rem' }}>Frequency</th>
                  <th style={{ padding: '0.85rem 0.5rem' }}>Duration</th>
                  <th style={{ padding: '0.85rem 0.5rem' }}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {editableRows.map((row) => {
                  const badge = confidenceLabel(row.confidence);
                  return (
                    <tr key={row.id} style={{ borderTop: '1px solid var(--sf-border)' }}>
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <input className="sf-input" onChange={(event) => updateRow(row.id, 'medicine', event.target.value)} value={row.medicine} />
                      </td>
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <input className="sf-input" onChange={(event) => updateRow(row.id, 'dosage', event.target.value)} value={row.dosage} />
                      </td>
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <input className="sf-input" onChange={(event) => updateRow(row.id, 'frequency', event.target.value)} value={row.frequency} />
                      </td>
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <input className="sf-input" onChange={(event) => updateRow(row.id, 'duration', event.target.value)} value={row.duration} />
                      </td>
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <span className={badge.className}>{badge.text}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
