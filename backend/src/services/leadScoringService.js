const axios = require('axios');
const { sequelize } = require('../config/database');

const AI_SERVICE_URL = (
  process.env.AI_SERVICE_URL ||
  'http://127.0.0.1:8000'
).replace(/\/+$/, '');

const LEAD_SCORE_URL =
  `${AI_SERVICE_URL}/api/v1/integrations/amna/leads/score`;

const LEAD_TIMEOUT_MS =
  Number(process.env.LEAD_TIMEOUT_MS || 10000);

function integrationHeaders() {
  const key =
    process.env.MEDSENSE_INTEGRATION_API_KEY ||
    process.env.INTEGRATION_API_KEY;

  if (!key) {
    return {};
  }

  return {
    'X-MedSense-Key': key
  };
}

function positiveCustomerId(value) {
  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    const error =
      new Error('Invalid customer identifier');

    error.code = 'LEAD_INVALID_CUSTOMER_ID';
    throw error;
  }

  return parsed;
}

function isoTimestamp(value, fieldName) {
  const date = new Date(value);

  if (
    !value ||
    Number.isNaN(date.getTime())
  ) {
    const error =
      new Error(`Invalid ${fieldName} timestamp`);

    error.code = 'LEAD_INVALID_TIMESTAMP';
    throw error;
  }

  return date.toISOString();
}

async function loadCustomerSnapshot(customerId) {
  const id =
    positiveCustomerId(customerId);

  const customers = await sequelize.query(
    `SELECT
       customer_id,
       customer_name,
       email,
       created_at
     FROM customer
     WHERE customer_id = :customer_id
       AND COALESCE(status, 1) = 1
     LIMIT 1`,
    {
      replacements: {
        customer_id: id
      },
      type: sequelize.QueryTypes.SELECT
    }
  );

  if (customers.length !== 1) {
    const error =
      new Error('Active customer not found');

    error.code = 'LEAD_CUSTOMER_NOT_FOUND';
    throw error;
  }

  const customer = customers[0];

  const orders = await sequelize.query(
    `SELECT
       invoice_id AS order_id,
       customer_id,
       created_at
     FROM invoice
     WHERE customer_id = :customer_id
       AND status = 1
     ORDER BY created_at ASC, invoice_id ASC`,
    {
      replacements: {
        customer_id: id
      },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const canonicalOrders =
    orders.map((row) => {
      const orderId =
        Number(row.order_id);

      const orderCustomerId =
        Number(row.customer_id);

      if (
        !Number.isSafeInteger(orderId) ||
        orderId <= 0 ||
        orderCustomerId !== id
      ) {
        const error =
          new Error(
            'Authoritative invoice identity is invalid'
          );

        error.code =
          'LEAD_INVALID_ORDER_SNAPSHOT';

        throw error;
      }

      return {
        order_id: orderId,
        customer_id: id,
        created_at:
          isoTimestamp(
            row.created_at,
            'invoice created_at'
          )
      };
    });

  return {
    customer: {
      customer_id: id,
      created_at:
        isoTimestamp(
          customer.created_at,
          'customer created_at'
        )
    },
    orders: canonicalOrders,
    display: {
      customer_id: id,
      customer_name:
        customer.customer_name || null,
      email:
        customer.email || null
    }
  };
}

async function requestLeadScore(snapshot) {
  const response = await axios.post(
    LEAD_SCORE_URL,
    {
      customer: snapshot.customer,
      orders: snapshot.orders
    },
    {
      timeout: LEAD_TIMEOUT_MS,
      headers: integrationHeaders(),
      validateStatus: () => true
    }
  );

  return {
    httpStatus: response.status,
    result: response.data
  };
}

async function scoreCustomer(customerId) {
  const snapshot =
    await loadCustomerSnapshot(customerId);

  const upstream =
    await requestLeadScore(snapshot);

  return {
    snapshot,
    upstream
  };
}

async function listActiveCustomerIds(limit = 100) {
  const parsed =
    Number(limit);

  const safeLimit =
    Number.isSafeInteger(parsed)
      ? Math.min(
          Math.max(parsed, 1),
          100
        )
      : 100;

  const rows = await sequelize.query(
    `SELECT customer_id
     FROM customer
     WHERE COALESCE(status, 1) = 1
     ORDER BY customer_id ASC
     LIMIT :limit`,
    {
      replacements: {
        limit: safeLimit
      },
      type: sequelize.QueryTypes.SELECT
    }
  );

  return rows
    .map((row) => Number(row.customer_id))
    .filter(
      (value) =>
        Number.isSafeInteger(value) &&
        value > 0
    );
}

async function scoreCustomers(limit = 100) {
  const customerIds =
    await listActiveCustomerIds(limit);

  const results = [];

  // Deliberately sequential:
  // bounded load against the local AI service.
  for (const customerId of customerIds) {
    results.push(
      await scoreCustomer(customerId)
    );
  }

  return results;
}

module.exports = {
  loadCustomerSnapshot,
  requestLeadScore,
  scoreCustomer,
  listActiveCustomerIds,
  scoreCustomers,
  AI_SERVICE_URL,
  LEAD_SCORE_URL
};
