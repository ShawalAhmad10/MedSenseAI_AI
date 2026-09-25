const rateLimit = require('express-rate-limit');

function createAuthLimiter({
  windowMs,
  max,
  message,
  skipSuccessfulRequests = false,
}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    message: {
      success: false,
      code: 'AUTH_RATE_LIMITED',
      message,
    },
  });
}

const pharmacistLoginLimiter =
  createAuthLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    message:
      'Too many login attempts. Please try again later.',
  });

const pharmacistOtpVerifyLimiter =
  createAuthLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    message:
      'Too many verification attempts. Please try again later.',
  });

const pharmacistResetLimiter =
  createAuthLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    message:
      'Too many password reset attempts. Please try again later.',
  });

const pharmacistOtpSendLimiter =
  createAuthLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message:
      'Too many verification code requests. Please try again later.',
  });

const pharmacistRegistrationLimiter =
  createAuthLimiter({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message:
      'Too many registration attempts. Please try again later.',
  });

const pharmacistGoogleLimiter =
  createAuthLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message:
      'Too many sign-in attempts. Please try again later.',
  });

const pharmacistStatusLimiter =
  createAuthLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message:
      'Too many status requests. Please try again later.',
  });

const customerLoginLimiter =
  createAuthLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    message:
      'Too many login attempts. Please try again later.',
  });

const customerRegistrationLimiter =
  createAuthLimiter({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message:
      'Too many registration attempts. Please try again later.',
  });

module.exports = {
  pharmacistLoginLimiter,
  pharmacistOtpVerifyLimiter,
  pharmacistResetLimiter,
  pharmacistOtpSendLimiter,
  pharmacistRegistrationLimiter,
  pharmacistGoogleLimiter,
  pharmacistStatusLimiter,
  customerLoginLimiter,
  customerRegistrationLimiter,
};
