import axios from 'axios';
import { readCustomerAuth } from './customerAuthSession';

function authConfig() {
  const token = readCustomerAuth()?.token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 };
}
function accountError(error, fallback) {
  if (error.response?.status === 401) return new Error('Your session has expired. Please sign in again.');
  return new Error(error.response?.data?.message || error.message || fallback);
}
export async function getMyCustomerAccount() {
  try {
    const { data: response } = await axios.get('/api/customer/auth/account', authConfig());
    const data = response.data;
    return {
      customer: data.customer,
      account: data.account ? {
        accountNumber: `ACC-${data.account.accountId}`,
        currentBalance: data.account.currentBalance,
        totalDebit: data.account.totalDebit,
        totalCredit: data.account.totalCredit,
        creditLimit: data.account.creditLimit ?? 0,
        paymentTerms: data.account.paymentTerms ?? 0,
      } : null,
      ledgerEntries: (data.ledgerEntries || []).map(entry => ({ ...entry, id: entry.ledgerId })),
    };
  } catch (error) { throw accountError(error, 'Could not load your account details.'); }
}
export async function updateMyCustomerProfile(profile) {
  try {
    const { data } = await axios.put('/api/customer/auth/profile', {
      name: profile.name.trim(), phone: profile.phone.trim(), city: profile.city.trim(), address: profile.address.trim(),
    }, authConfig());
    return data.data;
  } catch (error) { throw accountError(error, 'Could not update your profile.'); }
}
