// src/pages/dashboard/InteractionAlerts.jsx
// Multi-drug interaction checker connected to MedsenseAI AI backend.
// Generates ALL pairwise interactions for any number of drugs (2–20).
import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, Search, CheckCircle, AlertCircle,
  ShieldAlert, User, Clock, Loader2, RefreshCw,
  Plus, X, Pill, Zap, Info, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { checkDrugInteractions } from '../../services/interactionService';

/* ── Severity config ──────────────────────────────────────────────── */

const SEVERITY_CFG = {
  critical: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: 'Critical', icon: ShieldAlert },
  warning:  { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', label: 'Warning',  icon: AlertTriangle },
  info:     { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', label: 'Info',     icon: AlertCircle },
  safe:     { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Safe',     icon: CheckCircle },
};

/* ── Main Component ───────────────────────────────────────────────── */

export default function InteractionAlerts() {
  const { showToast } = useToast();

  // Drug input state
  const [drugs, setDrugs] = useState(['', '']);
  const [currentInput, setCurrentInput] = useState('');

  // Results state
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [expandedPair, setExpandedPair] = useState(null);

  /* ── Drug list management ─────────────────────────────────────── */

  const addDrug = useCallback(() => {
    const name = currentInput.trim();
    if (!name) return;
    if (drugs.filter(Boolean).some(d => d.toLowerCase() === name.toLowerCase())) {
      showToast({ type: 'warning', message: `"${name}" is already in the list.` });
      return;
    }
    if (drugs.filter(Boolean).length >= 20) {
      showToast({ type: 'warning', message: 'Maximum 20 drugs allowed.' });
      return;
    }
    // Fill first empty slot or append
    const emptyIndex = drugs.findIndex(d => !d.trim());
    if (emptyIndex !== -1) {
      setDrugs(prev => prev.map((d, i) => i === emptyIndex ? name : d));
    } else {
      setDrugs(prev => [...prev, name]);
    }
    setCurrentInput('');
  }, [currentInput, drugs, showToast]);

  const removeDrug = useCallback((index) => {
    setDrugs(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Always keep at least 2 slots
      while (updated.length < 2) updated.push('');
      return updated;
    });
  }, []);

  const updateDrug = useCallback((index, value) => {
    setDrugs(prev => prev.map((d, i) => i === index ? value : d));
  }, []);

  const validDrugs = useMemo(
    () => drugs.filter(d => d.trim().length > 0),
    [drugs]
  );

  const pairCount = useMemo(
    () => validDrugs.length >= 2 ? (validDrugs.length * (validDrugs.length - 1)) / 2 : 0,
    [validDrugs]
  );

  /* ── API call ─────────────────────────────────────────────────── */

  const handleCheck = useCallback(async () => {
    if (validDrugs.length < 2) {
      showToast({ type: 'warning', message: 'Enter at least 2 drugs to check interactions.' });
      return;
    }

    setLoading(true);
    setResults(null);
    setTab('all');
    setSearch('');
    setExpandedPair(null);

    try {
      const data = await checkDrugInteractions(validDrugs);
      setResults(data);

      if (!data.service_ready) {
        showToast({ type: 'error', message: 'AI service is not ready. Please try again later.' });
      } else if (data.interactions_found > 0) {
        showToast({
          type: 'warning',
          message: `Found ${data.interactions_found} interaction${data.interactions_found > 1 ? 's' : ''} across ${data.total_pairs_checked} pairs checked.`,
        });
      } else {
        showToast({
          type: 'success',
          message: `No interactions found across ${data.total_pairs_checked} pairs. Always consult a professional.`,
        });
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to check interactions.';
      showToast({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  }, [validDrugs, showToast]);

  /* ── Filtered results ─────────────────────────────────────────── */

  const allResults = results?.results ?? [];

  const filtered = useMemo(() => {
    let list = allResults;
    if (tab !== 'all') {
      list = list.filter(r => r.severity === tab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.drug_a?.toLowerCase().includes(q) ||
        r.drug_b?.toLowerCase().includes(q) ||
        r.descriptions?.some(d => d.toLowerCase().includes(q)) ||
        r.message?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allResults, tab, search]);

  const stats = useMemo(() => ({
    total:    allResults.length,
    critical: allResults.filter(r => r.severity === 'critical').length,
    warning:  allResults.filter(r => r.severity === 'warning').length,
    info:     allResults.filter(r => r.severity === 'info').length,
    safe:     allResults.filter(r => r.severity === 'safe').length,
  }), [allResults]);

  const tabs = [
    { id: 'all',      label: 'All Pairs',  count: stats.total },
    { id: 'critical', label: 'Critical',   count: stats.critical },
    { id: 'warning',  label: 'Warning',    count: stats.warning },
    { id: 'info',     label: 'Info',       count: stats.info },
    { id: 'safe',     label: 'Safe',       count: stats.safe },
  ];

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy, #1e3a5f)' }}>
            Drug Interaction Checker
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            AI-powered multi-drug interaction analysis — checks every pair
          </p>
        </div>
      </div>

      {/* ── Drug Input Panel ── */}
      <div style={{
        background: 'white', border: '1px solid #e2e8f0', borderRadius: 16,
        padding: '1.5rem', marginBottom: '1.25rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Pill size={18} color="#2563eb" />
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--navy, #1e3a5f)' }}>
            Enter Drugs / Active Ingredients
          </h2>
          <span style={{
            fontSize: '0.7rem', fontWeight: 600, background: '#eff6ff',
            color: '#2563eb', padding: '2px 8px', borderRadius: 100, marginLeft: 'auto',
          }}>
            {validDrugs.length} drug{validDrugs.length !== 1 ? 's' : ''} · {pairCount} pair{pairCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Drug chips / input fields */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {drugs.map((drug, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: drug.trim() ? '#f0fdf4' : '#f8fafc',
              border: `1px solid ${drug.trim() ? '#86efac' : '#e2e8f0'}`,
              borderRadius: 10, padding: '0.35rem 0.5rem 0.35rem 0.75rem',
              minWidth: 160,
            }}>
              <input
                value={drug}
                onChange={e => updateDrug(i, e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (i === drugs.length - 1 && drug.trim()) {
                      setDrugs(prev => [...prev, '']);
                    }
                  }
                }}
                placeholder={`Drug ${i + 1}`}
                style={{
                  border: 'none', outline: 'none', background: 'transparent',
                  fontSize: '0.85rem', fontWeight: 500, flex: 1, minWidth: 100,
                  color: '#1e293b',
                }}
              />
              {(drugs.length > 2 || drug.trim()) && (
                <button onClick={() => removeDrug(i)} style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  padding: 2, display: 'flex', color: '#94a3b8',
                }}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add drug row */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Plus size={14} style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)', color: '#94a3b8',
            }} />
            <input
              value={currentInput}
              onChange={e => setCurrentInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDrug(); } }}
              placeholder="Type a drug name and press Enter..."
              style={{
                width: '100%', paddingLeft: 32, height: 38, borderRadius: 9,
                border: '1px solid #e2e8f0', fontSize: '0.82rem', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={addDrug}
            style={{
              padding: '0.5rem 1rem', borderRadius: 9, border: '1px solid #e2e8f0',
              background: 'white', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <Plus size={14} /> Add
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={handleCheck}
            disabled={loading || validDrugs.length < 2}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: 9, border: 'none',
              background: validDrugs.length >= 2 ? '#1e3a8a' : '#94a3b8',
              color: 'white', fontWeight: 700, fontSize: '0.85rem',
              cursor: validDrugs.length >= 2 ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</>
            ) : (
              <><Zap size={15} /> Check Interactions ({pairCount} pairs)</>
            )}
          </motion.button>
        </div>
      </div>

      {/* ── Results Section ── */}
      {results && (
        <>
          {/* Stats cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '0.75rem', marginBottom: '1.25rem',
          }}>
            {[
              { label: 'Pairs Checked', value: results.total_pairs_checked, color: '#2563eb' },
              { label: 'Interactions',   value: results.interactions_found,  color: '#dc2626' },
              { label: 'Critical',       value: stats.critical,             color: '#dc2626' },
              { label: 'Warning',        value: stats.warning,              color: '#f59e0b' },
              { label: 'Safe',           value: stats.safe,                 color: '#16a34a' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'white', border: '1px solid #e2e8f0', borderRadius: 12,
                padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
              }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs + Search */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', gap: '0.25rem', background: 'white',
              border: '1px solid #e2e8f0', borderRadius: 10, padding: 3,
            }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  padding: '0.4rem 0.75rem', borderRadius: 7, border: 'none',
                  background: tab === t.id ? '#1e3a8a' : 'transparent',
                  color: tab === t.id ? 'white' : '#64748b',
                  fontWeight: tab === t.id ? 600 : 400, fontSize: '0.78rem', cursor: 'pointer',
                }}>
                  {t.label} ({t.count})
                </button>
              ))}
            </div>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{
                position: 'absolute', left: 10, top: '50%',
                transform: 'translateY(-50%)', color: '#94a3b8',
              }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by drug name or description..."
                style={{
                  width: '100%', paddingLeft: 30, height: 38, borderRadius: 9,
                  border: '1px solid #e2e8f0', fontSize: '0.82rem', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Results list */}
          {filtered.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '3rem', background: 'white',
              borderRadius: 14, border: '1px solid #e2e8f0', color: '#94a3b8',
            }}>
              <CheckCircle size={40} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
              <p style={{ margin: 0, fontWeight: 600 }}>
                {allResults.length === 0
                  ? 'No interaction data returned.'
                  : 'No results match your filter.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {filtered.map((pair, i) => {
                const cfg = SEVERITY_CFG[pair.severity] ?? SEVERITY_CFG.info;
                const Icon = cfg.icon;
                const pairKey = `${pair.drug_a}::${pair.drug_b}`;
                const isExpanded = expandedPair === pairKey;

                return (
                  <motion.div
                    key={pairKey}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    style={{
                      background: 'white',
                      border: `1px solid ${pair.severity === 'critical' ? '#fca5a5' : '#e2e8f0'}`,
                      borderRadius: 14, overflow: 'hidden',
                    }}
                  >
                    {/* Pair header row */}
                    <div
                      onClick={() => setExpandedPair(isExpanded ? null : pairKey)}
                      style={{
                        padding: '1rem 1.25rem', display: 'flex', alignItems: 'center',
                        gap: '1rem', cursor: 'pointer',
                      }}
                    >
                      {/* Severity icon */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, background: cfg.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Icon size={20} color={cfg.color} />
                      </div>

                      {/* Drug names */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy, #1e3a5f)' }}>
                            {pair.drug_a}
                          </span>
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8',
                            padding: '0 4px',
                          }}>
                            ✕
                          </span>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy, #1e3a5f)' }}>
                            {pair.drug_b}
                          </span>

                          <span style={{
                            fontSize: '0.68rem', fontWeight: 700, background: cfg.bg,
                            color: cfg.color, padding: '1px 8px', borderRadius: 100,
                          }}>
                            {cfg.label}
                          </span>

                          {pair.known_interaction && (
                            <span style={{
                              fontSize: '0.65rem', fontWeight: 700, background: '#fef2f2',
                              color: '#dc2626', padding: '1px 8px', borderRadius: 100,
                            }}>
                              Known Interaction
                            </span>
                          )}

                          {pair.warning_score != null && (
                            <span style={{
                              fontSize: '0.65rem', fontWeight: 600, background: '#f8fafc',
                              color: '#64748b', padding: '1px 8px', borderRadius: 100,
                            }}>
                              Score: {(pair.warning_score * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>

                        <p style={{
                          margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b',
                          lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: isExpanded ? 'normal' : 'nowrap',
                        }}>
                          {pair.message}
                        </p>
                      </div>

                      {/* Expand arrow */}
                      <div style={{ flexShrink: 0, color: '#94a3b8' }}>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>

                    {/* Expanded detail panel */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{
                            padding: '0 1.25rem 1.25rem', borderTop: '1px solid #f1f5f9',
                            paddingTop: '1rem',
                          }}>
                            {/* Known interaction descriptions */}
                            {pair.descriptions && pair.descriptions.length > 0 && (
                              <div style={{ marginBottom: '0.75rem' }}>
                                <p style={{
                                  fontSize: '0.75rem', fontWeight: 700, color: '#374151',
                                  marginBottom: '0.4rem', textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                }}>
                                  Known Interaction Evidence
                                </p>
                                {pair.descriptions.map((desc, di) => (
                                  <div key={di} style={{
                                    background: '#fef2f2', borderRadius: 8,
                                    padding: '0.5rem 0.75rem', marginBottom: '0.35rem',
                                    fontSize: '0.8rem', color: '#991b1b', lineHeight: 1.5,
                                    borderLeft: '3px solid #fca5a5',
                                  }}>
                                    {desc}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Detail grid */}
                            <div style={{
                              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                              gap: '0.5rem',
                            }}>
                              {[
                                { label: 'Status', value: pair.status?.replace(/_/g, ' ') },
                                { label: 'Normalized A', value: pair.normalized_a || '—' },
                                { label: 'Normalized B', value: pair.normalized_b || '—' },
                                { label: 'Warning Score', value: pair.warning_score != null ? `${(pair.warning_score * 100).toFixed(2)}%` : 'N/A' },
                                { label: 'Warning Triggered', value: pair.warning_triggered ? 'Yes' : 'No' },
                                { label: 'Known Record', value: pair.known_interaction ? 'Yes' : 'No' },
                              ].map(item => (
                                <div key={item.label} style={{
                                  background: '#f8fafc', borderRadius: 8,
                                  padding: '0.5rem 0.75rem',
                                }}>
                                  <p style={{
                                    margin: 0, fontSize: '0.65rem', fontWeight: 600,
                                    color: '#94a3b8', textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                  }}>
                                    {item.label}
                                  </p>
                                  <p style={{
                                    margin: '2px 0 0', fontSize: '0.82rem',
                                    fontWeight: 600, color: '#1e293b',
                                  }}>
                                    {item.value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Disclaimer */}
          {results.disclaimer && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
              marginTop: '1rem', padding: '0.75rem 1rem', background: '#fffbeb',
              border: '1px solid #fcd34d', borderRadius: 10,
            }}>
              <Info size={16} color="#d97706" style={{ marginTop: 2, flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#92400e', lineHeight: 1.5 }}>
                {results.disclaimer}
              </p>
            </div>
          )}
        </>
      )}

      {/* Empty state before first check */}
      {!results && !loading && (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem', background: 'white',
          borderRadius: 14, border: '1px solid #e2e8f0', color: '#94a3b8',
        }}>
          <Pill size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
          <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: '#64748b' }}>
            Enter drugs above to check for interactions
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '0.82rem' }}>
            Add 2 or more drugs and click "Check Interactions" to analyze all pairwise combinations
            using the MedsenseAI machine learning model and known drug interaction database.
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && !results && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '4rem', background: 'white', borderRadius: 14,
          border: '1px solid #e2e8f0',
        }}>
          <Loader2 size={36} color="#2563eb" style={{ animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
          <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: '#1e3a5f' }}>
            Analyzing {pairCount} drug pair{pairCount !== 1 ? 's' : ''}...
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Running ML model + checking known interaction database
          </p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
