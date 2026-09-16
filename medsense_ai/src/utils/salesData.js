// src/utils/salesData.js
// ─────────────────────────────────────────────────────────────────────
// All mock data for the Sales Optimization page.
// Structured by period (last7 | last30 | last90) so every chart,
// table, and alert re-renders atomically when the period selector changes.
// ─────────────────────────────────────────────────────────────────────

// ── Palette for category donut ────────────────────────────────────────
const CATEGORY_COLORS = {
  'Vitamins & Supplements': '#10b981',
  'Pain Relief':            '#ef4444',
  'Antibiotics':            '#f59e0b',
  'Chronic Disease':        '#3b82f6',
  'Baby & Mother':          '#ec4899',
  'Skincare':               '#8b5cf6',
  'Other':                  '#64748b',
};

// ── Helpers ────────────────────────────────────────────────────────────
/**
 * Build an array of {date, current, previous} revenue data points.
 * `step` = 1 for daily, 7 for weekly.
 */
const buildRevenueTrend = (totalDays, step, baseRevenue, volatility, growthFactor = 1.15) => {
  const points = [];
  const today = new Date('2026-04-29');
  for (let i = totalDays; i >= 0; i -= step) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    // Use seeded pseudo-random to keep values stable between re-renders
    const seed = (i + 1) * 17 + baseRevenue;
    const jitter = (((seed * 1234567) % 1000) / 1000 - 0.5) * volatility;
    const current  = Math.max(0, Math.round(baseRevenue + jitter));
    const previous = Math.max(0, Math.round((baseRevenue + jitter) / growthFactor));
    points.push({ date: label, current, previous });
  }
  return points;
};

/** Build a deterministic 7-point sparkline */
const sparkline = (base, up = false, down = false) => {
  const arr = [];
  let v = base;
  for (let i = 0; i < 7; i++) {
    const delta = ((i * 31 + base * 7) % 15) - 7;
    if (up)   v = Math.max(1, v + Math.abs(delta));
    else if (down) v = Math.max(1, v - Math.abs(delta) * 0.5);
    else      v = Math.max(1, v + delta);
    arr.push(Math.round(v));
  }
  return arr;
};

const trendDir = (data) => {
  const last = data[data.length - 1];
  const prev = data[data.length - 3] || data[0];
  if (last > prev * 1.08) return 'up';
  if (last < prev * 0.92) return 'down';
  return 'flat';
};

// ── Product master list (shared across periods, multiplied for scaling) ──
const buildProductTable = (multiplier) => {
  const raw = [
    // id, name, category, baseUnits, basePrice, stockLeft, reorderPoint, trend
    ['MED-001', 'Panadol 500mg',        'Pain Relief',            120, 90,   340, 100, 'up'],
    ['MED-002', 'Vitamin D3 1000IU',    'Vitamins & Supplements', 98,  85,   210, 80,  'up'],
    ['MED-003', 'Brufen 400mg',         'Pain Relief',            75,  110,  180, 70,  'up'],
    ['MED-004', 'Augmentin 625mg',      'Antibiotics',            64,  420,  45,  60,  'down'],
    ['MED-005', 'Cetirizine 10mg',      'Pain Relief',            88,  65,   230, 80,  'flat'],
    ['MED-006', 'Omeprazole 20mg',      'Chronic Disease',        110, 95,   290, 90,  'up'],
    ['MED-007', 'Amoxil 500mg',         'Antibiotics',            60,  280,  38,  55,  'down'],
    ['MED-008', 'Atorvastatin 20mg',    'Chronic Disease',        90,  180,  155, 60,  'flat'],
    ['MED-009', 'Metformin 500mg',      'Chronic Disease',        105, 75,   310, 90,  'up'],
    ['MED-010', 'Surbex Z',             'Vitamins & Supplements', 82,  120,  195, 70,  'up'],
    ['MED-011', 'Calpol 250mg',         'Baby & Mother',          70,  95,   160, 60,  'flat'],
    ['MED-012', 'Prenatal Vitamins',    'Baby & Mother',          55,  185,  90,  50,  'up'],
    ['MED-013', 'Calamine Lotion',      'Skincare',               30,  240,  75,  40,  'down'],
    ['MED-014', 'Loratadine 10mg',      'Pain Relief',            68,  60,   220, 75,  'flat'],
    ['MED-015', 'Zinc Sulphate Syrup',  'Vitamins & Supplements', 20,  75,   85,  40,  'down'],
    ['MED-016', 'Folic Acid 5mg',       'Baby & Mother',          95,  45,   380, 100, 'up'],
    ['MED-017', 'Gaviscon Advance',     'Chronic Disease',        45,  310,  60,  50,  'flat'],
    ['MED-018', 'Thyroxine 50mcg',      'Chronic Disease',        80,  90,   200, 70,  'up'],
    ['MED-019', 'Ecosprin 75mg',        'Chronic Disease',        115, 55,   450, 100, 'up'],
    ['MED-020', 'Ensure Powder',        'Vitamins & Supplements', 35,  850,  55,  30,  'down'],
  ];

  return raw.map(([id, name, category, baseUnits, basePrice, stockLeft, reorderPoint, trend]) => {
    const units   = Math.round(baseUnits * multiplier);
    const revenue = units * basePrice;
    const td      = sparkline(Math.round(baseUnits / 7), trend === 'up', trend === 'down');
    return {
      id, name, category,
      unitsSold:    units,
      revenue,
      stockLeft,
      reorderPoint,
      trendData:    td,
      trendDirection: trendDir(td),
    };
  });
};

