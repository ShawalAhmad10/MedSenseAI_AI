// Alert Service

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005/api';

const getAuthHeader = () => {
  const user = JSON.parse(sessionStorage.getItem('medsense_auth_user') || localStorage.getItem('medsense_auth_user') || '{}');
  return { Authorization: `Bearer ${user.token}` };
};

// Get all alerts
export const getAllAlerts = async () => {
  try {
    const response = await axios.get(`${API_URL}/alerts/all`, {
      headers: getAuthHeader()
    });
    return response.data.data;
  } catch (error) {
    console.error('Get alerts error:', error);
    throw error;
  }
};

// Get dashboard summary
export const getAlertSummary = async () => {
  try {
    const response = await axios.get(`${API_URL}/alerts/summary`, {
      headers: getAuthHeader()
    });
    return response.data.data;
  } catch (error) {
    console.error('Get alert summary error:', error);
    throw error;
  }
};
