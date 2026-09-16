// src/utils/contextPanelData.js

export const contextPanelData = {
  today: {
    orders: 42,
    revenue: 18400,
    pendingAlerts: 5,
    activeCustomers: 128
  },
  inventoryAlerts: [
    { id: 1, type: 'critical', name: 'Zinc Sulphate Syrup', detail: '12 units (critical)', color: 'var(--red)' },
    { id: 2, type: 'low', name: 'Vitamin D 1000IU', detail: '28 units (low)', color: 'var(--amber)' },
    { id: 3, type: 'low', name: 'ORS Sachet', detail: '45 units (low)', color: 'var(--amber)' },
    { id: 4, type: 'critical', name: 'Amoxicillin', detail: 'expires in 8 days', color: 'var(--red)' },
    { id: 5, type: 'low', name: 'Cetirizine', detail: 'expires in 22 days', color: 'var(--amber)' }
  ],
  refillDue: [
    { id: 1, name: 'Amna Rana', lastOrder: 12, medicine: 'Metformin 500mg' },
    { id: 2, name: 'Zainab Ali', lastOrder: 8, medicine: 'Panadol 500mg' },
    { id: 3, name: 'Omar Khan', lastOrder: 15, medicine: 'Loratadine 10mg' },
    { id: 4, name: 'Sara Ahmed', lastOrder: 5, medicine: 'Vitamin C' }
  ]
};
