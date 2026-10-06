const axios = require('axios');
const { sequelize } = require('../config/database');

const LEAD_AI_SERVICE_URL = (
  process.env.LEAD_AI_SERVICE_URL ||
  'http://127.0.0.1:8002'
).replace(/\/+$/, '');

const LEAD_SCORE_URL =
  `${LEAD_AI_SERVICE_URL}/api/v1/integrations/amna/leads/score`;

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
       c.customer_id,
       c.customer_name,
       c.email,
       c.created_at
     FROM customer c
     WHERE c.customer_id = :customer_id
       AND COALESCE(c.status, 1) = 1
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
       AND COALESCE(LOWER(delivery_status), '')
         NOT IN ('cancelled', 'refunded')
     ORDER BY created_at ASC, invoice_id ASC`,
    {
      replacements: {
        customer_id: id
      },
      type: sequelize.QueryTypes.SELECT
    }
  );

  return buildSnapshot(customer, orders);
}

function buildSnapshot(customer, orders) {
  const id = positiveCustomerId(customer.customer_id);
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

function validateLimit(limit) {
  const parsed =
    Number(limit);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > 100
  ) {
    const error =
      new Error(
        'Lead list limit must be an integer from 1 to 100'
      );

    error.code =
      'LEAD_INVALID_LIMIT';

    throw error;
  }

  return parsed;
}

async function listActiveCustomerIds(limit = 100) {
  const safeLimit = validateLimit(limit);

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

async function scoreCustomerList(limit) {
  // Two queries for the entire list, rather than two cloud round trips per customer.
  const customers = await sequelize.query(`SELECT c.customer_id, c.customer_name, c.email, c.created_at,e.source_fingerprint,e.dataset,e.observation_time
    FROM customer c LEFT JOIN evaluation_lead_activity e ON e.customer_id=c.customer_id WHERE COALESCE(c.status, 1) = 1
    ORDER BY c.customer_id ASC LIMIT :limit`, {
    replacements: { limit }, type: sequelize.QueryTypes.SELECT
  });
  if (!customers.length) return [];
  const ids = customers.map(row => positiveCustomerId(row.customer_id));
  const orders = await sequelize.query(`SELECT invoice_id AS order_id, customer_id, created_at
    FROM invoice WHERE customer_id IN (:customer_ids) AND status = 1
    AND COALESCE(LOWER(delivery_status), '') NOT IN ('cancelled', 'refunded')
    ORDER BY created_at ASC, invoice_id ASC`, {
    replacements: { customer_ids: ids }, type: sequelize.QueryTypes.SELECT
  });
  const grouped = new Map(ids.map(id => [id, []]));
  for (const row of orders) {
    const group = grouped.get(Number(row.customer_id));
    if (!group) {
      throw Object.assign(new Error('Authoritative invoice identity is invalid'), {
        code: 'LEAD_INVALID_ORDER_SNAPSHOT'
      });
    }
    group.push(row);
  }
  const snapshots = customers.map(customer => buildSnapshot(customer, grouped.get(Number(customer.customer_id))));
  const results = new Array(snapshots.length);
  let next = 0;
  let stopped = false;
  // Bound local AI load while overlapping its cloud telemetry reads.
  const workers = await Promise.allSettled(Array.from({ length: Math.min(3, snapshots.length) }, async () => {
    try {
      while (!stopped && next < snapshots.length) {
        const index = next++;
        const snapshot = snapshots[index];
        results[index] = { snapshot, upstream: await requestLeadScore(snapshot) };
      }
    } catch (error) {
      stopped = true;
      throw error;
    }
  }));
  const failed = workers.find(worker => worker.status === 'rejected');
  if (failed) throw failed.reason;
  return results;
}

const pendingLists = new Map();
function scoreCustomers(limit = 100) {
  // StrictMode/remounts can request the same list simultaneously. Share only
  // running work; a later refresh always reads current data again.
  let parsed;
  try { parsed = validateLimit(limit); } catch (error) { return Promise.reject(error); }
  if (pendingLists.has(parsed)) return pendingLists.get(parsed);
  const pending = scoreCustomerList(parsed).finally(() => pendingLists.delete(parsed));
  pendingLists.set(parsed, pending);
  return pending;
}

module.exports = {
  loadCustomerSnapshot,
  requestLeadScore,
  scoreCustomer,
  listActiveCustomerIds,
  scoreCustomers,
  LEAD_AI_SERVICE_URL,
  LEAD_SCORE_URL
};
