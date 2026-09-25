// src/pages/dashboard/Analytics.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Download, Calendar, Loader2, TrendingUp, ShoppingCart, Users, DollarSign } from 'lucide-react';
import api from '../../services/api';

import KPIRow from '../../components/analytics/KPIRow';
import RevenueLineChart from '../../components/analytics/RevenueLineChart';
import MedicineDemandChart from '../../components/analytics/MedicineDemandChart';
import FunnelStagesCard from '../../components/analytics/SeverityPieChart';

export default function Analytics() {
  const [selectedPeriod, setSelectedPeriod] = useState('last30');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [realStats, setRealStats] = useState(null);
  const [realTrend, setRealTrend] = useState(null);
  const [topMedicines, setTopMedicines] = useState([]);
  const [funnelMetrics, setFunnelMetrics] = useState(null);

  const periodLabels = {
    last7: 'Last 7 Days',
    last30: 'Last 30 Days',
    last90: 'Last 90 Days',
    custom: 'Custom Range'
  };

  const dateRangeText = useMemo(() => {
    const now = new Date();
    const end = now.toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric', year: 'numeric' }
    );

    const start = new Date();

    if (selectedPeriod === 'last7') {
      start.setDate(now.getDate() - 6);
    }

    if (selectedPeriod === 'last30') {
      start.setDate(now.getDate() - 29);
    }

    if (selectedPeriod === 'last90') {
      start.setDate(now.getDate() - 89);
    }

    const startText = start.toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric' }
    );

    return `Showing ${startText} - ${end} | Updated: ${now.toLocaleTimeString(
      'en-US',
      { hour: 'numeric', minute: '2-digit' }
    )}`;
  }, [selectedPeriod]);

  useEffect(() => {
    let cancelled = false;

    const days =
      selectedPeriod === 'last7'
        ? 7
        : selectedPeriod === 'last90'
        ? 90
        : 30;

    async function load() {
      if (!cancelled) {
        setIsLoading(true);
        setLoadError('');
      }

      try {
        const [
          summaryRes,
          trendRes,
          topMedicineRes,
          funnelRes
        ] = await Promise.all([
          api
            .get(`/analytics/summary?days=${days}`)
            .then((response) => response.data?.data),

          api
            .get(`/analytics/trend?days=${days}`)
            .then((response) => response.data?.data),

          api
            .get(`/analytics/top-medicines?days=${days}&limit=10`)
            .then((response) => response.data?.data ?? []),

          api
            .get('/funnel/metrics')
            .then((response) => response.data?.data)
            .catch(() => null)
        ]);

        if (!summaryRes || !trendRes) {
          throw new Error(
            'Authoritative analytics endpoints returned no data.'
          );
        }

        if (!cancelled) {
          setRealStats(summaryRes);
          setRealTrend(trendRes);
          setTopMedicines(
            Array.isArray(topMedicineRes)
              ? topMedicineRes
              : []
          );
          setFunnelMetrics(funnelRes);
        }
      } catch (error) {
        console.error(
          'Analytics load error:',
          error.message
        );

        if (!cancelled) {
          setRealStats(null);
          setRealTrend(null);
          setTopMedicines([]);
          setFunnelMetrics(null);
          setLoadError(
            'Real analytics are temporarily unavailable. No mock values are being shown.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedPeriod]);

  const currentData = useMemo(() => {
    const emptyTrend = {
      daily: [],
      weekly: [],
      monthly: []
    };

    const trend = realTrend || emptyTrend;

    const daily =
      Array.isArray(trend.daily)
        ? trend.daily
        : [];

    const salesSpark =
      daily.map((row) => Number(row.current || 0));

    const ordersSpark =
      daily.map((row) => Number(row.orders || 0));

    const averageSpark =
      daily.map((row) => {
        const orders = Number(row.orders || 0);
        const sales = Number(row.current || 0);

        return orders > 0
          ? Number((sales / orders).toFixed(2))
          : 0;
      });

    const readDelta = (value) => {
      if (value === null || value === undefined) {
        return null;
      }

      const numeric = Number(value);

      return Number.isFinite(numeric)
        ? numeric
        : null;
    };

    const funnelAvailable =
      funnelMetrics &&
      typeof funnelMetrics.overall_conversion_pct === 'number';

    const funnelStages =
      Array.isArray(funnelMetrics?.stages)
        ? funnelMetrics.stages.map((stage) => ({
            eventName: stage.event_name,
            events: Number(stage.event_count || 0),
            sessions: Number(stage.sessions || 0),
            conversion:
              stage.conversion_from_previous_pct === null ||
              stage.conversion_from_previous_pct === undefined
                ? null
                : Number(stage.conversion_from_previous_pct)
          }))
        : [];

    if (!realStats) {
      return {
        kpis: {
          recordedSales: {
            value: '—',
            delta: null,
            spark: []
          },
          orders: {
            value: '—',
            delta: null,
            spark: []
          },
          avgInvoiceValue: {
            value: '—',
            delta: null,
            spark: []
          },
          funnelConversion: {
            value: funnelAvailable
              ? Number(funnelMetrics.overall_conversion_pct)
              : '—'
          }
        },
        revenueTrend: emptyTrend,
        topMedicines: [],
        funnelStages,
        summaryMeasurement: '',
        trendMeasurement: '',
        funnelMeasurement:
          funnelMetrics?.measurement || ''
      };
    }

    return {
      kpis: {
        recordedSales: {
          value: Number(
            realStats.recordedSales?.value ??
            realStats.totalRevenue ??
            0
          ),
          delta: readDelta(
            realStats.recordedSales?.delta
          ),
          spark: salesSpark
        },

        orders: {
          value: Number(
            realStats.orders?.value ??
            realStats.totalOrders ??
            0
          ),
          delta: readDelta(
            realStats.orders?.delta
          ),
          spark: ordersSpark
        },

        avgInvoiceValue: {
          value: Number(
            realStats.averageInvoiceValue?.value ??
            realStats.avgOrderValue ??
            0
          ),
          delta: readDelta(
            realStats.averageInvoiceValue?.delta
          ),
          spark: averageSpark
        },

        funnelConversion: {
          value: funnelAvailable
            ? Number(
                funnelMetrics.overall_conversion_pct
              )
            : '—'
        }
      },

      revenueTrend: {
        daily:
          Array.isArray(trend.daily)
            ? trend.daily
            : [],
        weekly:
          Array.isArray(trend.weekly)
            ? trend.weekly
            : [],
        monthly:
          Array.isArray(trend.monthly)
            ? trend.monthly
            : []
      },

      topMedicines:
        Array.isArray(topMedicines)
          ? topMedicines
          : [],

      funnelStages,

      summaryMeasurement:
        realStats.measurement || '',

      trendMeasurement:
        trend.measurement || '',

      funnelMeasurement:
        funnelMetrics?.measurement || ''
    };
  }, [
    realStats,
    realTrend,
    topMedicines,
    funnelMetrics
  ]);
  const handleExportCSV = () => {
    const convertToCSV = (data) => {
      if (!Array.isArray(data) || data.length === 0) {
        return '';
      }

      const headers =
        Object.keys(data[0]).join(',');

      const rows =
        data
          .map((obj) =>
            Object.values(obj)
              .map((value) =>
                `"${String(value ?? '').replace(/"/g, '""')}"`
              )
              .join(',')
          )
          .join('\n');

      return `${headers}\n${rows}`;
    };

    const files = [
      {
        name: `recorded_sales_${selectedPeriod}.csv`,
        data: convertToCSV(
          currentData.revenueTrend.daily
        )
      },
      {
        name: `medicine_demand_${selectedPeriod}.csv`,
        data: convertToCSV(
          currentData.topMedicines
        )
      },
      {
        name: `observed_funnel_${selectedPeriod}.csv`,
        data: convertToCSV(
          currentData.funnelStages
        )
      }
    ];

    files.forEach((file, index) => {
      setTimeout(() => {
        const blob =
          new Blob(
            [file.data],
            { type: 'text/csv' }
          );

        const url =
          URL.createObjectURL(blob);

        const anchor =
          document.createElement('a');

        anchor.href = url;
        anchor.download = file.name;

        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);

        URL.revokeObjectURL(url);
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
          {/* Real Medicine Demand + Observed Funnel */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '1.5rem'
            }}
          >
            <div style={{ flex: 1.5 }}>
              <MedicineDemandChart
                data={currentData.topMedicines}
              />
            </div>

            <div style={{ flex: 1 }}>
              <FunnelStagesCard
                data={currentData.funnelStages}
                overallConversion={
                  currentData.kpis.funnelConversion.value
                }
                measurement={
                  currentData.funnelMeasurement
                }
              />
            </div>
          </div>

          <div
            className="dash-card"
            style={{
              padding: '1.25rem 1.5rem'
            }}
          >
            <h3
              style={{
                margin: '0 0 0.65rem',
                fontFamily: 'var(--font-display)',
                fontSize: '1rem',
                color: 'var(--navy)'
              }}
            >
              Measurement Notes
            </h3>

            {loadError && (
              <p
                style={{
                  color: 'var(--red)',
                  fontSize: '0.78rem',
                  margin: '0 0 0.5rem'
                }}
              >
                {loadError}
              </p>
            )}

            <p
              style={{
                margin: '0 0 0.4rem',
                fontSize: '0.75rem',
                color: 'var(--gray-500)'
              }}
            >
              {currentData.summaryMeasurement}
            </p>

            <p
              style={{
                margin: '0 0 0.4rem',
                fontSize: '0.75rem',
                color: 'var(--gray-500)'
              }}
            >
              {currentData.trendMeasurement}
            </p>

            <p
              style={{
                margin: 0,
                fontSize: '0.75rem',
                color: 'var(--gray-500)'
              }}
            >
              Customer session duration, chatbot topics and
              interaction-severity analytics are not displayed
              because those signals are not currently instrumented.
            </p>
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
