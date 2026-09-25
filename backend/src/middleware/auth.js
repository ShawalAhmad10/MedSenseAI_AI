// Authentication Middleware

const jwt = require('jsonwebtoken');
const { Pharmacist } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const STAFF_ROLES = new Set([
  'pharmacist',
  'admin'
]);

exports.authenticate = async (req, res, next) => {
  try {
    const authHeader =
      req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith('Bearer ')
    ) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required'
      });
    }

    const token =
      authHeader.substring(7);

    const decoded =
      jwt.verify(token, JWT_SECRET);

    // STAFF_AUTH_BOUNDARY_V1
    // A valid customer JWT is still not a staff JWT.
    if (
      !decoded ||
      !STAFF_ROLES.has(decoded.role)
    ) {
      return res.status(403).json({
        success: false,
        code: 'STAFF_ACCESS_REQUIRED',
        message: 'Staff authentication required'
      });
    }

    if (!decoded.id) {
      return res.status(401).json({
        success: false,
        code: 'STAFF_ACCOUNT_INVALID',
        message: 'Staff account is no longer valid'
      });
    }

    const currentUser = await Pharmacist.findByPk(decoded.id);

    if (!currentUser) {
      return res.status(401).json({
        success: false,
        code: 'STAFF_ACCOUNT_INVALID',
        message: 'Staff account is no longer valid'
      });
    }

    if (
      !STAFF_ROLES.has(currentUser.role) ||
      currentUser.role !== decoded.role
    ) {
      return res.status(403).json({
        success: false,
        code: 'STAFF_ACCESS_REQUIRED',
        message: 'Staff authentication no longer matches this account'
      });
    }

    if (currentUser.isActive !== true) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended'
      });
    }

    if (currentUser.role === 'pharmacist') {
      if (!currentUser.isEmailVerified) {
        return res.status(403).json({
          success: false,
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Please verify your email before continuing'
        });
      }

      if (!currentUser.isApproved) {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_NOT_APPROVED',
          message: 'Your pharmacist account is not approved'
        });
      }
    }

    // Downstream authorization uses the current database identity, while
    // retaining model instance methods such as toPublicJSON().
    req.user = currentUser;

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Token expired. Please login again.'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Invalid token. Please login again.'
      });
    }

    console.error('Staff auth middleware error:', error);
    return res.status(500).json({
      success: false,
      code: 'AUTHENTICATION_FAILED',
      message: 'Authentication failed'
    });
  }
};

// Alias for compatibility
exports.authenticateToken =
  exports.authenticate;

exports.verifyPharmacistOnboardingToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      code: 'ONBOARDING_TOKEN_REQUIRED',
      message: 'Google pharmacist onboarding token is required'
    });
  }

  try {
    const decoded = jwt.verify(
      authHeader.substring(7),
      JWT_SECRET
    );

    if (decoded?.type !== 'pharmacist_onboarding') {
      return res.status(403).json({
        success: false,
        code: 'WRONG_ONBOARDING_TOKEN_TYPE',
        message: 'This token cannot be used for pharmacist onboarding'
      });
    }

    if (!decoded.id || !decoded.email) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_ONBOARDING_TOKEN',
        message: 'Invalid Google pharmacist onboarding token'
      });
    }

    req.onboardingUser = {
      id: decoded.id,
      email: decoded.email
    };

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'ONBOARDING_TOKEN_EXPIRED',
        message: 'Google pharmacist onboarding token has expired'
      });
    }

    return res.status(401).json({
      success: false,
      code: 'INVALID_ONBOARDING_TOKEN',
      message: 'Invalid Google pharmacist onboarding token'
    });
  }
};
