// src/utils/jwt.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Generate JWT token
 */
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

/**
 * Generate the short-lived token used only while a Google pharmacist
 * finishes their pharmacy profile.
 */
const generatePharmacistOnboardingToken = ({ id, email }) => {
  return jwt.sign(
    {
      id,
      email,
      type: 'pharmacist_onboarding',
    },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
};

/**
 * Verify JWT token
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('TOKEN_EXPIRED');
    }
    throw new Error('INVALID_TOKEN');
  }
};

module.exports = {
  generateToken,
  generatePharmacistOnboardingToken,
  verifyToken,
};
