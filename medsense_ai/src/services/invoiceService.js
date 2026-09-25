import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

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

// Create new invoice
export async function createInvoice(payload) {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_URL}/invoice`, payload, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Create invoice error:', error);
    throw new Error(error.response?.data?.message || 'Failed to create invoice');
  }
}

// List all invoices
export async function listInvoices(params = {}) {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/invoice`, {
      params,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || [];
  } catch (error) {
    console.error('List invoices error:', error);
    return [];
  }
}

// Get single invoice
export async function getInvoice(id) {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/invoice/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Get invoice error:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch invoice');
  }
}

// Update invoice status
export async function updateInvoiceStatus(id, statusData) {
  try {
    const token = getAuthToken();
    const response = await axios.patch(`${API_URL}/invoice/${id}/status`, statusData, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Update invoice status error:', error);
    throw new Error(error.response?.data?.message || 'Failed to update invoice');
  }
}

// Delete invoice
export async function deleteInvoice(id) {
  try {
    const token = getAuthToken();
    const response = await axios.delete(`${API_URL}/invoice/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data;
  } catch (error) {
    console.error('Delete invoice error:', error);
    throw new Error(error.response?.data?.message || 'Failed to delete invoice');
  }
}

// Get invoice statistics
export async function getInvoiceStats() {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/invoice/stats`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Get invoice stats error:', error);
    return {
      total_invoices: 0,
      paid_invoices: 0,
      unpaid_invoices: 0,
      total_value: 0,
      total_paid: 0,
      total_due: 0
    };
  }
}

// Get catalog data for invoice creation (products, customers, etc.)
export async function getInvoiceCatalog() {
  try {
    const token = getAuthToken();
    
    // Fetch products for invoice line items
    const productsResponse = await axios.get(`${API_URL}/products`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    const products = (productsResponse.data || []).map(product => ({
      id: product.id || product.product_id || '',
      title: product.title || product.product_title || '',
      price: product.price || product.product_price || 0,
      stockQty: product.stockQty || product.product_stock_qty || 0
    }));

    return {
      products
    };
  } catch (error) {
    console.error('Get invoice catalog error:', error);
    return {
      products: []
    };
  }
}

// Create invoice return
export async function createInvoiceReturn(payload) {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_URL}/invoice/returns`, payload, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Create invoice return error:', error);
    throw new Error(error.response?.data?.message || 'Failed to create invoice return');
  }
}

// List all invoice returns
export async function listInvoiceReturns(params = {}) {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/invoice/returns`, {
      params,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data || [];
  } catch (error) {
    console.error('List invoice returns error:', error);
    return [];
  }
}

// Get single invoice return
export async function getInvoiceReturn(id) {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_URL}/invoice/returns/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data.data;
  } catch (error) {
    console.error('Get invoice return error:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch invoice return');
  }
}
