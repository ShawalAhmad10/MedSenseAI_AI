const jwt = require('jsonwebtoken');
const { Customer } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Verify customer JWT token
function customerIdentity(customer) {
  return {
    id: customer.customer_id,
    email: customer.email,
    type: 'customer'
  };
}

function isCustomerInactive(customer) {
  return (
    customer.is_active === false ||
    customer.is_active === 0 ||
    customer.status === 0
  );
}

async function loadCurrentCustomer(decoded, res) {
  if (decoded?.type !== 'customer') {
    res.status(403).json({
      success: false,
      code: 'INVALID_TOKEN',
      message: 'Invalid customer token type'
    });
    return null;
  }

  const customerId = Number(decoded.id);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) {
    res.status(401).json({
      success: false,
      code: 'CUSTOMER_ACCOUNT_INVALID',
      message: 'Customer account is no longer valid'
    });
    return null;
  }

  const customer = await Customer.findByPk(customerId);
  if (!customer) {
    res.status(401).json({
      success: false,
      code: 'CUSTOMER_ACCOUNT_INVALID',
      message: 'Customer account is no longer valid'
    });
    return null;
  }

  if (isCustomerInactive(customer)) {
    res.status(403).json({
      success: false,
      code: 'CUSTOMER_ACCOUNT_INACTIVE',
      message: 'Customer account is inactive'
    });
    return null;
  }

  return customer;
}

function handleCustomerTokenError(error, res) {
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

  console.error('Customer auth middleware error:', error);
  return res.status(500).json({
    success: false,
    code: 'AUTHENTICATION_FAILED',
    message: 'Authentication failed'
  });
}

exports.verifyCustomerToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'No token provided. Please login.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    const customer = await loadCurrentCustomer(decoded, res);
    if (!customer) return;

    req.user = customerIdentity(customer);

    return next();
  } catch (error) {
    return handleCustomerTokenError(error, res);
  }
};

// Optional customer identity for public storefront requests.
// Anonymous requests remain valid. Identity is trusted only
// after customer JWT verification.
exports.optionalCustomerToken = async (req, res, next) => {
  req.customerUser = null;

  const authHeader =
    req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      code: 'INVALID_TOKEN',
      message: 'Invalid authorization header'
    });
  }

  try {
    const token =
      authHeader.substring(7);

    const decoded =
      jwt.verify(token, JWT_SECRET);

    const customer = await loadCurrentCustomer(decoded, res);
    if (!customer) return;

    req.customerUser = customerIdentity(customer);
    return next();
  } catch (error) {
    return handleCustomerTokenError(error, res);
  }
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
