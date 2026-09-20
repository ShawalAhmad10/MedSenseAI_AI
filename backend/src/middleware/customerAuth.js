const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Verify customer JWT token
exports.verifyCustomerToken = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if token is for customer
    if (decoded.type !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Invalid token type'
      });
    }

    // Attach user to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      type: decoded.type
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.'
      });
    }

    console.error('Customer auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Optional customer identity for public storefront requests.
// Anonymous requests remain valid. Identity is trusted only
// after customer JWT verification.
exports.optionalCustomerToken = (req, res, next) => {
  req.customerUser = null;

  const authHeader =
    req.headers.authorization;

  if (
    !authHeader ||
    !authHeader.startsWith('Bearer ')
  ) {
    return next();
  }

  try {
    const token =
      authHeader.substring(7);

    const decoded =
      jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'customer') {
      return next();
    }

    const customerId =
      Number(decoded.id);

    if (
      !Number.isSafeInteger(customerId) ||
      customerId <= 0
    ) {
      return next();
    }

    req.customerUser = {
      id: customerId,
      email: decoded.email,
      type: 'customer'
    };
  } catch {
    req.customerUser = null;
  }

  return next();
};

// AUTHENTICATED_ORDER_IDENTITY_GUARD_V1
// Preserve anonymous storefront compatibility, but never allow a
// verified customer JWT to place an order under another customer ID.
exports.enforceAuthenticatedCustomerOrderIdentity = (req, res, next) => {
  const authenticatedCustomerId =
    Number(req.customerUser?.id);

  if (
    !Number.isSafeInteger(authenticatedCustomerId) ||
    authenticatedCustomerId <= 0
  ) {
    return next();
  }

  const suppliedCustomerId =
    req.body?.customer_id == null
      ? null
      : Number(req.body.customer_id);

  if (
    suppliedCustomerId !== null &&
    (
      !Number.isSafeInteger(suppliedCustomerId) ||
      suppliedCustomerId !== authenticatedCustomerId
    )
  ) {
    return res.status(403).json({
      success: false,
      code: 'CUSTOMER_IDENTITY_MISMATCH',
      message:
        'Authenticated customer identity does not match the order customer.'
    });
  }

  if (!req.body || typeof req.body !== 'object') {
    req.body = {};
  }

  req.body.customer_id = authenticatedCustomerId;

  return next();
};
