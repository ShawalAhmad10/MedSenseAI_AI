import api from './api';

const delay =
  (ms) =>
    new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          ms
        )
    );

// Existing EUC-07 AI Assistant behaviour is intentionally
// left separate from the EUC-08 pharmacist consultation flow.
const pharmacyResponses = {
  'low stock': [
    'You currently have items below minimum stock levels. Check the Inventory page for details.',
    'Low stock alert detected. Priority reorder needed for critical medications.',
  ],
  'today sales': [
    "Today's sales are tracking well. Check the Analytics page for a full breakdown.",
    'Revenue is up today. Visit Analytics for detailed sales metrics.',
  ],
  'top meds': [
    "This month's top sellers are visible in the Analytics dashboard under Medicine Demand.",
    'Leading medications by volume are shown in your Analytics report.',
  ],
};

const defaultResponses = [
  'Based on your pharmacy data, I can help with inventory management, sales analysis, drug interaction checks, and prescription workflows. What would you like to know?',
  "I'm analyzing your pharmacy data. For detailed insights, try asking about 'low stock', 'today sales', or 'top meds'.",
  'I can help you optimize your pharmacy operations. Ask me about stock levels, revenue trends, or patient prescriptions.',
];

export const consultationService = {
  async askAI(message) {
    try {
      const result =
        await api.post(
          '/ai/ask',
          { message }
        );

      return (
        result.data?.reply ||
        result.data?.message ||
        defaultResponses[0]
      );
    } catch {
      await delay(1200);

      const lower =
        String(
          message || ''
        ).toLowerCase();

      for (
        const [key, responses]
        of Object.entries(
          pharmacyResponses
        )
      ) {
        if (
          lower.includes(key)
        ) {
          return responses[0];
        }
      }

      return defaultResponses[0];
    }
  },

  async getQueue(
    limit = 100
  ) {
    const response =
      await api.get(
        '/consultations/queue',
        {
          params: {
            limit,
          },
        }
      );

    return Array.isArray(
      response.data?.data
    )
      ? response.data.data
      : [];
  },

  async getConsultation(
    consultationId
  ) {
    const response =
      await api.get(
        `/consultations/${consultationId}`
      );

    return response.data?.data ||
      null;
  },

  async addGuidance(
    consultationId,
    guidance
  ) {
    const response =
      await api.patch(
        `/consultations/${consultationId}/guidance`,
        {
          guidance:
            String(
              guidance || ''
            ).trim(),
        }
      );

    return response.data?.data ||
      null;
  },

  async decideConsultation(
    consultationId,
    decision,
    guidance
  ) {
    const normalizedDecision =
      String(
        decision || ''
      )
        .trim()
        .toLowerCase();

    if (
      normalizedDecision !==
        'approved' &&
      normalizedDecision !==
        'rejected'
    ) {
      throw new Error(
        'Consultation decision must be approved or rejected.'
      );
    }

    const response =
      await api.patch(
        `/consultations/${consultationId}/decision`,
        {
          decision:
            normalizedDecision,
          guidance:
            String(
              guidance || ''
            ).trim(),
        }
      );

    return response.data?.data ||
      null;
  },
};

export default consultationService;
