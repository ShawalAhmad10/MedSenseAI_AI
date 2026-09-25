import axios from 'axios';

const API_URL = '/api/products';
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

// Get all products
export async function listProducts() {
  try {
    const response = await apiClient.get('/');
    return response.data;
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
}

// Create new product
export async function createProduct(payload) {
  try {
    const response = await apiClient.post('/', payload);
    return response.data;
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
}

// Update product
export async function updateProduct(id, payload) {
  try {
    const response = await apiClient.put(`/${id}`, payload);
    return response.data;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
}

// Delete product
export async function deleteProduct(id) {
  try {
    await apiClient.delete(`/${id}`);
    return true;
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
}

// Toggle product status
export async function toggleProductStatus(id) {
  try {
    const response = await apiClient.patch(`/${id}/toggle-status`);
    return response.data;
  } catch (error) {
    console.error('Error toggling product status:', error);
    throw error;
  }
}

// Save product profile (extended fields) - Stub implementation
export async function saveProductProfile(productId, extendedFields) {
  try {
    // This would typically save additional product metadata
    // For now, returning success as products already have core fields
    console.log('Saving product profile for:', productId, extendedFields);
    return { success: true, productId, extendedFields };
  } catch (error) {
    console.error('Error saving product profile:', error);
    throw error;
  }
}

// List product profiles - Returns empty object as profiles are integrated with products
export async function listProductProfiles() {
  try {
    // Product profiles are now part of the main product data
    // Return empty object for compatibility
    return {};
  } catch (error) {
    console.error('Error listing product profiles:', error);
    throw error;
  }
}

// Bulk update stock for multiple products (for stock receive)
export async function bulkUpdateProductStock(items) {
  try {
    const response = await apiClient.post('/bulk-stock-update', { items });
    return response.data;
  } catch (error) {
    console.error('Error in bulk stock update:', error);
    throw error;
  }
}

// Update stock for a single product
export async function updateProductStock(id, quantityChange, operation = 'add') {
  try {
    const response = await apiClient.patch(`/${id}/stock`, { quantityChange, operation });
    return response.data;
  } catch (error) {
    console.error('Error updating product stock:', error);
    throw error;
  }
}
