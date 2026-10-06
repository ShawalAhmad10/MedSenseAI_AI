const axios =
  require('axios');

const leadService =
  require('../services/leadScoringService');


const AI_SERVICE_URL = (
  process.env.AI_SERVICE_URL ||
  'http://127.0.0.1:8000'
).replace(/\/+$/, '');


const CUSTOMER_ACTIVITY_URL =
  `${AI_SERVICE_URL}/api/v1/integrations/amna/funnel/customer-activity`;


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


function recentPurchaseCount(
  orders,
  days = 30
) {

  const cutoff =
    Date.now() -
    (
      days *
      24 *
      60 *
      60 *
      1000
    );


  return (
    Array.isArray(orders)
      ? orders
      : []
  ).filter(
    (order) => {

      const timestamp =
        new Date(
          order.created_at
        ).getTime();

      return (
        Number.isFinite(timestamp) &&
        timestamp >= cutoff
      );
    }
  ).length;
}


async function loadRecentActivity(
  snapshot
) {

  const purchases30d =
    recentPurchaseCount(
      snapshot.orders,
      30
    );


  const fallback = {

    available:
      false,

    window_days:
      30,

    purchases_30d:
      purchases30d,

    cart_adds_30d:
      0,

    cart_removes_30d:
      0,

    views_30d:
      0,

    total_orders:
      snapshot.orders.length
  };


  try {

    const response =
      await axios.get(

        `${CUSTOMER_ACTIVITY_URL}/${snapshot.customer.customer_id}`,

        {
          params: {
            days: 30,
            origin: 'partner_real'
          },

          timeout: 5000,

          headers:
            integrationHeaders(),

          validateStatus:
            () => true
        }
      );


    if (
      response.status < 200 ||
      response.status >= 300 ||
      !response.data
    ) {
      return fallback;
    }


    return {

      available:
        true,

      window_days:
        30,

      purchases_30d:
        purchases30d,

      cart_adds_30d:
        Number(
          response.data.cart_adds ||
          0
        ),

      cart_removes_30d:
        Number(
          response.data.cart_removes ||
          0
        ),

      views_30d:
        Number(
          response.data.product_views ||
          0
        ),

      total_orders:
        snapshot.orders.length,

      last_activity_at:
        response.data.last_activity_at ||
        null
    };

  } catch {

    return fallback;
  }
}


function normalizedLead(
  item,
  activity
) {

  return {

    customer_id:
      item.snapshot
        .display
        .customer_id,

    customer_name:
      item.snapshot
        .display
        .customer_name,

    email:
      item.snapshot
        .display
        .email,

    /*
     * Existing operational orders are kept exactly
     * as stored in the project database.
     */
    order_count:
      item.snapshot
        .orders
        .length,

    activity,

    scoring:
      item.upstream
        .result
  };
}


function localFailure(
  res,
  error
) {

  if (
    error.code ===
    'LEAD_CUSTOMER_NOT_FOUND'
  ) {

    return res
      .status(404)
      .json({
        success: false,
        code: error.code,
        message: error.message
      });
  }


  if (
    error.code ===
    'LEAD_INVALID_LIMIT'
  ) {

    return res
      .status(400)
      .json({
        success: false,
        code: error.code,
        message: error.message
      });
  }


  if (
    error.code ===
      'LEAD_INVALID_CUSTOMER_ID' ||

    error.code ===
      'LEAD_INVALID_TIMESTAMP' ||

    error.code ===
      'LEAD_INVALID_ORDER_SNAPSHOT'
  ) {

    return res
      .status(422)
      .json({
        success: false,
        code: error.code,
        message: error.message
      });
  }


  console.error(
    'Lead scoring dashboard error:',
    error.message
  );


  return res
    .status(503)
    .json({
      success: false,
      code: 'LEAD_SERVICE_UNAVAILABLE',
      message:
        'Lead scoring data is currently unavailable'
    });
}


exports.getLead =
  async (
    req,
    res
  ) => {

    try {

      const item =
        await leadService
          .scoreCustomer(
            req.params.customerId
          );


      if (
        item.upstream.httpStatus < 200 ||
        item.upstream.httpStatus >= 300
      ) {

        return res
          .status(502)
          .json({
            success: false,
            code:
              'LEAD_AI_UPSTREAM_ERROR',
            message:
              'Lead scoring service did not accept the customer snapshot',
            data:
              item.upstream.result
          });
      }


      const activity =
        await loadRecentActivity(
          item.snapshot
        );


      return res.json({

        success:
          true,

        data:
          normalizedLead(
            item,
            activity
          )
      });

    } catch (
      error
    ) {

      return (
        localFailure(
          res,
          error
        )
      );
    }
  };


async function respondLeadList(
  req,
  res
) {

  try {

    const items =
      await leadService
        .scoreCustomers(
          req.query?.limit ||
          100
        );


    const rejected =
      items.find(
        (item) =>
          item.upstream.httpStatus < 200 ||
          item.upstream.httpStatus >= 300
      );


    if (rejected) {

      return res
        .status(502)
        .json({

          success:
            false,

          code:
            'LEAD_AI_UPSTREAM_ERROR',

          message:
            'Lead scoring service did not accept a customer snapshot',

          data:
            rejected.upstream.result
        });
    }


    const rows =
      await Promise.all(

        items.map(
          async (
            item
          ) => {

            const activity =
              await loadRecentActivity(
                item.snapshot
              );


            return (
              normalizedLead(
                item,
                activity
              )
            );
          }
        )
      );


    return res.json({

      success:
        true,

      data: {

        refresh_mode:
          'read_only_on_demand',

        persisted_scores:
          false,

        customer_count:
          rows.length,

        leads:
          rows
      }
    });

  } catch (
    error
  ) {

    return (
      localFailure(
        res,
        error
      )
    );
  }
}


exports.listLeads =
  respondLeadList;


exports.recalculateLeads =
  respondLeadList;