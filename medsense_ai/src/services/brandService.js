import axios from 'axios';

const API_URL = 'http://localhost:5005/api/brand';
const AUTH_KEY = 'medsense_auth_user';

// Get auth token from localStorage or sessionStorage
const getAuthToken = () => {
  // Check localStorage first
  let authData = localStorage.getItem(AUTH_KEY);
  
  // If not in localStorage, check sessionStorage
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

// Get all brands
export async function listBrands() {
  try {
    const response = await apiClient.get('/');
    return response.data;
  } catch (error) {
    console.error('Error fetching brands:', error);
    throw error;
  }
}

// Create new brand
export async function createBrand(payload) {
  try {
    const response = await apiClient.post('/', payload);
    return response.data;
  } catch (error) {
    console.error('Error creating brand:', error);
    throw error;
  }
}

// Update brand
export async function updateBrand(id, payload) {
  try {
    const response = await apiClient.put(`/${id}`, payload);
    return response.data;
  } catch (error) {
    console.error('Error updating brand:', error);
    throw error;
  }
}

// Delete brand
export async function deleteBrand(id) {
  try {
    await apiClient.delete(`/${id}`);
    return true;
  } catch (error) {
    console.error('Error deleting brand:', error);
    throw error;
  }
}

// Toggle brand status
export async function toggleBrandStatus(id) {
  try {
    const response = await apiClient.patch(`/${id}/toggle-status`);
    return response.data;
  } catch (error) {
    console.error('Error toggling brand status:', error);
    throw error;
  }
}
