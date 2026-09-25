const refillService =
  require(
    '../services/customerRefillService'
  );

function statusFor(error) {
  if (
    [
      'REFILL_INVALID_CUSTOMER_ID',
      'REFILL_INVALID_INVOICE_ID',
      'REFILL_INVALID_PRODUCT_ID',
      'REFILL_INVALID_REMINDER_ID',
      'REFILL_INVALID_REMINDER_DATE',
      'REFILL_INVALID_LIFECYCLE',
    ].includes(error?.code)
  ) {
    return 400;
  }

  if (
    error?.code ===
    'REFILL_NOT_FOUND'
  ) {
    return 404;
  }

  if (
    [
      'REFILL_SOURCE_NOT_ELIGIBLE',
      'REFILL_ACTIVE_REMINDER_EXISTS',
      'REFILL_NOT_ACTIVE',
    ].includes(error?.code)
  ) {
    return 409;
  }

  return 500;
}

function failure(
  res,
  error
) {
  const status =
    statusFor(error);

  return res.status(status).json({
    success:
      false,

    error: {
      code:
        error?.code ||
        'REFILL_INTERNAL_ERROR',

      message:
        status === 500
          ? 'Refill reminder request failed'
          : error.message,
    },
  });
}

exports.listSources =
  async (req, res) => {
    try {
      const sources =
        await refillService
          .loadEligibleSources(
            req.user.id
          );

      return res.json({
        success:
          true,

        data: {
          schema_version:
            refillService
              .SCHEMA_VERSION,

          sources,
        },
      });
    } catch (error) {
      return failure(
        res,
        error
      );
    }
  };

exports.listReminders =
  async (req, res) => {
    try {
      const reminders =
        await refillService
          .listReminders(
            req.user.id
          );

      return res.json({
        success:
          true,

        data: {
          schema_version:
            refillService
              .SCHEMA_VERSION,

          reminders,
        },
      });
    } catch (error) {
      return failure(
        res,
        error
      );
    }
  };

exports.createReminder =
  async (req, res) => {
    try {
      const reminder =
        await refillService
          .createReminder(
            req.user.id,
            req.body
          );

      return res.status(201).json({
        success:
          true,

        data:
          reminder,
      });
    } catch (error) {
      return failure(
        res,
        error
      );
    }
  };

exports.updateReminder =
  async (req, res) => {
    try {
      const reminder =
        await refillService
          .updateReminderDate(
            req.user.id,
            req.params.reminderId,
            req.body
          );

      return res.json({
        success:
          true,

        data:
          reminder,
      });
    } catch (error) {
      return failure(
        res,
        error
      );
    }
  };

exports.completeReminder =
  async (req, res) => {
    try {
      const reminder =
        await refillService
          .completeReminder(
            req.user.id,
            req.params.reminderId
          );

      return res.json({
        success:
          true,

        data:
          reminder,
      });
    } catch (error) {
      return failure(
        res,
        error
      );
    }
  };

exports.cancelReminder =
  async (req, res) => {
    try {
      const reminder =
        await refillService
          .cancelReminder(
            req.user.id,
            req.params.reminderId
          );

      return res.json({
        success:
          true,

        data:
          reminder,
      });
    } catch (error) {
      return failure(
        res,
        error
      );
    }
  };
