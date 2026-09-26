// src/controllers/authController.js
const { randomInt } = require('crypto');
const { Pharmacist } = require('../models');
const {
  generateToken,
  generatePharmacistOnboardingToken,
} = require('../utils/jwt');
const { sendOTPEmail, sendWelcomeEmail } = require('../utils/email');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Register new pharmacist
 */
exports.register = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      licenseNumber,
      city,
      province,
      phone,
      address,
    } = req.body;

    // Validation
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide full name, email, and password',
      });
    }

    // Check if email already exists
    const existingUser = await Pharmacist.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered',
      });
    }

    // Generate OTP
    const otpCode = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user
    const user = await Pharmacist.create({
      fullName,
      email,
      password,
      phone: phone || null,
      licenseNumber: licenseNumber || null,
      city: city || null,
      province: province || null,
      address: address || null,
      isEmailVerified: false,
      isApproved: false,
      isActive: true,
      otpCode,
      otpExpiresAt: expiresAt,
      role: 'pharmacist',
    });

    // Send OTP email — wrapped so email failure doesn't fail the registration
    let emailSent = false;
    try {
      await sendOTPEmail(email, otpCode, 'registration');
      emailSent = true;
    } catch (emailError) {
      console.error('⚠️ OTP email failed (registration still succeeded):', emailError.message);
      // User is created — don't return 500. They can request a new OTP.
    }

    return res.status(201).json({
      success: true,
      message: emailSent
        ? 'Registration successful! Please verify your email with the OTP sent to your inbox.'
        : 'Registration successful! Email could not be sent — please use "Resend OTP" to verify your account.',
      data: {
        email: user.email,
        requiresVerification: true,
        emailSent,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed',
    });
  }
};

/**
 * Verify OTP and activate account
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required',
      });
    }

    // Find pharmacist
    const pharmacist = await Pharmacist.findOne({ where: { email } });
    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check OTP
    if (!pharmacist.otpCode || pharmacist.otpCode !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    // Check if OTP expired
    if (new Date() > pharmacist.otpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired',
      });
    }

    // Verify email and approve user
    pharmacist.isEmailVerified = true;
    pharmacist.isApproved = true; // Directly approve after OTP
    pharmacist.isActive = true;
    pharmacist.otpCode = null;
    pharmacist.otpExpiresAt = null;
    await pharmacist.save();

    // ✅ AUTO-ADD TO TEAM MEMBERS
    const { sequelize } = require('../config/database');
    try {
      // Check if already in team members
      const [existing] = await sequelize.query(
        'SELECT * FROM team_members WHERE user_id = :userId',
        { replacements: { userId: pharmacist.id } }
      );

      if (existing.length === 0) {
        // Add to team members
        await sequelize.query(
          `INSERT INTO team_members (user_id, position, joined_date, is_active, created_at, updated_at)
           VALUES (:userId, :position, :joinedDate, :isActive, NOW(), NOW())`,
          {
            replacements: {
              userId: pharmacist.id,
              position: pharmacist.role || 'pharmacist',
              joinedDate: new Date(),
              isActive: true
            }
          }
        );
        console.log(`✅ User ${pharmacist.email} auto-added to team members`);
      }
    } catch (teamError) {
      console.error('⚠️  Failed to auto-add to team members:', teamError.message);
      // Don't fail the verification if team member creation fails
    }

    // Send welcome email — non-blocking, failure doesn't break verification
    try { await sendWelcomeEmail(email, pharmacist.fullName); } catch (e) { console.error('Welcome email failed:', e.message); }

    // Generate token
    const token = generateToken({
      id: pharmacist.id,
      email: pharmacist.email,
      role: 'pharmacist',
    });

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully! Your account is now active.',
      data: {
        token,
        user: pharmacist.toPublicJSON(),
      },
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'OTP verification failed',
    });
  }
};

/**
 * Resend OTP
 */
exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const pharmacist = await Pharmacist.findOne({ where: { email } });
    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (pharmacist.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified',
      });
    }

    // Generate new OTP
    const otpCode = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    pharmacist.otpCode = otpCode;
    pharmacist.otpExpiresAt = expiresAt;
    await pharmacist.save();

    // Send OTP email — non-blocking
    let resendEmailSent = false;
    try {
      await sendOTPEmail(email, otpCode, 'registration');
      resendEmailSent = true;
    } catch (emailErr) {
      console.error('Resend OTP email failed:', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: resendEmailSent ? 'OTP resent successfully' : 'OTP generated but email could not be sent. Please try again.',
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to resend OTP',
    });
  }
};

/**
 * Login with email and password
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find pharmacist
    const pharmacist = await Pharmacist.findOne({ where: { email } });
    if (!pharmacist) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check password
    const isPasswordValid = await pharmacist.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check if email is verified
    if (!pharmacist.isEmailVerified) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before logging in',
        data: { email: pharmacist.email },
      });
    }

    // Check account status
    if (!pharmacist.isActive) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Please contact support.',
      });
    }

    // Generate token
    const token = generateToken({
      id: pharmacist.id,
      email: pharmacist.email,
      role: 'pharmacist',
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: pharmacist.toPublicJSON(),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed',
    });
  }
};

/**
 * Google OAuth login/signup
 */
exports.googleLogin = async (req, res) => {
  try {
    const { idToken, accessToken } = req.body;

    if (!idToken && !accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Google token is required',
      });
    }

    let payload;

    // If access token is provided, use it to get user info from Google API
    if (accessToken) {
      try {
        const axios = require('axios');
        const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        payload = {
          sub: response.data.sub,
          email: response.data.email,
          name: response.data.name,
          email_verified: response.data.email_verified,
        };
      } catch (error) {
        console.error('Google API error:', error.response?.data || error.message);
        return res.status(401).json({
          success: false,
          message: 'Invalid Google access token',
        });
      }
    } else {
      // Verify Google ID token
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    }

    const { sub: googleId, email, name, email_verified } = payload;

    if (!email_verified) {
      return res.status(400).json({
        success: false,
        message: 'Google email not verified',
      });
    }

    // Find existing pharmacist by googleId or email
    let pharmacist = await Pharmacist.findOne({
      where: {
        [require('sequelize').Op.or]: [{ googleId }, { email }],
      },
    });

    if (pharmacist) {
      // Existing user
      // Check account status
      if (!pharmacist.isActive) {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_SUSPENDED',
          message: 'Your account has been suspended',
        });
      }

      // Update googleId if not set
      if (!pharmacist.googleId) {
        pharmacist.googleId = googleId;
      } else if (pharmacist.googleId !== googleId) {
        return res.status(409).json({
          success: false,
          code: 'GOOGLE_ACCOUNT_MISMATCH',
          message: 'This pharmacist account is linked to a different Google account',
        });
      }
      pharmacist.isEmailVerified = true;
      await pharmacist.save();

      if (!pharmacist.licenseNumber || pharmacist.licenseNumber === 'Pending') {
        const onboardingToken = generatePharmacistOnboardingToken({
          id: pharmacist.id,
          email: pharmacist.email,
        });

        return res.status(200).json({
          success: true,
          message: 'Please complete your pharmacy details',
          data: {
            requiresPharmacyDetails: true,
            isNewAccount: false,
            email: pharmacist.email,
            fullName: pharmacist.fullName,
            id: pharmacist.id,
            licenseNumber: pharmacist.licenseNumber,
            city: pharmacist.city,
            province: pharmacist.province,
            phone: pharmacist.phone,
            address: pharmacist.address,
            onboardingToken,
          },
        });
      }

      pharmacist.isApproved = true;
      await pharmacist.save();

      // Generate token
      const token = generateToken({
        id: pharmacist.id,
        email: pharmacist.email,
        role: 'pharmacist',
      });

      return res.status(200).json({
        success: true,
        message: 'Google login successful',
        data: {
          token,
          user: pharmacist.toPublicJSON(),
        },
      });
    } else {
      // New user - create partial account
      pharmacist = await Pharmacist.create({
        fullName: name,
        email,
        googleId,
        isEmailVerified: true,
        isApproved: false,
        isActive: true,
        licenseNumber: 'Pending',
        city: 'Pending',
        province: 'Punjab',
        phone: 'Pending',
        role: 'pharmacist',
      });

      const onboardingToken = generatePharmacistOnboardingToken({
        id: pharmacist.id,
        email: pharmacist.email,
      });

      return res.status(200).json({
        success: true,
        message: 'Google account linked. Please complete your pharmacy details.',
        data: {
          requiresPharmacyDetails: true,
          isNewAccount: true,
          email: pharmacist.email,
          fullName: pharmacist.fullName,
          id: pharmacist.id,
          onboardingToken,
        },
      });
    }
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Google login failed',
    });
  }
};

