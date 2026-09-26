// Report Service

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const getAuthHeader = () => {
  const user = JSON.parse(sessionStorage.getItem('medsense_auth_user') || localStorage.getItem('medsense_auth_user') || '{}');
  return { Authorization: `Bearer ${user.token}` };
};

// Get Profit & Loss Report
export const getProfitLossReport = async (params = {}) => {
  try {
    const response = await axios.get(`${API_URL}/reports/profit-loss`, {
      headers: getAuthHeader(),
      params
    });
    return response.data.data;
  } catch (error) {
    console.error('Get profit/loss report error:', error);
    throw error;
  }
};

// Get Batch-wise Stock Report
export const getBatchWiseReport = async (params = {}) => {
  try {
    const response = await axios.get(`${API_URL}/reports/batch-wise`, {
      headers: getAuthHeader(),
      params
    });
    return response.data.data;
  } catch (error) {
    console.error('Get batch-wise report error:', error);
    throw error;
  }
};
