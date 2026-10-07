const recommendationService =
  require('../services/medicineRecommendationService');

const interactionAwareRecommendationService =
  require('../services/interactionAwareRecommendationService');

function sendError(
  res,
  error
) {
  const status =
    Number.isInteger(
      error.status
    )
      ? error.status
      : 500;

  res
    .status(status)
    .json({
      success: false,

      error: {
        code:
          error.code ||
          'RECOMMENDATION_INTERNAL_ERROR',

        message:
          status >= 500
            ? 'Medicine recommendation request failed'
            : error.message,
      },
    });
}

exports.byProduct =
  async (req, res) => {
    try {
      const result =
        await recommendationService
          .recommendByProductId(
            req.params.productId,
            req.query.limit
          );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(
        'Product recommendation error:',
        error
      );

      sendError(
        res,
        error
      );
    }
  };

exports.byPrescription =
  async (req, res) => {
    try {
      const result =
        await recommendationService
          .recommendByPrescription(
            req.user.id,
            req.params.prescriptionId,
            req.query.limit
          );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(
        'Prescription recommendation error:',
        error
      );

      sendError(
        res,
        error
      );
    }
  };

exports.interactionAware =
  async (req, res) => {
    try {
      const result =
        await interactionAwareRecommendationService
          .recommendForInteraction({
            sourceProductId:
              req.params.productId,

            cartProductIds:
              req.body?.cart_product_ids,

            limit:
              req.body?.limit,
          });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(
        'Interaction-aware recommendation error:',
        error
      );

      sendError(
        res,
        error
      );
    }
  };

exports.selectAlternative =
  async (req, res) => {
    try {
      const result =
        await recommendationService
          .validateAlternativeSelection({
            sourceProductId:
              req.params.productId,

            alternativeProductId:
              req.body?.alternative_product_id,

            cartItems:
              req.body?.cart_items,
          });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(
        'Alternative selection validation error:',
        error
      );

      sendError(res, error);
    }
  };