/**
 * Complete Google user profile with pharmacy details
 */
exports.completeProfile = async (req, res) => {
  try {
    const {
      licenseNumber,
      city,
      province,
      phone,
      address,
    } = req.body;

    if (!licenseNumber || !city || !province || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    const user = await Pharmacist.findByPk(req.onboardingUser.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.email !== req.onboardingUser.email) {
      return res.status(401).json({
        success: false,
        code: 'ONBOARDING_IDENTITY_MISMATCH',
        message: 'Onboarding identity no longer matches this account',
      });
    }

    if (!user.googleId || !user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        code: 'GOOGLE_IDENTITY_REQUIRED',
        message: 'A verified Google-linked account is required',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended',
      });
    }

    if (user.licenseNumber && user.licenseNumber !== 'Pending') {
      return res.status(409).json({
        success: false,
        code: 'PROFILE_ALREADY_COMPLETE',
        message: 'This pharmacist profile has already been completed',
      });
    }

    // Update profile details
    user.licenseNumber = licenseNumber;
    user.city = city;
    user.province = province;
    user.phone = phone;
    user.address = address;
    user.isApproved = true; // Approve immediately after completing profile
    await user.save();

    // ✅ AUTO-ADD TO TEAM MEMBERS
    const { sequelize } = require('../config/database');
    try {
      const [existing] = await sequelize.query(
        'SELECT * FROM team_members WHERE user_id = :userId',
        { replacements: { userId: user.id } }
      );

      if (existing.length === 0) {
        await sequelize.query(
          `INSERT INTO team_members (user_id, position, joined_date, is_active, created_at, updated_at)
           VALUES (:userId, :position, :joinedDate, :isActive, NOW(), NOW())`,
          {
            replacements: {
              userId: user.id,
              position: user.role || 'pharmacist',
              joinedDate: new Date(),
              isActive: true
            }
          }
        );
        console.log(`✅ User ${user.email} auto-added to team members`);
      }
    } catch (teamError) {
      console.error('⚠️  Failed to auto-add to team members:', teamError.message);
    }

    // Send welcome email — non-blocking
    try { await sendWelcomeEmail(user.email, user.fullName); } catch (e) { console.error('Welcome email failed:', e.message); }

    // Generate token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: 'pharmacist',
    });

    return res.status(200).json({
      success: true,
      message: 'Profile completed successfully! Your account is now active.',
      data: {
        token,
        user: user.toPublicJSON(),
      },
    });
  } catch (error) {
    console.error('Complete profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to complete profile',
    });
  }
};

/**
 * Forgot password - send OTP
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const pharmacist = await Pharmacist.findOne({ where: { email } });
    if (!pharmacist) {
      // Don't reveal if email exists
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a password reset code has been sent',
      });
    }

    // Generate OTP
    const otpCode = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    pharmacist.resetOtpCode = otpCode;
    pharmacist.resetOtpExpiresAt = expiresAt;
    await pharmacist.save();

    // Send OTP email — non-blocking
    let resetEmailSent = false;
    try {
      await sendOTPEmail(email, otpCode, 'password_reset');
      resetEmailSent = true;
    } catch (emailErr) {
      console.error('Password reset email failed:', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: resetEmailSent
        ? 'Password reset code sent to your email'
        : 'Reset code generated but email could not be sent. Please contact support.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
    });
  }
};

/**
 * Reset password with OTP
 */
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, and new password are required',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
    }

    // Find pharmacist
    const pharmacist = await Pharmacist.findOne({ where: { email } });
    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check OTP
    if (!pharmacist.resetOtpCode || pharmacist.resetOtpCode !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    // Check if OTP expired
    if (new Date() > pharmacist.resetOtpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired',
      });
    }

    // Update password
    pharmacist.password = newPassword;
    pharmacist.resetOtpCode = null;
    pharmacist.resetOtpExpiresAt = null;
    await pharmacist.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset password',
    });
  }
};

