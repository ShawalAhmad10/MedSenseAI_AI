import axios from 'axios';
import { readCustomerAuth } from './customerAuthSession';

async function request(method, path = '', data) {
  const token = readCustomerAuth()?.token;
  if (!token) throw new Error('Please sign in to manage subscriptions.');
  try {
    const response = await axios({ method, url: `/api/subscriptions${path}`, data,
      headers: { Authorization: `Bearer ${token}` }, timeout: 90000 });
    return response.data.data;
  } catch (error) { throw new Error(error.response?.data?.message || 'Could not complete the subscription request. Please try again.'); }
}
export const getSubscriptionConfig = () => request('GET', '/config');
export const getSubscriptions = () => request('GET');
export const createSubscription = interval => request('POST', '', { interval });
export const refreshSubscription = id => request('POST', `/${id}/refresh`);
export const cancelSubscription = id => request('POST', `/${id}/cancel`);
export const linkSubscriptionRefill = (id, reminder, days) => request('POST', `/${id}/refills/${reminder}`, { recurrence_days: days });
export const unlinkSubscriptionRefill = reminder => request('DELETE', `/refills/${reminder}`);

export function safePayPalApprovalURL(value, environment) {
  const url = new URL(value);
  const expectedHost = environment === 'sandbox' ? 'www.sandbox.paypal.com' : 'www.paypal.com';
  if (url.protocol !== 'https:' || url.hostname !== expectedHost || url.port || url.username || url.password) {
    throw new Error('Invalid PayPal approval link. Please refresh and try again.');
  }
  return url.href;
}
