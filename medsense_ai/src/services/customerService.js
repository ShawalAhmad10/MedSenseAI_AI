import axios from 'axios';
import { readPharmacistAuth } from './pharmacistAuthSession';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Helper to get auth token
function getPharmacistToken() {
  return readPharmacistAuth()?.token ?? null;
}

// List all customers
export async function listCustomers(params = {}) {
  try {
    const token = getPharmacistToken();
    const response = await axios.get(`${API_URL}/customer`, {
      params,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || { customers: [], stats: {} };
  } catch (error) {
    console.error('List customers error:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch customers');
  }
}

// Get customer details
export async function getCustomerDetails(customerId) {
  try {
    const token = getPharmacistToken();
    const response = await axios.get(`${API_URL}/customer/${customerId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    
    const data = response.data.data;
    
    return {
      customer: data.customer,
      account: data.account ? {
        accountNumber: data.account.accountId ? `ACC-${data.account.accountId}` : 'N/A',
        currentBalance: data.account.currentBalance || 0,
        creditLimit: data.account.creditLimit || 0,
        totalDebit: data.account.totalDebit || 0,
        totalCredit: data.account.totalCredit || 0,
        paymentTerms: data.account.paymentTerms || 30
      } : null,
      ledgerEntries: (data.ledgerEntries || data.ledger || []).map(entry => ({
        id:              entry.ledgerId || entry.id,
        transactionDate: entry.transactionDate,
        paymentDate:     entry.paymentDate || entry.transactionDate,
        transactionType: entry.transactionType,
        referenceNumber: entry.referenceNumber,
        debitAmount:     entry.debitAmount || 0,
        creditAmount:    entry.creditAmount || 0,
        amount:          entry.amount || entry.creditAmount || 0,
        balance:         entry.balance || 0,
        paymentMethod:   entry.paymentMethod || 'cash',
        paymentStatus:   entry.paymentStatus || (entry.transactionType === 'payment' ? 'paid' : 'pending'),
        description:     entry.description,
        notes:           entry.notes || entry.description,
        performedBy:     entry.performedBy
      }))
    };
  } catch (error) {
    console.error('Get customer details error:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch customer details');
  }
}

// Create customer
export async function createCustomer(data) {
  try {
    const token = getPharmacistToken();
    const response = await axios.post(`${API_URL}/customer`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Create customer error:', error);
    throw new Error(error.response?.data?.message || 'Failed to create customer');
  }
}

// Update customer
export async function updateCustomer(customerId, data) {
  try {
    const token = getPharmacistToken();
    const response = await axios.put(`${API_URL}/customer/${customerId}`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Update customer error:', error);
    throw new Error(error.response?.data?.message || 'Failed to update customer');
  }
}

// Get customer ledger
export async function getCustomerLedger(customerId, params = {}) {
  try {
    const token = getPharmacistToken();
    const response = await axios.get(`${API_URL}/customer/${customerId}/ledger`, {
      params,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || [];
  } catch (error) {
    console.error('Get customer ledger error:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch customer ledger');
  }
}

// Record payment
export async function recordPayment(customerId, data) {
  try {
    const token = getPharmacistToken();
    const response = await axios.post(`${API_URL}/customer/${customerId}/payment`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Record payment error:', error);
    throw new Error(error.response?.data?.message || 'Failed to record payment');
  }
}

// Customer Authentication Functions (for storefront)

// Customer Login
export async function loginCustomer(credentials) {
  try {
    const response = await axios.post(`${API_URL}/customer/auth/login`, credentials);
    return response.data;
  } catch (error) {
    console.error('Customer login error:', error);
    throw new Error(error.response?.data?.message || 'Login failed');
  }
}

// Customer Register
export async function registerCustomer(customerData) {
  try {
    const response = await axios.post(`${API_URL}/customer/auth/register`, customerData);
    return response.data;
  } catch (error) {
    console.error('Customer registration error:', error);
    throw new Error(error.response?.data?.message || 'Registration failed');
  }
}

export async function getCurrentCustomerProfile(token) {
  const response = await axios.get(`${API_URL}/customer/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}