// ── Category breakdowns ─────────────────────────────────────────────────
const buildCategory = (base) =>
  Object.entries(CATEGORY_COLORS).map(([name, color], i) => ({
    name, color,
    value: Math.round(base * ([1.4, 1.2, 0.8, 1.0, 0.7, 0.6, 0.5][i])),
  }));

// ── Slow movers (static, same across periods) ──────────────────────────
export const slowMoversList = [
  {
    id: 'SM-001',
    name: 'Zinc Sulphate Syrup',
    category: 'Vitamins & Supplements',
    lastSoldDaysAgo: 47,
    stockOnHand: 85,
    estimatedValue: 6375,
    aiSuggestion: '💡 Try 15% off — similar items saw 2.8× sales lift',
  },
  {
    id: 'SM-002',
    name: 'Premium Hair Serum',
    category: 'Skincare',
    lastSoldDaysAgo: 65,
    stockOnHand: 120,
    estimatedValue: 42000,
    aiSuggestion: '💡 20% discount — high price elasticity product',
  },
  {
    id: 'SM-003',
    name: 'Knee Support Brace L',
    category: 'Other',
    lastSoldDaysAgo: 32,
    stockOnHand: 14,
    estimatedValue: 10500,
    aiSuggestion: '💡 Bundle with pain relief creams for combo offer',
  },
  {
    id: 'SM-004',
    name: 'Organic Herbal Tea',
    category: 'Vitamins & Supplements',
    lastSoldDaysAgo: 88,
    stockOnHand: 45,
    estimatedValue: 13500,
    aiSuggestion: '💡 Approaching expiry (4 months) — run clearance now',
  },
  {
    id: 'SM-005',
    name: 'Adult Diapers XL',
    category: 'Other',
    lastSoldDaysAgo: 40,
    stockOnHand: 60,
    estimatedValue: 54000,
    aiSuggestion: '💡 Quantity discount: Buy 2 Get 10% off',
  },
  {
    id: 'SM-006',
    name: 'Digital Thermometer',
    category: 'Other',
    lastSoldDaysAgo: 55,
    stockOnHand: 35,
    estimatedValue: 28000,
    aiSuggestion: '💡 Add to flu-season bundle alongside ORS & Panadol',
  },
];

// ── Period data ─────────────────────────────────────────────────────────
const p7   = buildProductTable(1);
const p30  = buildProductTable(4);
const p90  = buildProductTable(12);

export const salesData = {
  last7: {
    periodLabel: 'Showing data from Apr 23 – Apr 29, 2026',
    kpis: {
      revenue:  { value: 84500,   delta:  5.2 },
      units:    { value: 680,     delta:  2.1 },
      aov:      { value: 124,     delta:  3.0 },
      lowStock: { value: 8,       delta: -2 },   // negative = fewer alerts (good)
    },
    revenueTrend:      buildRevenueTrend(6,  1, 12000, 3000, 1.12),
    topProducts:       [...p7].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    bottomProducts:    [...p7].sort((a, b) => a.revenue - b.revenue).slice(0, 5),
    categoryBreakdown: buildCategory(12000),
    productTable:      p7,
    slowMovers:        slowMoversList.map(s => ({ ...s, stockOnHand: Math.round(s.stockOnHand * 0.9) })),
  },
  last30: {
    periodLabel: 'Showing data from Apr 1 – Apr 29, 2026',
    kpis: {
      revenue:  { value: 425600, delta:  12.5 },
      units:    { value: 3450,   delta:   8.4 },
      aov:      { value: 123,    delta:   3.8 },
      lowStock: { value: 18,     delta:   4 },
    },
    revenueTrend:      buildRevenueTrend(29, 1, 14500, 5000, 1.15),
    topProducts:       [...p30].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    bottomProducts:    [...p30].sort((a, b) => a.revenue - b.revenue).slice(0, 5),
    categoryBreakdown: buildCategory(55000),
    productTable:      p30,
    slowMovers:        slowMoversList,
  },
  last90: {
    periodLabel: 'Showing data from Jan 30 – Apr 29, 2026',
    kpis: {
      revenue:  { value: 1285000, delta: -2.4 },
      units:    { value: 10240,   delta: -1.2 },
      aov:      { value: 125,     delta: -1.2 },
      lowStock: { value: 24,      delta:  6 },
    },
    // Weekly data points for 90-day view
    revenueTrend:      buildRevenueTrend(84, 7, 90000, 18000, 1.08),
    topProducts:       [...p90].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    bottomProducts:    [...p90].sort((a, b) => a.revenue - b.revenue).slice(0, 5),
    categoryBreakdown: buildCategory(160000),
    productTable:      p90,
    slowMovers:        slowMoversList.map(s => ({ ...s, stockOnHand: Math.round(s.stockOnHand * 1.2) })),
  },
};

