const prescriptionService =
  require('../services/prescriptionService');

function sendError(
  res,
  error
) {
  const status =
    Number(
      error?.httpStatus
    ) || 500;

  return res
    .status(status)
    .json({
      success: false,

      code:
        error?.code ||
        'PRESCRIPTION_INTERNAL_ERROR',

      message:
        error?.message ||
        'Prescription request failed',
    });
}

exports.analyze =
  async (req, res) => {
    try {
      const result =
        await prescriptionService
          .analyzePrescription(
            req.user.id,
            req.body || {}
          );

      return res
        .status(201)
        .json({
          success:
            true,

          data:
            result,
        });
    } catch (error) {
      console.error(
        'Prescription analysis error:',
        error.message
      );

      return sendError(
        res,
        error
      );
    }
  };

exports.listMine =
  async (req, res) => {
    try {
      const rows =
        await prescriptionService
          .listCustomerPrescriptions(
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

exports.getMine =
  async (req, res) => {
    try {
      const row =
        await prescriptionService
          .getCustomerPrescription(
            req.user.id,
            req.params
              .prescriptionId
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
exports.confirmMine =
  async (req, res) => {
    try {
      const row =
        await prescriptionService
          .confirmCustomerPrescription(
            req.user.id,
            req.params
              .prescriptionId,
            req.body || {}
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


exports.listForPharmacist =
  async (req, res) => {
    try {
      const rows =
        await prescriptionService
          .listPharmacistPrescriptions();

      return res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  };

exports.getForPharmacist =
  async (req, res) => {
    try {
      const row =
        await prescriptionService
          .getPharmacistPrescription(
            req.params
              .prescriptionId
          );

      return res.json({
        success: true,
        data: row,
      });
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  };

exports.reviewForPharmacist =
  async (req, res) => {
    try {
      const row =
        await prescriptionService
          .reviewPharmacistPrescription(
            req.params
              .prescriptionId,

            req.user?.id,

            req.body || {}
          );

      return res.json({
        success: true,
        data: row,
      });
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  };
