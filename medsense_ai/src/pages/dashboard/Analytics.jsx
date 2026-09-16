// src/pages/dashboard/Analytics.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Download, Calendar, Loader2, TrendingUp, ShoppingCart, Users, DollarSign } from 'lucide-react';
import { analyticsData } from '../../utils/analyticsData';
import api from '../../services/api';

// Components
import KPIRow from '../../components/analytics/KPIRow';
import RevenueLineChart from '../../components/analytics/RevenueLineChart';
import MedicineDemandChart from '../../components/analytics/MedicineDemandChart';
import SeverityPieChart from '../../components/analytics/SeverityPieChart';
import CustomerBehaviourTable from '../../components/analytics/CustomerBehaviourTable';

export default function Analytics() {
  const [selectedPeriod, setSelectedPeriod] = useState('last30');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [realStats, setRealStats]       = useState(null);
  const [realInventory, setRealInventory] = useState(null);
  const [realOrders, setRealOrders]     = useState([]);
  const [topMedicines, setTopMedicines] = useState([]);

  const periodLabels = {
    last7: "Last 7 Days",
    last30: "Last 30 Days",
    last90: "Last 90 Days",
    custom: "Custom Range"
  };

  const dateRangeText = useMemo(() => {
    const now = new Date();
    const end = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const start = new Date();
    if (selectedPeriod === 'last7') start.setDate(now.getDate() - 7);
    else if (selectedPeriod === 'last30') start.setDate(now.getDate() - 30);
    else if (selectedPeriod === 'last90') start.setDate(now.getDate() - 90);
    const startText = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `Showing ${startText} – ${end} · Updated: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }, [selectedPeriod]);

  // Load real backend data — re-fetch on every mount + when period changes
  useEffect(() => {
    let cancelled = false;
    const days = selectedPeriod === 'last7' ? 7 : selectedPeriod === 'last90' ? 90 : 30;
    async function load() {
      if (!cancelled) setIsLoading(true);
      try {
        const [summaryRes, trendRes, topMedRes, invRes] = await Promise.all([
          api.get(`/analytics/summary?days=${days}`).then(r => r.data?.data).catch(() => null),
          api.get(`/analytics/trend?days=${days}`).then(r => r.data?.data ?? []).catch(() => []),
          api.get(`/analytics/top-medicines?days=${days}&limit=8`).then(r => r.data?.data ?? []).catch(() => []),
          api.get('/inventory/stats').then(r => r.data?.data).catch(() => null),
        ]);
        if (!cancelled) {
          setRealStats(summaryRes);
          setRealInventory(invRes);
          setRealOrders(trendRes);  // reuse realOrders state for trend data
          setTopMedicines(topMedRes);
        }
      } catch (e) {
        console.error('Analytics load error:', e.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedPeriod]);

  // Remove the old redundant selectedPeriod effect
  const mockData = analyticsData[selectedPeriod] || analyticsData.last30;

  // Merge real stats into KPI row
  const currentData = useMemo(() => {
    if (!realStats) return mockData;

    // Build real top medicines from actual order items
    let topMeds = mockData.topMedicines;
    if (realOrders.length > 0) {
      const medCount = {};
      realOrders.forEach(order => {
        (order.items || []).forEach(item => {
          if (!medCount[item.name]) medCount[item.name] = { name: item.name, units: 0, revenue: 0 };
          medCount[item.name].units += (item.qty || item.quantity || 0);
          medCount[item.name].revenue += (item.subtotal || 0);
        });
      });
      const sorted = Object.values(medCount).sort((a, b) => b.revenue - a.revenue);
      if (sorted.length > 0) {
        const totalRev = sorted.reduce((s, m) => s + m.revenue, 0);
        topMeds = sorted.slice(0, 10).map(m => ({
          name: m.name,
          units: m.units,
          revenue: m.revenue,
          pctOfTotal: totalRev > 0 ? parseFloat(((m.revenue / totalRev) * 100).toFixed(1)) : 0,
        }));
      }
    } else if (realInventory.length > 0) {
      topMeds = realInventory.slice(0, 10).map((item, i) => ({
        name: item.name,
        units: Math.max(item.stockQty || 0, 10) + (i * 5),
        revenue: (item.unitPrice || 0) * (Math.max(item.stockQty || 0, 10) + (i * 5)),
        pctOfTotal: parseFloat((10 - i * 0.5).toFixed(1)),
      }));
    }

    return {
      ...mockData,
      kpis: {
        totalRevenue: { value: realStats.totalRevenue || 0, delta: +18.2, spark: mockData.kpis.totalRevenue.spark },
        totalOrders: { value: realStats.totalOrders || 0, delta: +11.5, spark: mockData.kpis.totalOrders.spark },
        avgOrderValue: { value: realStats.totalOrders > 0 ? Math.round((realStats.totalRevenue || 0) / realStats.totalOrders) : 0, delta: +3.2, spark: mockData.kpis.avgOrderValue.spark },
        customerRetention: { value: 72.4, delta: +1.8 },
      },
      topMedicines: topMeds,
    };
  }, [realStats, realInventory, realOrders, mockData]);

  const handleExportCSV = () => {
    const convertToCSV = (data) => {
      if (!data || data.length === 0) return '';
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(obj => Object.values(obj).join(',')).join('\n');
      return `${headers}\n${rows}`;
    };
    const files = [
      { name: `revenue_${selectedPeriod}.csv`, data: convertToCSV(currentData.revenueTrend.weekly) },
      { name: `top_medicines_${selectedPeriod}.csv`, data: convertToCSV(currentData.topMedicines) },
      { name: `customer_behaviour_${selectedPeriod}.csv`, data: convertToCSV(currentData.customerBehaviour) },
    ];
    files.forEach((file, index) => {
      setTimeout(() => {
        const blob = new Blob([file.data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      }, index * 250);
    });
  };

  const handleExportPDF = () => {
    setIsGeneratingPDF(true);
    setTimeout(() => { setIsGeneratingPDF(false); window.print(); }, 1500);
  };

  return (
    <div className="analytics-container" style={{ position: 'relative' }}>
      {/* PDF Generation Overlay */}
      <AnimatePresence>
        {isGeneratingPDF && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
              background: 'rgba(255,255,255,0.9)', zIndex: 9999,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)'
            }}
          >
            <Loader2 className="animate-spin" size={48} color="var(--blue)" />
            <p style={{ marginTop: '1.5rem', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.2rem', color: 'var(--navy)' }}>
              Generating Report...
            </p>
            <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem' }}>Preparing high-resolution analytics document</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER SECTION */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', color: 'var(--navy)', margin: '0 0 4px 0' }}>
            Analytics & Reports
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--gray-400)', fontWeight: 400, margin: 0 }}>
            Performance insights and exportable reports for your pharmacy
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleExportPDF}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '0.6rem 1.25rem',
              background: 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-btn)',
              fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.2)'
            }}
          >
            <FileText size={18} />
            Export PDF Report
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02, background: 'var(--dash-bg)' }}
            whileTap={{ scale: 0.98 }}
            onClick={handleExportCSV}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '0.6rem 1.25rem',
              background: 'white', color: 'var(--navy)', border: '1px solid var(--dash-border)', borderRadius: 'var(--radius-btn)',
              fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer'
            }}
          >
            <Download size={18} />
            Export CSV Data
          </motion.button>
        </div>
      </div>

      {/* PERIOD SELECTOR */}
      <div className="no-print" style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
          {Object.keys(periodLabels).map((key) => (
            <motion.button
              key={key}
              whileHover={selectedPeriod !== key ? { background: 'var(--dash-border)' } : {}}
              onClick={() => setSelectedPeriod(key)}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '100px',
                border: '1px solid',
                borderColor: selectedPeriod === key ? 'var(--blue)' : 'var(--dash-border)',
                background: selectedPeriod === key ? 'var(--blue)' : 'transparent',
                color: selectedPeriod === key ? 'white' : 'var(--gray-600)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {periodLabels[key]}
            </motion.button>
          ))}
        </div>
        
        {/* Custom Range reveal (Simulated) */}
        <AnimatePresence>
          {selectedPeriod === 'custom' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden', marginBottom: '1rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'white', borderRadius: '12px', border: '1px solid var(--dash-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                   <label style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 600 }}>FROM</label>
                   <input type="date" className="auth-input" style={{ height: '36px', width: '140px' }} defaultValue="2026-04-01" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                   <label style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 600 }}>TO</label>
                   <input type="date" className="auth-input" style={{ height: '36px', width: '140px' }} defaultValue="2026-04-29" />
                </div>
                <button style={{ padding: '6px 16px', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Apply</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 400, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={14} />
          {dateRangeText}
        </p>
      </div>

      {/* CONTENT GRID */}
      {isLoading ? (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <div className="dash-shimmer" style={{ height: '140px' }} />
          <div className="dash-shimmer" style={{ height: '400px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem' }}>
            <div className="dash-shimmer" style={{ height: '400px' }} />
            <div className="dash-shimmer" style={{ height: '400px' }} />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* KPI Row */}
          <KPIRow data={currentData.kpis} />

          {/* Revenue Chart - Full Width */}
          <div className="print-break-after">
            <RevenueLineChart trendData={currentData.revenueTrend} period={selectedPeriod} />
          </div>

          {/* Middle Row: Medicine Demand + Interaction Severity */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            <div style={{ flex: 1.5 }}>
              <MedicineDemandChart data={currentData.topMedicines} />
            </div>
            <div style={{ flex: 1 }}>
              <SeverityPieChart data={currentData.severityBreakdown} />
            </div>
          </div>

          {/* Bottom Row: Customer Behaviour Table */}
          <div className="print-break-before">
             <CustomerBehaviourTable data={currentData.customerBehaviour} periodLabel={periodLabels[selectedPeriod]} />
          </div>
        </div>
      )}

      {/* PRINT HEADER (Hidden on screen) */}
      <div className="print-only" style={{ display: 'none' }}>
        <div style={{ borderBottom: '2px solid var(--navy)', paddingBottom: '1rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ margin: 0, color: 'var(--navy)' }}>Pharmacy Analytics Report</h1>
            <p style={{ margin: '4px 0 0 0', color: 'var(--gray-600)' }}>Report generated for the period: {periodLabels[selectedPeriod]}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontWeight: 700 }}>MedSense AI Dashboard</p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--gray-400)' }}>{new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; font-family: serif !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .dash-card { border: 1px solid #ddd !important; box-shadow: none !important; break-inside: avoid; }
          .analytics-container { padding: 0 !important; width: 100% !important; }
          .print-break-after { page-break-after: always; }
          .print-break-before { page-break-before: always; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          
          /* Footer with page numbers */
          @page {
            margin: 2cm;
            @bottom-right {
              content: "Page " counter(page);
            }
          }
        }
        
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
