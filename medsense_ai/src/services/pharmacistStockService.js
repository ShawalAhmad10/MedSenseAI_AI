import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005/api';

// Helper to get auth token
function getAuthToken() {
  try {
    const sessionValue = sessionStorage.getItem('medsense_auth_user');
    if (sessionValue) {
      const parsed = JSON.parse(sessionValue);
      if (parsed?.token) return parsed.token;
    }
    const localValue = localStorage.getItem('medsense_auth_user');
    if (localValue) {
      const parsed = JSON.parse(localValue);
      if (parsed?.token) return parsed.token;
    }
  } catch {}
  return null;
}

// Get catalog data (suppliers and products for dropdowns)
export async function getStockCatalog({ inventoryItems = [], suppliers = [] } = {}) {
  // Return suppliers from database
  return {
    suppliers: suppliers || [],
    products: inventoryItems || [],
    branches: [] // No longer needed
  };
}

// Create Stock Batch
export async function createStockEntry(payload) {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_URL}/stock/batch`, payload, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Create stock batch error:', error);
    throw new Error(error.response?.data?.message || 'Failed to create stock batch');
  }
}

// List all stock batches
export async function listStockBatches() {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/stock/batch`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || [];
  } catch (error) {
    console.error('List stock batches error:', error);
    return [];
  }
}

// Get single stock batch
export async function getStockBatch(id) {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/stock/batch/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Get stock batch error:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch stock batch');
  }
}

// Create Stock Opening
export async function createStockOpening(payload) {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_URL}/stock/opening`, payload, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Create stock opening error:', error);
    throw new Error(error.response?.data?.message || 'Failed to create stock opening');
  }
}

// List stock openings
export async function listStockOpenings() {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/stock/opening`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || [];
  } catch (error) {
    console.error('List stock openings error:', error);
    return [];
  }
}

// Create Stock Return
export async function createStockReturn(payload) {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_URL}/stock/return`, payload, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Create stock return error:', error);
    throw new Error(error.response?.data?.message || 'Failed to create stock return');
  }
}

// List stock returns
export async function listStockReturns() {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/stock/return`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || [];
  } catch (error) {
    console.error('List stock returns error:', error);
    return [];
  }
}

// Get Low Stock Alerts
export async function getLowStockAlerts() {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/stock/alerts/low-stock`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || { lowStock: [], outOfStock: [] };
  } catch (error) {
    console.error('Get low stock alerts error:', error);
    return { lowStock: [], outOfStock: [] };
  }
}

// Get Expiry Alerts
export async function getExpiryAlerts() {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/stock/alerts/expiry`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || { expiringSoon: [], expired: [] };
  } catch (error) {
    console.error('Get expiry alerts error:', error);
    return { expiringSoon: [], expired: [] };
  }
}

// Get Dashboard Alerts Summary
export async function getDashboardAlerts() {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/stock/alerts/dashboard`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || { lowStock: 0, outOfStock: 0, expiringSoon: 0, expired: 0, totalAlerts: 0 };
  } catch (error) {
    console.error('Get dashboard alerts error:', error);
    return { lowStock: 0, outOfStock: 0, expiringSoon: 0, expired: 0, totalAlerts: 0 };
  }
}

// Get Batch-wise Stock Report
export async function getBatchWiseReport(filters = {}) {
  try {
    const token = getAuthToken();
    const params = new URLSearchParams();
    if (filters.productId) params.append('productId', filters.productId);
    if (filters.supplierId) params.append('supplierId', filters.supplierId);
    if (filters.expiryFrom) params.append('expiryFrom', filters.expiryFrom);
    if (filters.expiryTo) params.append('expiryTo', filters.expiryTo);
    
    const response = await axios.get(`${API_URL}/stock/reports/batch-wise?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || [];
  } catch (error) {
    console.error('Get batch-wise report error:', error);
    return [];
  }
}

// Get Profit & Loss Report
export async function getProfitLossReport(filters = {}) {
  try {
    const token = getAuthToken();
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.productId) params.append('productId', filters.productId);
    if (filters.supplierId) params.append('supplierId', filters.supplierId);
    
    const response = await axios.get(`${API_URL}/stock/reports/profit-loss?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || { summary: {}, byProduct: [], costingMethod: 'FIFO' };
  } catch (error) {
    console.error('Get profit & loss report error:', error);
    return { summary: {}, byProduct: [], costingMethod: 'FIFO' };
  }
}
