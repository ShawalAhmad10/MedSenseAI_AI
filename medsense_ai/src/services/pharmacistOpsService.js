import api from './api';

// Staff API calls - real backend implementation

export async function listStaff() {
  try {
    const response = await api.get('/staff');
    return response.data.data;
  } catch (error) {
    console.error('List staff error:', error);
    throw error;
  }
}

export async function saveStaff(payload, id = null) {
  try {
    if (id) {
      // Update existing staff
      const response = await api.put(`/staff/${id}`, payload);
      return response.data.data;
    } else {
      // Create new staff
      const response = await api.post('/staff', payload);
      return response.data.data;
    }
  } catch (error) {
    console.error('Save staff error:', error);
    throw error;
  }
}

export async function toggleStaffStatus(id) {
  try {
    const response = await api.patch(`/staff/${id}/toggle-status`);
    return response.data.data;
  } catch (error) {
    console.error('Toggle staff status error:', error);
    throw error;
  }
}

export async function removeStaff(id) {
  try {
    const response = await api.delete(`/staff/${id}`);
    return response.data;
  } catch (error) {
    console.error('Remove staff error:', error);
    throw error;
  }
}

export async function resetStaffPassword(id, password = null) {
  try {
    const response = await api.patch(`/staff/${id}/reset-password`, { password });
    return response.data.data;
  } catch (error) {
    console.error('Reset staff password error:', error);
    throw error;
  }
}

