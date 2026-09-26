const {
  Pharmacist
} = require('../models');

const {
  verifyToken
} = require('../utils/jwt');


async function verifyPharmacistStatusToken(
  req,
  res,
  next
) {
  const authHeader =
    req.headers.authorization;

  if (
    !authHeader ||
    !authHeader.startsWith(
      'Bearer '
    )
  ) {
    return res.status(401).json({
      success: false,
      code: 'STATUS_AUTH_REQUIRED',
      message:
        'Sign in is required to check pharmacist status.'
    });
  }

  try {
    const decoded =
      verifyToken(
        authHeader.substring(7)
      );

    if (
      !decoded?.id ||
      decoded?.role !==
        'pharmacist'
    ) {
      return res.status(403).json({
        success: false,
        code: 'STATUS_TOKEN_INVALID',
        message:
          'This token cannot be used to check pharmacist status.'
      });
    }

    const pharmacist =
      await Pharmacist.findByPk(
        decoded.id
      );

    if (!pharmacist) {
      return res.status(401).json({
        success: false,
        code: 'STATUS_ACCOUNT_INVALID',
        message:
          'Pharmacist account is no longer available.'
      });
    }

    if (
      pharmacist.role !==
        'pharmacist'
    ) {
      return res.status(403).json({
        success: false,
        code: 'STATUS_ROLE_INVALID',
        message:
          'This account cannot use pharmacist status lookup.'
      });
    }

    if (
      decoded.email !==
        pharmacist.email
    ) {
      return res.status(401).json({
        success: false,
        code: 'STATUS_IDENTITY_STALE',
        message:
          'Status authorization is no longer valid.'
      });
    }

    if (!pharmacist.isActive) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        message:
          'Your account has been suspended.'
      });
    }

    if (!pharmacist.isEmailVerified) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message:
          'Email verification is required.'
      });
    }

    req.statusPharmacist =
      pharmacist;

    return next();
  } catch (error) {
    if (
      error?.message ===
        'TOKEN_EXPIRED'
    ) {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message:
          'Your session has expired. Please sign in again.'
      });
    }

    return res.status(401).json({
      success: false,
      code: 'INVALID_TOKEN',
      message:
        'Invalid status authorization.'
    });
  }
}


module.exports = {
  verifyPharmacistStatusToken
};
