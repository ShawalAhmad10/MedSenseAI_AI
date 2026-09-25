const consultationService =
  require('../services/pharmacistConsultationService');

function sendError(
  res,
  error
) {
  const code =
    error?.code ||
    'CONSULT_INTERNAL_ERROR';

  const message =
    error?.message ||
    'Consultation request failed';

  let status = 500;

  if (
    code ===
      'CONSULT_INVALID_ID' ||
    code ===
      'CONSULT_INVALID_CUSTOMER_ID' ||
    code ===
      'CONSULT_INVALID_PRODUCT_ID' ||
    code ===
      'CONSULT_INVALID_INPUT' ||
    code ===
      'CONSULT_INVALID_LIMIT' ||
    code ===
      'CONSULT_INVALID_GUIDANCE' ||
    code ===
      'CONSULT_INVALID_DECISION' ||
    code ===
      'CONSULT_NOT_REVIEWABLE'
  ) {
    status = 400;
  }

  if (
    code ===
      'CONSULT_NOT_FOUND' ||
    code ===
      'CONSULT_CUSTOMER_NOT_FOUND' ||
    code ===
      'CONSULT_PRODUCT_NOT_FOUND'
  ) {
    status = 404;
  }

  if (
    code ===
      'CONSULT_STAFF_FORBIDDEN'
  ) {
    status = 403;
  }

  if (
    code ===
      'CONSULT_ALREADY_RESPONDED' ||
    code ===
      'CONSULT_CART_REJECTED'
  ) {
    status = 409;
  }

  if (
    code ===
      'PHARMACIST_UNAVAILABLE' ||
    code ===
      'DDI_SERVICE_UNAVAILABLE'
  ) {
    status = 503;
  }

  if (
    code ===
      'DDI_UPSTREAM_ERROR' ||
    code ===
      'DDI_INVALID_RESPONSE'
  ) {
    status = 502;
  }

  const body = {
    success:
      false,

    code,

    message,
  };

  if (
    Array.isArray(
      error?.product_ids
    )
  ) {
    body.data = {
      product_ids:
        error.product_ids,
    };
  }

  return res
    .status(status)
    .json(body);
}

exports.createCustomerConsultation =
  async (req, res) => {
    try {
      const result =
        await consultationService
          .createConsultation(
            req.user.id,
            req.body || {}
          );

      return res
        .status(
          result.duplicate
            ? 200
            : 201
        )
        .json({
          success:
            true,

          duplicate:
            result.duplicate,

          data:
            result.consultation,
        });
    } catch (error) {
      console.error(
        'Create consultation error:',
        error.message
      );

      return sendError(
        res,
        error
      );
    }
  };

exports.listCustomerConsultations =
  async (req, res) => {
    try {
      const rows =
        await consultationService
          .listCustomerConsultations(
            req.user.id
          );

      return res.json({
        success:
          true,

        data:
          rows,
      });
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  };

exports.getCustomerConsultation =
  async (req, res) => {
    try {
      const row =
        await consultationService
          .getCustomerConsultation(
            req.user.id,
            req.params
              .consultationId
          );

      return res.json({
        success:
          true,

        data:
          row,
      });
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  };

exports.listQueue =
  async (req, res) => {
    try {
      const rows =
        await consultationService
          .listQueue(
            req.user.id,
            req.query.limit
          );

      return res.json({
        success:
          true,

        data:
          rows,
      });
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  };

exports.getStaffConsultation =
  async (req, res) => {
    try {
      const row =
        await consultationService
          .getStaffConsultation(
            req.user.id,
            req.params
              .consultationId
          );

      return res.json({
        success:
          true,

        data:
          row,
      });
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  };

exports.addGuidance =
  async (req, res) => {
    try {
      const row =
        await consultationService
          .addGuidance(
            req.params
              .consultationId,

            req.user.id,

            req.body?.guidance
          );

      return res.json({
        success:
          true,

        data:
          row,
      });
    } catch (error) {
      console.error(
        'Consultation guidance error:',
        error.message
      );

      return sendError(
        res,
        error
      );
    }
  };

exports.decideConsultation =
  async (req, res) => {
    try {
      const row =
        await consultationService
          .decideConsultation(
            req.params
              .consultationId,
            req.user.id,
            req.body?.decision,
            req.body?.guidance
          );

      return res.json({
        success:
          true,
        data:
          row,
      });
    } catch (error) {
      console.error(
        'Consultation decision error:',
        error.message
      );

      return sendError(
        res,
        error
      );
    }
  };
