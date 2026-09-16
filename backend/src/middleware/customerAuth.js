const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'medsenseai-customer-secret-key-2024';

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
