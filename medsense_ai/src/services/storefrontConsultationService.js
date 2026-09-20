import axios from 'axios';

import {
  getFunnelCartId,
} from './storefrontFunnelService';

const API_URL =
  import.meta.env.VITE_API_URL ||
  'http://localhost:5005/api';

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

function authHeaders() {
  const token =
    getCustomerToken();

  if (!token) {
    const error =
      new Error(
        'Customer sign-in is required'
      );

    error.code =
      'CUSTOMER_AUTH_REQUIRED';

    throw error;
  }

  return {
    Authorization:
      `Bearer ${token}`,
  };
}

function normalizeProductId(value) {
  const raw =
    typeof value === 'string'
      ? value.replace(
          /^prod-/,
          ''
        )
      : value;

  const parsed =
    Number(raw);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}

function normalizeCartItems(items) {
  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    const error =
      new Error(
        'Cart must contain at least one medicine'
      );

    error.code =
      'CONSULT_EMPTY_CART';

    throw error;
  }

  return items.map((item) => {
    const productId =
      normalizeProductId(
        item?.id ??
        item?.product_id
      );

    if (!productId) {
      const error =
        new Error(
          'Cart contains an invalid medicine identity'
        );

      error.code =
        'CONSULT_INVALID_PRODUCT_ID';

      throw error;
    }

    const rawQuantity =
      Number(item?.quantity);

    const quantity =
      Number.isSafeInteger(
        rawQuantity
      ) &&
      rawQuantity > 0
        ? rawQuantity
        : 1;

    return {
      product_id:
        productId,

      quantity,
    };
  });
}

export async function createCartConsultation(
  items,
  customerMessage = ''
) {
  const payload = {
    source:
      'cart',

    cart_instance_id:
      getFunnelCartId(),

    items:
      normalizeCartItems(
        items
      ),

    customer_message:
      String(
        customerMessage || ''
      ).trim(),
  };

  const response =
    await axios.post(
      `${API_URL}/consultations/customer`,
      payload,
      {
        headers:
          authHeaders(),
      }
    );

  return {
    duplicate:
      Boolean(
        response.data?.duplicate
      ),

    consultation:
      response.data?.data ||
      null,
  };
}

export async function listCustomerConsultations() {
  const response =
    await axios.get(
      `${API_URL}/consultations/customer`,
      {
        headers:
          authHeaders(),
      }
    );

  return Array.isArray(
    response.data?.data
  )
    ? response.data.data
    : [];
}

export async function getCustomerConsultation(
  consultationId
) {
  const id =
    Number(
      consultationId
    );

  if (
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    throw new Error(
      'Invalid consultation identifier'
    );
  }

  const response =
    await axios.get(
      `${API_URL}/consultations/customer/${id}`,
      {
        headers:
          authHeaders(),
      }
    );

  return response.data?.data ||
    null;
}
