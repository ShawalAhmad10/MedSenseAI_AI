import axios from 'axios';

const API_URL = '/api/suppliers';
const AUTH_KEY = 'medsense_auth_user';

// Get auth token from localStorage or sessionStorage
const getAuthToken = () => {
  let authData = localStorage.getItem(AUTH_KEY);
  
  if (!authData) {
    authData = sessionStorage.getItem(AUTH_KEY);
  }
  
  if (authData) {
    try {
      const parsed = JSON.parse(authData);
      return parsed.token;
    } catch (error) {
      console.error('Error parsing auth data:', error);
      return null;
    }
  }
  
  return null;
};

// Create axios instance with auth header
const apiClient = axios.create({
  baseURL: API_URL,
});

// Add auth token to all requests
apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Get all suppliers
export async function listSuppliers() {
  try {
    const response = await apiClient.get('/');
    return response.data;
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    throw error;
  }
}

// Create new supplier
export async function createSupplier(payload) {
  try {
    const response = await apiClient.post('/', payload);
    return response.data;
  } catch (error) {
    console.error('Error creating supplier:', error);
    throw error;
  }
}

// Update supplier
export async function updateSupplier(id, payload) {
  try {
    const response = await apiClient.put(`/${id}`, payload);
    return response.data;
  } catch (error) {
    console.error('Error updating supplier:', error);
    throw error;
  }
}

// Delete supplier
export async function deleteSupplier(id) {
  try {
    await apiClient.delete(`/${id}`);
    return true;
  } catch (error) {
    console.error('Error deleting supplier:', error);
    throw error;
  }
}

// Toggle supplier status
export async function toggleSupplierStatus(id) {
  try {
    const response = await apiClient.patch(`/${id}/toggle-status`);
    return response.data;
  } catch (error) {
    console.error('Error toggling supplier status:', error);
    throw error;
  }
}

// Get all suppliers with account balances
export async function listSuppliersWithAccounts() {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/with-accounts`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data;
  } catch (error) {
    console.error('List suppliers with accounts error:', error);
    return { success: true, data: { suppliers: [], stats: {} } };
  }
}

// Get supplier ledger
export async function getSupplierLedger(supplierId, params = {}) {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/${supplierId}/ledger`, {
      params,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || [];
  } catch (error) {
    console.error('Get supplier ledger error:', error);
    return [];
  }
}

// Record payment to supplier
export async function recordSupplierPayment(supplierId, data) {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_URL}/${supplierId}/payment`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data;
  } catch (error) {
    console.error('Record supplier payment error:', error);
    throw new Error(error.response?.data?.message || 'Failed to record payment');
  }
}

// Record refund from supplier (supplier pays us back after stock return)
export async function recordSupplierRefund(supplierId, data) {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_URL}/${supplierId}/refund`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data;
  } catch (error) {
    console.error('Record supplier refund error:', error);
    throw new Error(error.response?.data?.message || 'Failed to record refund');
  }
}
