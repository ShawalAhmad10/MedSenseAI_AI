// src/utils/email.js
const nodemailer = require('nodemailer');
require('dotenv').config();

// Create reusable transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email transporter error:', error.message);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

/**
 * Send OTP email
 */
const sendOTPEmail = async (email, otp, type = 'registration') => {
  let subject, htmlContent;

  if (type === 'registration') {
    subject = 'Verify Your MedSenseAI Account';
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-box { background: white; border: 2px dashed #667eea; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
          .otp-code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏥 MedSenseAI</h1>
            <p>Welcome to the Future of Pharmacy Management</p>
          </div>
          <div class="content">
            <h2>Verify Your Email Address</h2>
            <p>Hi there!</p>
            <p>Thank you for registering with MedSenseAI. To complete your registration, please verify your email address using the OTP code below:</p>
            <div class="otp-box">
              <p style="margin: 0; font-size: 14px; color: #666;">Your Verification Code</p>
              <p class="otp-code">${otp}</p>
              <p style="margin: 0; font-size: 12px; color: #999;">This code expires in 10 minutes</p>
            </div>
            <p>If you didn't request this code, please ignore this email.</p>
            <p>Best regards,<br><strong>The MedSenseAI Team</strong></p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} MedSenseAI. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  } else if (type === 'password_reset') {
    subject = 'Reset Your MedSenseAI Password';
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-box { background: white; border: 2px dashed #667eea; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
          .otp-code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Password Reset</h1>
            <p>MedSenseAI</p>
          </div>
          <div class="content">
            <h2>Reset Your Password</h2>
            <p>Hi there!</p>
            <p>We received a request to reset your password. Use the OTP code below to create a new password:</p>
            <div class="otp-box">
              <p style="margin: 0; font-size: 14px; color: #666;">Your Reset Code</p>
              <p class="otp-code">${otp}</p>
              <p style="margin: 0; font-size: 12px; color: #999;">This code expires in 10 minutes</p>
            </div>
            <p>If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
            <p>Best regards,<br><strong>The MedSenseAI Team</strong></p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} MedSenseAI. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  const mailOptions = {
    from: `"MedSenseAI" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error.message);
    throw new Error('Failed to send verification email');
  }
};

/**
 * Send welcome email
 */
const sendWelcomeEmail = async (email, fullName) => {
  const mailOptions = {
    from: `"MedSenseAI" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Welcome to MedSenseAI! 🎉',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .features { background: white; border-radius: 10px; padding: 20px; margin: 20px 0; }
          .feature-item { display: flex; align-items: start; margin: 15px 0; }
          .feature-icon { font-size: 24px; margin-right: 15px; }
          .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to MedSenseAI!</h1>
            <p>Your AI-Powered Pharmacy Platform</p>
          </div>
          <div class="content">
            <h2>Hi ${fullName}!</h2>
            <p>Congratulations! Your MedSenseAI account has been successfully activated.</p>
            <p>You now have access to powerful features designed to transform your pharmacy operations:</p>
            <div class="features">
              <div class="feature-item">
                <div class="feature-icon">💊</div>
                <div>
                  <strong>Drug Interaction Detection</strong><br>
                  Real-time alerts for potential drug interactions and contraindications
                </div>
              </div>
              <div class="feature-item">
                <div class="feature-icon">📊</div>
                <div>
                  <strong>AI-Powered Analytics</strong><br>
                  Sales insights, lead scoring, and customer behavior analysis
                </div>
              </div>
              <div class="feature-item">
                <div class="feature-icon">📦</div>
                <div>
                  <strong>Smart Inventory Management</strong><br>
                  Automated stock alerts and demand forecasting
                </div>
              </div>
            </div>
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/pharmacist/login" class="cta-button">Login to Your Dashboard</a>
            </p>
            <p>Need help getting started? Our support team is here to assist you at any time.</p>
            <p>Best regards,<br><strong>The MedSenseAI Team</strong></p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} MedSenseAI. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${email}`);
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error.message);
    // Don't throw error for welcome email failure
  }
};

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail,
};