// ── AI recommendations pool (10+ items, shuffled on re-generate) ────────
// Each item maps to a colored left-border type.
export const aiRecommendationsPool = [
  {
    id: 1,
    type: 'stock_up',
    icon: '📈',
    color: '#10b981',  // green
    title: 'Stock up on Vitamin D 1000IU',
    detail: 'Demand rising 40% in the past 14 days — reorder before May 5 to avoid stockout.',
    tag: 'Trending',
  },
  {
    id: 2,
    type: 'bundle',
    icon: '🎁',
    color: '#3b82f6',  // blue
    title: 'Bundle Paracetamol + ORS Sachet',
    detail: 'Flu season bundle projected to deliver 25% revenue uplift. Create SKU now.',
    tag: 'Promotion',
  },
  {
    id: 3,
    type: 'demand_spike',
    icon: '🔥',
    color: '#f97316',  // orange
    title: 'Brufen 400mg Demand Spike',
    detail: 'Showing 3× demand spike this week — check reorder status immediately.',
    tag: 'Inventory',
  },
  {
    id: 4,
    type: 'overstock',
    icon: '⚠️',
    color: '#f59e0b',  // amber
    title: 'Cetirizine 10mg Overstocked',
    detail: 'Consider 15% promo to clear 230 units before expiry date in 6 weeks.',
    tag: 'Promotion',
  },
  {
    id: 5,
    type: 'seasonal',
    icon: '💊',
    color: '#8b5cf6',  // purple
    title: 'Prenatal Vitamins Trending Up',
    detail: 'Spring season trend — increase stock by 50 units ahead of peak demand.',
    tag: 'Seasonal',
  },
  {
    id: 6,
    type: 'bundle',
    icon: '🎁',
    color: '#3b82f6',
    title: 'Calcium + Vitamin D Combo Bundle',
    detail: '68% co-purchase rate detected — create a combo SKU for 12% AOV lift.',
    tag: 'Promotion',
  },
  {
    id: 7,
    type: 'stock_up',
    icon: '📈',
    color: '#10b981',
    title: 'Reorder Augmentin 625mg',
    detail: 'Below minimum safety stock (45 units vs 60 reorder point). Order 100 units.',
    tag: 'Inventory',
  },
  {
    id: 8,
    type: 'demand_spike',
    icon: '🔥',
    color: '#f97316',
    title: 'Surbex Z — Top Performer',
    detail: '#1 seller this week. Increase shelf visibility and run social media push.',
    tag: 'Trending',
  },
  {
    id: 9,
    type: 'overstock',
    icon: '⚠️',
    color: '#f59e0b',
    title: 'Calamine Lotion Slow Moving',
    detail: 'Winter season over — move 75 units to clearance aisle with 20% discount.',
    tag: 'Seasonal',
  },
  {
    id: 10,
    type: 'seasonal',
    icon: '💊',
    color: '#8b5cf6',
    title: 'Allergy Medications Push',
    detail: 'Pollen counts forecast to peak next week — front-load allergy meds now.',
    tag: 'Seasonal',
  },
  {
    id: 11,
    type: 'stock_up',
    icon: '📈',
    color: '#10b981',
    title: 'Metformin 500mg Re-order Alert',
    detail: 'Chronic patients refilling faster this month — 28-day supply running low.',
    tag: 'Inventory',
  },
  {
    id: 12,
    type: 'bundle',
    icon: '🎁',
    color: '#3b82f6',
    title: 'ORS + Electrolyte Bundle',
    detail: 'Summer heat wave approaching — pre-position hydration bundles at checkout.',
    tag: 'Promotion',
  },
];
