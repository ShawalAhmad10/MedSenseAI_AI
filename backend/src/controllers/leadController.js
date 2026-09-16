const leadService =
  require('../services/leadScoringService');

function normalizedLead(item) {
  return {
    customer_id:
      item.snapshot.display.customer_id,

    customer_name:
      item.snapshot.display.customer_name,

    email:
      item.snapshot.display.email,

    order_count:
      item.snapshot.orders.length,

    scoring:
      item.upstream.result
  };
}

function upstreamFailure(res, upstream) {
  const status =
    upstream.httpStatus === 401
      ? 502
      : upstream.httpStatus === 422
        ? 422
        : 502;

  return res.status(status).json({
    success: false,
    code: 'LEAD_AI_UPSTREAM_ERROR',
    message:
      'Lead scoring service did not accept the authoritative snapshot',
    data: upstream.result
  });
}

function localFailure(res, error) {
  if (
    error.code ===
    'LEAD_CUSTOMER_NOT_FOUND'
  ) {
    return res.status(404).json({
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
    return res.status(422).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }

  console.error(
    'Lead scoring bridge error:',
    error.message
  );

  return res.status(503).json({
    success: false,
    code: 'LEAD_SERVICE_UNAVAILABLE',
    message:
      'Lead scoring service is currently unavailable'
  });
}

exports.getLead = async (req, res) => {
  try {
    const item =
      await leadService.scoreCustomer(
        req.params.customerId
      );

    if (
      item.upstream.httpStatus < 200 ||
      item.upstream.httpStatus >= 300
    ) {
      return upstreamFailure(
        res,
        item.upstream
      );
    }

    return res.json({
      success: true,
      data: normalizedLead(item)
    });
  } catch (error) {
    return localFailure(
      res,
      error
    );
  }
};

async function respondLeadList(req, res) {
  try {
    const items =
      await leadService.scoreCustomers(
        req.query?.limit || 100
      );

    const rejected =
      items.find(
        (item) =>
          item.upstream.httpStatus < 200 ||
          item.upstream.httpStatus >= 300
      );

    if (rejected) {
      return upstreamFailure(
        res,
        rejected.upstream
      );
    }

    return res.json({
      success: true,
      data: {
        refresh_mode:
          'read_only_on_demand',
        persisted_scores: false,
        leads:
          items.map(normalizedLead)
      }
    });
  } catch (error) {
    return localFailure(
      res,
      error
    );
  }
}

exports.listLeads =
  respondLeadList;

// Existing dashboard action name retained,
// but this performs no model training and
// writes no score to PostgreSQL.
exports.recalculateLeads =
  respondLeadList;
