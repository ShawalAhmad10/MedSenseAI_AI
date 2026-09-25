const axios = require('axios');

const AI_SERVICE_URL = (
  process.env.AI_SERVICE_URL ||
  'http://127.0.0.1:8000'
).replace(/\/+$/, '');

const FUNNEL_EVENTS_URL =
  `${AI_SERVICE_URL}/api/v1/integrations/amna/funnel/events`;

const FUNNEL_METRICS_URL =
  `${AI_SERVICE_URL}/api/v1/integrations/amna/funnel/metrics`;

const FUNNEL_TIMEOUT_MS =
  Number(process.env.FUNNEL_TIMEOUT_MS || 5000);

function integrationHeaders() {
  const key =
    process.env.MEDSENSE_INTEGRATION_API_KEY ||
    process.env.INTEGRATION_API_KEY;

  if (!key) {
    return {};
  }

  return {
    'X-MedSense-Key': key
  };
}

async function publishEvent(event) {
  const response = await axios.post(
    FUNNEL_EVENTS_URL,
    event,
    {
      timeout: FUNNEL_TIMEOUT_MS,
      headers: integrationHeaders(),
      validateStatus: () => true
    }
  );

  return {
    httpStatus: response.status,
    result: response.data
  };
}

async function getMetrics(origin = 'partner_real') {
  const response = await axios.get(
    FUNNEL_METRICS_URL,
    {
      params: { origin },
      timeout: FUNNEL_TIMEOUT_MS,
      headers: integrationHeaders(),
      validateStatus: () => true
    }
  );

  return {
    httpStatus: response.status,
    result: response.data
  };
}

module.exports = {
  publishEvent,
  getMetrics
};