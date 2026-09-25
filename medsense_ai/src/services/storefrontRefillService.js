import axios from 'axios';

const API_URL =
  '/api/refills';

const CUSTOMER_AUTH_KEY =
  'medsense_customer_auth';

function getCustomerToken() {
  try {
    const raw =
      sessionStorage.getItem(
        CUSTOMER_AUTH_KEY
      ) ||
      localStorage.getItem(
        CUSTOMER_AUTH_KEY
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    return parsed?.token || null;
  } catch {
    return null;
  }
}

function requireCustomerToken() {
  const token =
    getCustomerToken();

  if (!token) {
    throw new Error(
      'Please sign in to manage refill reminders.'
    );
  }

  return token;
}

function authConfig() {
  const token =
    requireCustomerToken();

  return {
    timeout:
      15000,

    headers: {
      Authorization:
        `Bearer ${token}`,
    },
  };
}

function apiError(
  error,
  fallback
) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

export async function getRefillSources() {
  try {
    const response =
      await axios.get(
        `${API_URL}/sources`,
        authConfig()
      );

    return (
      response.data?.data?.sources ||
      []
    );
  } catch (error) {
    throw new Error(
      apiError(
        error,
        'Could not load refill-eligible purchases.'
      )
    );
  }
}

export async function getRefillReminders() {
  try {
    const response =
      await axios.get(
        API_URL,
        authConfig()
      );

    return (
      response.data?.data?.reminders ||
      []
    );
  } catch (error) {
    throw new Error(
      apiError(
        error,
        'Could not load refill reminders.'
      )
    );
  }
}

export async function createRefillReminder(
  payload
) {
  try {
    const response =
      await axios.post(
        API_URL,
        payload,
        authConfig()
      );

    return response.data?.data;
  } catch (error) {
    throw new Error(
      apiError(
        error,
        'Could not create refill reminder.'
      )
    );
  }
}

export async function rescheduleRefillReminder(
  reminderId,
  reminderDate
) {
  try {
    const response =
      await axios.patch(
        `${API_URL}/${reminderId}`,
        {
          reminder_date:
            reminderDate,
        },
        authConfig()
      );

    return response.data?.data;
  } catch (error) {
    throw new Error(
      apiError(
        error,
        'Could not reschedule refill reminder.'
      )
    );
  }
}

export async function completeRefillReminder(
  reminderId
) {
  try {
    const response =
      await axios.post(
        `${API_URL}/${reminderId}/complete`,
        {},
        authConfig()
      );

    return response.data?.data;
  } catch (error) {
    throw new Error(
      apiError(
        error,
        'Could not complete refill reminder.'
      )
    );
  }
}

export async function cancelRefillReminder(
  reminderId
) {
  try {
    const response =
      await axios.delete(
        `${API_URL}/${reminderId}`,
        authConfig()
      );

    return response.data?.data;
  } catch (error) {
    throw new Error(
      apiError(
        error,
        'Could not cancel refill reminder.'
      )
    );
  }
}