/**
 * Get current user info
 */
exports.getMe = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: req.user.toPublicJSON(),
    });
  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get user info',
    });
  }
};

/**
 * Logout (optional - mainly client-side token removal)
 */
exports.logout = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
};

/**
 * Update pharmacist profile (name, phone)
 */
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, phone, currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const user = await Pharmacist.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // If password change is requested
    if (currentPassword && newPassword) {
      // Verify current password
      const isPasswordValid = await user.comparePassword(currentPassword);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect',
        });
      }

      // Validate new password
      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 8 characters',
        });
      }

      if (!/[A-Z]/.test(newPassword)) {
        return res.status(400).json({
          success: false,
          message: 'New password must contain at least one uppercase letter',
        });
      }

      // Update password
      user.password = newPassword;
    }

    // Update profile fields
    if (fullName) {
      user.fullName = fullName;
    }
    if (phone !== undefined) {
      user.phone = phone;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: user.toPublicJSON(),
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
    });
  }
};

/**
 * Check approval status
 */
exports.checkStatus = async (req, res) => {
  try {
    const pharmacist =
      req.statusPharmacist;

    if (!pharmacist) {
      return res.status(401).json({
        success: false,
        code: 'STATUS_AUTH_REQUIRED',
        message:
          'Sign in is required to check pharmacist status.',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        status:
          pharmacist.getStatus(),

        isEmailVerified:
          pharmacist.isEmailVerified,

        isApproved:
          pharmacist.isApproved,
      },
    });
  } catch (error) {
    console.error(
      'Check status error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        'Failed to check status',
    });
  }
};


/**
 * Select plan (optional feature)
 */
exports.selectPlan = async (req, res) => {
  try {
    const { plan, billing } = req.body;
    const userId = req.user.id;

    if (!plan || !billing) {
      return res.status(400).json({
        success: false,
        message: 'Plan and billing type are required',
      });
    }

    const validPlans = [
      'free',
      'pro',
      'basic',
    ];

    if (!validPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected',
      });
    }

    const validBilling = [
      'monthly',
      'annual',
    ];

    if (!validBilling.includes(billing)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid billing type',
      });
    }

    const pharmacist =
      await Pharmacist.findByPk(userId);

    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    pharmacist.plan = plan;
    pharmacist.billing = billing;

    await pharmacist.save();

    return res.status(200).json({
      success: true,
      message: 'Plan selected successfully',
      data: {
        plan: pharmacist.plan,
        billing: pharmacist.billing,
      },
    });
  } catch (error) {
    console.error(
      'Select plan error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to select plan',
    });
  }
};


/**
 * Upgrade plan (for authenticated users)
 */
exports.upgradePlan = async (req, res) => {
  try {
    const { plan, billing } = req.body;
    const userId = req.user.id;

    if (!plan || !billing) {
      return res.status(400).json({
        success: false,
        message: 'Plan and billing type are required',
      });
    }

    // Validate plan
    const validPlans = ['free', 'pro', 'basic'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected',
      });
    }

    // Validate billing
    const validBilling = ['monthly', 'annual'];
    if (!validBilling.includes(billing)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid billing type',
      });
    }

    const user = await Pharmacist.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    user.plan = plan;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `Plan upgraded to ${plan} successfully`,
      data: user.toPublicJSON(),
    });
  } catch (error) {
    console.error('Upgrade plan error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upgrade plan',
    });
  }
};
