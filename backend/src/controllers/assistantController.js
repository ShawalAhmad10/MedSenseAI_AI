const assistantService =
  require(
    '../services/pharmacistAssistantService'
  );

function statusFor(error) {
  if (
    [
      'ASSISTANT_INVALID_MESSAGE',
      'ASSISTANT_SENSITIVE_QUERY_UNSUPPORTED',
      'ASSISTANT_UNSUPPORTED_INTENT',
    ].includes(
      error?.code
    )
  ) {
    return 400;
  }

  if (
    error?.code ===
    'ASSISTANT_STAFF_FORBIDDEN'
  ) {
    return 403;
  }

  if (
    [
      'ASSISTANT_MODEL_UNAVAILABLE',
      'ASSISTANT_MODEL_INVALID_RESPONSE',
      'ASSISTANT_CLASSIFIER_INVALID_RESPONSE',
    ].includes(
      error?.code
    )
  ) {
    return 503;
  }

  return 500;
}

exports.ask =
  async (req, res) => {
    try {
      const result =
        await assistantService
          .askAssistant(
            req.user?.id,
            req.body?.message
          );

      return res.json({
        success:
          true,

        reply:
          result.reply,

        data:
          result,
      });
    } catch (error) {
      const status =
        statusFor(error);

      return res
        .status(status)
        .json({
          success:
            false,

          code:
            error?.code ||
            'ASSISTANT_INTERNAL_ERROR',

          message:
            status === 500
              ? 'AI Assistant request failed'
              : error.message,
        });
    }
  };
