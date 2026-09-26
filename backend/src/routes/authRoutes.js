// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const {
  authenticateToken,
  verifyPharmacistOnboardingToken,
} = require('../middleware/auth');

const {
  verifyPharmacistStatusToken
} = require('../middleware/pharmacistStatusAuth');
const { body } = require('express-validator');

const {
  pharmacistLoginLimiter,
  pharmacistOtpVerifyLimiter,
  pharmacistResetLimiter,
  pharmacistOtpSendLimiter,
  pharmacistRegistrationLimiter,
  pharmacistGoogleLimiter,
  pharmacistStatusLimiter,
} = require('../middleware/authRateLimiters');

// Validation middleware
const validateRegistration = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('fullName').notEmpty().withMessage('Full name is required'),
  body('pharmacyName').notEmpty().withMessage('Pharmacy name is required'),
  body('licenseNumber').notEmpty().withMessage('License number is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('province').notEmpty().withMessage('Province is required'),
  body('phone').notEmpty().withMessage('Phone is required'),
];

const validateLogin = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Public routes
router.post(
  '/pharmacist/register',
  pharmacistRegistrationLimiter,
  authController.register
);
router.post(
  '/pharmacist/login',
  pharmacistLoginLimiter,
  authController.login
);
router.post(
  '/pharmacist/verify-otp',
  pharmacistOtpVerifyLimiter,
  authController.verifyOtp
);
router.post(
  '/pharmacist/resend-otp',
  pharmacistOtpSendLimiter,
  authController.resendOtp
);
router.post(
  '/pharmacist/forgot-password',
  pharmacistOtpSendLimiter,
  authController.forgotPassword
);
router.post(
  '/pharmacist/reset-password',
  pharmacistResetLimiter,
  authController.resetPassword
);
router.post(
  '/pharmacist/google',
  pharmacistGoogleLimiter,
  authController.googleLogin
);
router.post(
  '/pharmacist/complete-profile',
  verifyPharmacistOnboardingToken,
  authController.completeProfile
);
router.get(
  '/pharmacist/status',
  pharmacistStatusLimiter,
  verifyPharmacistStatusToken,
  authController.checkStatus
);
router.post(
  '/pharmacist/select-plan',
  authenticateToken,
  authController.selectPlan
);

// Protected routes
router.get('/pharmacist/me', authenticateToken, authController.getMe);
router.post('/pharmacist/logout', authenticateToken, authController.logout);
router.patch('/pharmacist/me', authenticateToken, authController.updateProfile);
router.post('/pharmacist/upgrade-plan', authenticateToken, authController.upgradePlan);

module.exports = router;
