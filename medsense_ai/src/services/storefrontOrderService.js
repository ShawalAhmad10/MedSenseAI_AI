import axios from 'axios';

const API_URL = '/api/orders';

const CUSTOMER_AUTH_KEY = 'medsense_customer_auth';

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

// Create order from cart
export async function createOrder(orderData) {
  try {
    const customerToken = getCustomerToken();

    const response = await axios.post(
      API_URL,
      orderData,
      {
        headers: customerToken
          ? {
              Authorization:
                `Bearer ${customerToken}`
            }
          : {}
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
}

// Get customer orders - ONLY storefront orders for this logged-in customer
// Uses server-side filtering — no POS invoices returned
export async function getCustomerOrders(customerId, customerEmail, customerPhone) {
  try {
    if (!customerId && !customerEmail && !customerPhone) {
      console.warn('No customer identification provided');
      return { success: true, data: { orders: [], pagination: {} } };
    }

    // Server-side filter: only this customer's orders (storefront_only excludes POS invoices)
    const url = `${API_URL}/my-orders?limit=100&sortBy=created_at&sortDir=desc`;

    const customerToken = getCustomerToken();

    const response = await axios.get(
      url,
      {
        headers: customerToken
          ? {
              Authorization:
                `Bearer ${customerToken}`
            }
          : {}
      }
    );
    let orders = response.data?.data?.orders || [];

    // Extra client-side safety: if server returned more (edge case), filter again
    if (customerId || customerEmail || customerPhone) {
      orders = orders.filter(order => {
        if (customerId   && order.customer_id    === customerId)    return true;
        if (customerEmail && order.customer_email === customerEmail) return true;
        if (customerPhone && order.customer_phone === customerPhone) return true;
        return false;
      });
    }

    return {
      success: true,
      data: {
        orders,
        pagination: { total: orders.length, page: 1, pageSize: orders.length }
      }
    };
  } catch (error) {
    console.error('Error fetching orders:', error);
    return { success: false, data: { orders: [], pagination: {} } };
  }
}

// Get order by ID - with customer verification
export async function getOrderById(orderId, customerId, customerEmail, customerPhone) {
  try {
    const customerToken = getCustomerToken();

    const response = await axios.get(
      `${API_URL}/my-orders/${orderId}`,
      {
        headers: customerToken
          ? {
              Authorization:
                `Bearer ${customerToken}`
            }
          : {}
      }
    );
    const order = response.data?.data;

    if (!order) {
      throw new Error('Order not found');
    }

    // Verify this order belongs to the logged-in customer
    const isOwner =
      (customerId && order.customer_id === customerId) ||
      (customerEmail && order.customer_email === customerEmail) ||
      (customerPhone && order.customer_phone === customerPhone);

    if (!isOwner) {
      throw new Error('Unauthorized: This order does not belong to you');
    }

    return response.data;
  } catch (error) {
    console.error('Error fetching order:', error);
    throw error;
  }
}

// Update order status (for admin)
export async function updateOrderStatus(orderId, updates) {
  try {
    const response = await axios.patch(`${API_URL}/${orderId}/status`, updates);
    return response.data;
  } catch (error) {
    console.error('Error updating order:', error);
    throw error;
  }
}
