// src/services/consultationService.js
import api from './api';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Local AI responses (used as fallback when backend AI is unavailable) ──────
const pharmacyResponses = {
  'low stock': [
    'You currently have items below minimum stock levels. Check the Inventory page for details.',
    'Low stock alert detected. Priority reorder needed for critical medications.',
  ],
  'today sales': [
    "Today's sales are tracking well. Check the Analytics page for a full breakdown.",
    "Revenue is up today. Visit Analytics for detailed sales metrics.",
  ],
  'top meds': [
    'This month\'s top sellers are visible in the Analytics dashboard under Medicine Demand.',
    'Leading medications by volume are shown in your Analytics report.',
  ],
};

const defaultResponses = [
  'Based on your pharmacy data, I can help with inventory management, sales analysis, drug interaction checks, and prescription workflows. What would you like to know?',
  "I'm analyzing your pharmacy data. For detailed insights, try asking about 'low stock', 'today sales', or 'top meds'.",
  'I can help you optimize your pharmacy operations. Ask me about stock levels, revenue trends, or patient prescriptions.',
  'Your pharmacy is performing well today! Would you like a detailed breakdown of any metric?',
];

export const consultationService = {
  /**
   * Ask the AI assistant a question.
   * Tries the backend first; falls back to local responses if unavailable.
   */
  async askAI(message) {
    try {
      const result = await api.post('/ai/ask', { message });
      return result.data?.reply || result.data?.message || defaultResponses[0];
    } catch {
      // Fallback to local keyword matching
      await delay(1200 + Math.random() * 800);
      const lower = message.toLowerCase();
      for (const [key, responses] of Object.entries(pharmacyResponses)) {
        if (lower.includes(key)) {
          return responses[Math.floor(Math.random() * responses.length)];
        }
      }
      return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
    }
  },

  /** Get consultation queue (pharmacist) */
  getQueue: () =>
    api.get('/consultations/queue').then((r) => r.data),

  /** Send a message in a consultation */
  sendMessage: (consultationId, message) =>
    api.post(`/consultations/${consultationId}/messages`, { message }).then((r) => r.data),

  /** Resolve/close a consultation */
  resolve: (consultationId) =>
    api.patch(`/consultations/${consultationId}/resolve`).then((r) => r.data),
};

export default consultationService;
