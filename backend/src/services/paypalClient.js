const axios = require('axios');

function paypalError(code, message, status = 503) {
  return Object.assign(new Error(message), { code, status });
}

function createPayPalClient({ env = process.env, http = axios, now = Date.now } = {}) {
  let cachedToken;
  let tokenExpires = 0;
  let pendingToken;
  function webhookURL() {
    const value = env.PAYPAL_PUBLIC_URL || env.PAYPAL_PUBLIC_BASE_URL;
    if (!value?.trim()) return null;
    let url;
    try { url = new URL(value.trim()); } catch { throw paypalError('PAYPAL_WEBHOOK_URL_INVALID', 'PayPal public URL must be a valid HTTPS backend URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
        ['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.hostname.endsWith('.neon.tech')) {
      throw paypalError('PAYPAL_WEBHOOK_URL_INVALID', 'PayPal public URL must point to a public HTTPS backend.');
    }
    if (url.pathname === '/') url.pathname = '/api/paypal/webhook';
    if (!['/api/paypal/webhook','/api/subscriptions/webhook'].includes(url.pathname)) {
      throw paypalError('PAYPAL_WEBHOOK_URL_INVALID', 'Webhook URL must end in /api/paypal/webhook.');
    }
    return url.href;
  }
  function config({ plan = false, webhook = false, interval = 'monthly' } = {}) {
    const mode = (env.PAYPAL_MODE || 'sandbox').trim().toLowerCase();
    if (!['sandbox', 'live'].includes(mode)) throw paypalError('PAYPAL_CONFIG_INVALID', 'PayPal mode must be sandbox or live.');
    if (!env.PAYPAL_CLIENT_ID?.trim() || !env.PAYPAL_CLIENT_SECRET?.trim()) {
      throw paypalError('PAYPAL_NOT_CONFIGURED', 'PayPal credentials have not been configured.');
    }
    if (!['daily', 'weekly', 'monthly'].includes(interval)) throw paypalError('PAYPAL_INTERVAL_INVALID', 'Choose a daily, weekly or monthly plan.', 400);
    const planId = (env[`PAYPAL_${interval.toUpperCase()}_PLAN_ID`] || (interval === 'monthly' ? env.PAYPAL_PLAN_ID : ''))?.trim();
    if (plan && !/^P-[A-Z0-9]+$/.test(planId || '')) {
      throw paypalError('PAYPAL_PLAN_MISSING', 'The subscription plan is not configured yet.');
    }
    if (webhook && !env.PAYPAL_WEBHOOK_ID?.trim()) {
      throw paypalError('PAYPAL_WEBHOOK_MISSING', 'The PayPal webhook is not configured yet.');
    }
    const baseURL = mode === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
    if (env.PAYPAL_BASE_URL && env.PAYPAL_BASE_URL.trim().replace(/\/$/, '') !== baseURL) {
      throw paypalError('PAYPAL_BASE_URL_INVALID', 'PayPal base URL does not match Sandbox/Live mode.');
    }
    return { mode, planId, baseURL };
  }
  async function accessToken() {
    const { baseURL } = config();
    if (cachedToken && now() < tokenExpires) return cachedToken;
    if (!pendingToken) pendingToken = (async () => {
      try {
        const { data } = await http.request({ method: 'POST', url: `${baseURL}/v1/oauth2/token`,
          auth: { username: env.PAYPAL_CLIENT_ID.trim(), password: env.PAYPAL_CLIENT_SECRET.trim() },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          data: 'grant_type=client_credentials', timeout: 15000, maxRedirects: 0 });
        if (!data.access_token) throw new Error('No token');
        cachedToken = data.access_token;
        tokenExpires = now() + Math.max(0, Number(data.expires_in || 0) - 60) * 1000;
        return cachedToken;
      } catch (error) {
        if (!error.response) throw paypalError('PAYPAL_UNREACHABLE', 'The backend could not reach PayPal. Check network connectivity.');
        throw Object.assign(paypalError('PAYPAL_AUTH_FAILED', 'PayPal credentials could not be verified. Check the app credentials and Sandbox/Live mode.'),
          { providerStatus: error.response.status, providerCode: error.response.data?.error === 'invalid_client' ? 'invalid_client' : 'authentication_failed' });
      }
      finally { pendingToken = undefined; }
    })();
    return pendingToken;
  }
  async function request(method, path, data, requestId) {
    const { baseURL } = config();
    const token = await accessToken();
    try {
      const response = await http.request({ method, url: `${baseURL}${path}`, data,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation',
          ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) }, timeout: 20000, maxRedirects: 0 });
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) { cachedToken = undefined; tokenExpires = 0; }
      throw paypalError('PAYPAL_REQUEST_FAILED', 'PayPal could not complete this request. Please try again.', 502);
    }
  }
  async function verifyWebhook(headers, event) {
    config({ webhook: true });
    const fields = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'];
    if (fields.some(field => typeof headers[field] !== 'string' || !headers[field])) return false;
    let certificate;
    try { certificate = new URL(headers['paypal-cert-url']); } catch { return false; }
    const allowedHosts = config().mode === 'sandbox' ? ['api.sandbox.paypal.com','api-m.sandbox.paypal.com'] : ['api.paypal.com','api-m.paypal.com'];
    if (certificate.protocol !== 'https:' || !allowedHosts.includes(certificate.hostname) || certificate.port || certificate.username || certificate.password || !certificate.pathname.startsWith('/v1/notifications/certs/')) return false;
    const result = await request('POST', '/v1/notifications/verify-webhook-signature', {
      auth_algo: headers['paypal-auth-algo'], cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'], transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'], webhook_id: env.PAYPAL_WEBHOOK_ID.trim(), webhook_event: event,
    });
    return result.verification_status === 'SUCCESS';
  }
  return { config, request, accessToken, verifyWebhook, webhookURL };
}

module.exports = { createPayPalClient, paypalError, paypalClient: createPayPalClient() };
