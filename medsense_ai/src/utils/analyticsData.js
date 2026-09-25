// src/utils/analyticsData.js

export const analyticsData = {
  last7: {
    kpis: {
      totalRevenue: { value: 84200, delta: +12.4, spark: [9, 11, 10, 13, 12, 14, 15] },
      totalOrders: { value: 312, delta: +8.1, spark: [38, 42, 40, 48, 44, 52, 48] },
      avgOrderValue: { value: 270, delta: -2.3, spark: [275, 268, 272, 265, 270, 268, 272] },
      customerRetention: { value: 71.2, delta: +3.1 }
    },
    revenueTrend: {
      daily: [
        { label: "Apr 23", current: 9800, previous: 8600 },
        { label: "Apr 24", current: 11200, previous: 9200 },
        { label: "Apr 25", current: 10500, previous: 10100 },
        { label: "Apr 26", current: 13000, previous: 11000 },
        { label: "Apr 27", current: 12100, previous: 12500 },
        { label: "Apr 28", current: 14500, previous: 11800 },
        { label: "Apr 29", current: 15100, previous: 12900 },
      ],
      weekly: [{ label: "Week 17", current: 84200, previous: 74100 }],
      monthly: [{ label: "Apr", current: 84200, previous: 74100 }]
    },
    topMedicines: [
      { name: "Panadol 500mg", units: 312, revenue: 14040, pctOfTotal: 18.5 },
      { name: "ORS Sachet", units: 280, revenue: 8400, pctOfTotal: 16.2 },
      { name: "Amoxicillin 250mg", units: 245, revenue: 12250, pctOfTotal: 14.1 },
      { name: "Metformin 500mg", units: 210, revenue: 6300, pctOfTotal: 12.3 },
      { name: "Loratadine 10mg", units: 190, revenue: 5700, pctOfTotal: 11.2 },
      { name: "Omeprazole 20mg", units: 165, revenue: 8250, pctOfTotal: 9.8 },
      { name: "Paracetamol Syrup", units: 142, revenue: 4260, pctOfTotal: 8.5 },
      { name: "Vitamin C 500mg", units: 120, revenue: 3600, pctOfTotal: 7.2 },
      { name: "Ibuprofen 400mg", units: 98, revenue: 2940, pctOfTotal: 5.8 },
      { name: "Cetirizine 10mg", units: 85, revenue: 2550, pctOfTotal: 4.2 },
    ],
    severityBreakdown: [
      { name: "Informational", value: 420, color: "var(--severity-info)" },
      { name: "Low Severity", value: 185, color: "var(--green)" },
      { name: "Moderate", value: 92, color: "var(--amber)" },
      { name: "High Severity", value: 34, color: "#f97316" }, // Orange
      { name: "Critical", value: 8, color: "var(--severity-critical)" },
    ],
    customerBehaviour: [
      {
        segment: "New Customers",
        count: 142,
        pctOfTotal: 38.2,
        avgSession: "3m 12s",
        sessionSeconds: 192,
        chatbotQueries: 198,
        queriesPerUser: 1.4,
        topTopic: "Medicine availability",
        conversionRate: 28.4,
        trend: +14.2
      },
      {
        segment: "Returning Customers",
        count: 185,
        pctOfTotal: 49.8,
        avgSession: "5m 45s",
        sessionSeconds: 345,
        chatbotQueries: 412,
        queriesPerUser: 2.2,
        topTopic: "Order status",
        conversionRate: 42.1,
        trend: +6.5
      },
      {
        segment: "Inactive (30+ days)",
        count: 32,
        pctOfTotal: 8.6,
        avgSession: "1m 15s",
        sessionSeconds: 75,
        chatbotQueries: 12,
        queriesPerUser: 0.4,
        topTopic: "Login issues",
        conversionRate: 5.2,
        trend: -2.1
      },
      {
        segment: "VIP (top 10% spend)",
        count: 12,
        pctOfTotal: 3.2,
        avgSession: "8m 20s",
        sessionSeconds: 500,
        chatbotQueries: 85,
        queriesPerUser: 7.1,
        topTopic: "Dosage guidance",
        conversionRate: 68.5,
        trend: +2.4
      }
    ]
  },
  last30: {
    kpis: {
      totalRevenue: { value: 342000, delta: +18.2, spark: [45, 48, 52, 49, 55, 62, 68, 65, 72, 70, 75, 82] },
      totalOrders: { value: 1245, delta: +11.5, spark: [102, 115, 108, 120, 135, 142, 128, 150, 145, 160, 155, 172] },
      avgOrderValue: { value: 275, delta: +3.2, spark: [265, 270, 268, 272, 275, 278, 274, 280, 276, 282, 279, 285] },
      customerRetention: { value: 72.4, delta: +1.8 }
    },
    revenueTrend: {
      daily: [/* Simplified for 30d, typically weekly toggle is used */],
      weekly: [
        { label: "Week 14", current: 78000, previous: 72000 },
        { label: "Week 15", current: 82000, previous: 75000 },
        { label: "Week 16", current: 89000, previous: 81000 },
        { label: "Week 17", current: 93000, previous: 85000 },
      ],
      monthly: [{ label: "Apr", current: 342000, previous: 289000 }]
    },
    topMedicines: [
      { name: "Panadol 500mg", units: 1245, revenue: 56025, pctOfTotal: 19.2 },
      { name: "ORS Sachet", units: 1120, revenue: 33600, pctOfTotal: 17.5 },
      { name: "Amoxicillin 250mg", units: 980, revenue: 49000, pctOfTotal: 15.1 },
      { name: "Metformin 500mg", units: 840, revenue: 25200, pctOfTotal: 13.2 },
      { name: "Loratadine 10mg", units: 760, revenue: 22800, pctOfTotal: 11.8 },
      { name: "Omeprazole 20mg", units: 650, revenue: 32500, pctOfTotal: 10.1 },
      { name: "Paracetamol Syrup", units: 580, revenue: 17400, pctOfTotal: 8.9 },
      { name: "Vitamin C 500mg", units: 480, revenue: 14400, pctOfTotal: 7.4 },
      { name: "Ibuprofen 400mg", units: 390, revenue: 11700, pctOfTotal: 6.1 },
      { name: "Cetirizine 10mg", units: 340, revenue: 10200, pctOfTotal: 5.2 },
    ],
    severityBreakdown: [
      { name: "Informational", value: 1680, color: "var(--severity-info)" },
      { name: "Low Severity", value: 740, color: "var(--green)" },
      { name: "Moderate", value: 368, color: "var(--amber)" },
      { name: "High Severity", value: 136, color: "#f97316" },
      { name: "Critical", value: 32, color: "var(--severity-critical)" },
    ],
    customerBehaviour: [
      {
        segment: "New Customers",
        count: 568,
        pctOfTotal: 34.2,
        avgSession: "3m 45s",
        sessionSeconds: 225,
        chatbotQueries: 812,
        queriesPerUser: 1.4,
        topTopic: "Medicine availability",
        conversionRate: 26.5,
        trend: +8.4
      },
      {
        segment: "Returning Customers",
        count: 842,
        pctOfTotal: 50.8,
        avgSession: "6m 12s",
        sessionSeconds: 372,
        chatbotQueries: 1845,
        queriesPerUser: 2.2,
        topTopic: "Order status",
        conversionRate: 44.2,
        trend: +12.1
      },
      {
        segment: "Inactive (30+ days)",
        count: 185,
        pctOfTotal: 11.2,
        avgSession: "1m 42s",
        sessionSeconds: 102,
        chatbotQueries: 112,
        queriesPerUser: 0.6,
        topTopic: "Account login",
        conversionRate: 4.8,
        trend: -5.2
      },
      {
        segment: "VIP (top 10% spend)",
        count: 64,
        pctOfTotal: 3.8,
        avgSession: "9m 15s",
        sessionSeconds: 555,
        chatbotQueries: 512,
        queriesPerUser: 8.0,
        topTopic: "Refill reminders",
        conversionRate: 72.1,
        trend: +4.2
      }
    ]
  },
  last90: {
    kpis: {
      totalRevenue: { value: 1052000, delta: +22.5, spark: [120, 135, 142, 138, 155, 162, 175, 168, 182, 195, 210, 205] },
      totalOrders: { value: 3840, delta: +15.2, spark: [280, 310, 295, 320, 345, 362, 338, 385, 375, 410, 395, 425] },
      avgOrderValue: { value: 274, delta: +1.5, spark: [270, 272, 271, 273, 275, 274, 276, 275, 277, 276, 278, 274] },
      customerRetention: { value: 74.8, delta: +4.2 }
    },
    revenueTrend: {
      daily: [],
      weekly: [
        { label: "Mar W1", current: 75000, previous: 68000 },
        { label: "Mar W2", current: 82000, previous: 74000 },
        { label: "Mar W3", current: 79000, previous: 71000 },
        { label: "Mar W4", current: 88000, previous: 79000 },
        { label: "Apr W1", current: 92000, previous: 83000 },
        { label: "Apr W2", current: 95000, previous: 86000 },
        { label: "Apr W3", current: 98000, previous: 89000 },
        { label: "Apr W4", current: 102000, previous: 92000 },
      ],
      monthly: [
        { label: "Feb", current: 310000, previous: 285000 },
        { label: "Mar", current: 335000, previous: 305000 },
        { label: "Apr", current: 407000, previous: 342000 },
      ]
    },
    topMedicines: [
      { name: "Panadol 500mg", units: 3840, revenue: 172800, pctOfTotal: 20.1 },
      { name: "ORS Sachet", units: 3420, revenue: 102600, pctOfTotal: 17.8 },
      { name: "Amoxicillin 250mg", units: 2950, revenue: 147500, pctOfTotal: 15.4 },
      { name: "Metformin 500mg", units: 2540, revenue: 76200, pctOfTotal: 13.2 },
      { name: "Loratadine 10mg", units: 2120, revenue: 63600, pctOfTotal: 11.1 },
      { name: "Omeprazole 20mg", units: 1850, revenue: 92500, pctOfTotal: 9.6 },
      { name: "Paracetamol Syrup", units: 1540, revenue: 46200, pctOfTotal: 8.0 },
      { name: "Vitamin C 500mg", units: 1280, revenue: 38400, pctOfTotal: 6.7 },
      { name: "Ibuprofen 400mg", units: 1020, revenue: 30600, pctOfTotal: 5.3 },
      { name: "Cetirizine 10mg", units: 940, revenue: 28200, pctOfTotal: 4.9 },
    ],
    severityBreakdown: [
      { name: "Informational", value: 5240, color: "var(--severity-info)" },
      { name: "Low Severity", value: 2180, color: "var(--green)" },
      { name: "Moderate", value: 1120, color: "var(--amber)" },
      { name: "High Severity", value: 412, color: "#f97316" },
      { name: "Critical", value: 95, color: "var(--severity-critical)" },
    ],
    customerBehaviour: [
      {
        segment: "New Customers",
        count: 1420,
        pctOfTotal: 32.5,
        avgSession: "4m 12s",
        sessionSeconds: 252,
        chatbotQueries: 2140,
        queriesPerUser: 1.5,
        topTopic: "Medicine availability",
        conversionRate: 25.8,
        trend: +5.2
      },
      {
        segment: "Returning Customers",
        count: 2240,
        pctOfTotal: 51.2,
        avgSession: "6m 45s",
        sessionSeconds: 405,
        chatbotQueries: 5840,
        queriesPerUser: 2.6,
        topTopic: "Order tracking",
        conversionRate: 46.5,
        trend: +9.4
      },
      {
        segment: "Inactive (30+ days)",
        count: 512,
        pctOfTotal: 11.7,
        avgSession: "1m 55s",
        sessionSeconds: 115,
        chatbotQueries: 312,
        queriesPerUser: 0.6,
        topTopic: "Account recovery",
        conversionRate: 4.2,
        trend: -12.4
      },
      {
        segment: "VIP (top 10% spend)",
        count: 215,
        pctOfTotal: 4.9,
        avgSession: "9m 45s",
        sessionSeconds: 585,
        chatbotQueries: 1840,
        queriesPerUser: 8.5,
        topTopic: "Bulk order discount",
        conversionRate: 75.2,
        trend: +6.1
      }
    ]
  }
};
