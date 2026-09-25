const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

// Helper: Validate password strength
function validatePasswordStrength(password) {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  return { valid: true };
}

// Customer Registration
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, city, address } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // Phone, city, address are also required
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    if (!city || !city.trim()) {
      return res.status(400).json({ success: false, message: 'City is required' });
    }
    if (!address || !address.trim()) {
      return res.status(400).json({ success: false, message: 'Address is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // Check if customer already exists
    const existingCustomer = await Customer.findOne({ where: { email } });
    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create customer with transaction
    const transaction = await Customer.sequelize.transaction();
    
    try {
      // Create customer
      const customer = await Customer.create({
        customer_name: name,
        email,
        password: hashedPassword,
        phone: phone || null,
        customer_city: city || null,
        customer_contact: phone || null,
        address: address || null,
        email_verified: false,
        is_active: true,
        status: 1,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      // Create customer account automatically
      const CustomerAccount = require('../models/CustomerAccount');
      await CustomerAccount.create({
        customer_id: customer.customer_id,
        opening_balance: 0,
        current_balance: 0,
        credit_limit: 50000, // Default credit limit PKR 50,000
        payment_terms: 30, // Default payment terms: 30 days
        total_debit: 0,
        total_credit: 0,
        account_status: 'active',
        status: 1,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      await transaction.commit();

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: customer.customer_id, 
          email: customer.email,
          type: 'customer'
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          token,
          customer: {
            id: customer.customer_id,
            name: customer.customer_name,
            email: customer.email,
            phone: customer.phone,
            city: customer.customer_city,
            address: customer.address,
            emailVerified: customer.email_verified
          }
        }
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (error) {
    console.error('Customer registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
};

// Customer Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find customer
    const customer = await Customer.findOne({ where: { email } });
    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (!customer.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, customer.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: customer.customer_id, 
        email: customer.email,
        type: 'customer'
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Update last login
    await customer.update({ updated_at: new Date() });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        customer: {
          id: customer.customer_id,
          name: customer.customer_name,
          email: customer.email,
          phone: customer.phone,
          city: customer.customer_city,
          address: customer.address,
          emailVerified: customer.email_verified
        }
      }
    });
  } catch (error) {
    console.error('Customer login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
};

// Get Customer Profile
exports.getProfile = async (req, res) => {
  try {
    const customerId = req.user.id;

    const customer = await Customer.findByPk(customerId, {
      attributes: ['customer_id', 'customer_name', 'email', 'phone', 'customer_city', 'customer_contact', 'address', 'email_verified', 'created_at']
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: customer.customer_id,
        name: customer.customer_name,
        email: customer.email,
        phone: customer.phone,
        city: customer.customer_city,
        contact: customer.customer_contact,
        address: customer.address,
        emailVerified: customer.email_verified,
        createdAt: customer.created_at
      }
    });
  } catch (error) {
    console.error('Get customer profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};

// Update Customer Profile
exports.updateProfile = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { name, phone, city, address } = req.body;

    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Update fields
    if (name) customer.customer_name = name;
    if (phone !== undefined) {
      customer.phone = phone;
      customer.customer_contact = phone;
    }
    if (city !== undefined) customer.customer_city = city;
    if (address !== undefined) customer.address = address;
    customer.updated_at = new Date();

    await customer.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: customer.customer_id,
        name: customer.customer_name,
        email: customer.email,
        phone: customer.phone,
        city: customer.customer_city,
        address: customer.address
      }
    });
  } catch (error) {
    console.error('Update customer profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, customer.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    customer.password = hashedPassword;
    customer.updated_at = new Date();
    await customer.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
};

// List all customer (for dashboard)
exports.listCustomers = async (req, res) => {
  try {
    const customer = await Customer.findAll({
      attributes: ['customer_id', 'customer_name', 'email', 'phone', 'customer_city', 'customer_contact', 'is_active', 'created_at', 'updated_at'],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: customer.map(customer => ({
        id: customer.customer_id,
        name: customer.customer_name,
        email: customer.email,
        phone: customer.phone,
        city: customer.customer_city,
        contact: customer.customer_contact,
        isActive: customer.is_active,
        createdAt: customer.created_at,
        updatedAt: customer.updated_at
      }))
    });
  } catch (error) {
    console.error('List customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer'
    });
  }
};

// Create customer (for dashboard - manual entry without password)
exports.createCustomer = async (req, res) => {
  try {
    const { name, email, contact, city, status } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Customer name is required'
      });
    }

    // Check if email already exists (if email provided)
    if (email && email.trim()) {
      const existingCustomer = await Customer.findOne({ where: { email: email.trim() } });
      if (existingCustomer) {
        return res.status(409).json({
          success: false,
          message: 'Email already registered'
        });
      }
    }

    // Create customer without password (manual dashboard entry)
    const customer = await Customer.create({
      customer_name: name.trim(),
      email: email && email.trim() ? email.trim() : null,
      password: null, // No password for manually created customer
      phone: contact || null,
      customer_city: city || null,
      customer_contact: contact || null,
      address: null,
      email_verified: false,
      is_active: status === 'active' ? true : false,
      status: status === 'active' ? 1 : 0,
      created_at: new Date(),
      updated_at: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: {
        id: customer.customer_id,
        name: customer.customer_name,
        email: customer.email,
        phone: customer.phone,
        city: customer.customer_city,
        contact: customer.customer_contact,
        isActive: customer.is_active,
        createdAt: customer.created_at
      }
    });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create customer'
    });
  }
};

// Update customer (for dashboard)
exports.updateCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { name, email, contact, city, status } = req.body;

    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if email already exists (if changing email)
    if (email && email.trim() && email.trim() !== customer.email) {
      const existingCustomer = await Customer.findOne({ where: { email: email.trim() } });
      if (existingCustomer) {
        return res.status(409).json({
          success: false,
          message: 'Email already in use by another customer'
        });
      }
    }

    // Update fields
    if (name && name.trim()) customer.customer_name = name.trim();
    if (email !== undefined) customer.email = email && email.trim() ? email.trim() : null;
    if (contact !== undefined) {
      customer.phone = contact;
      customer.customer_contact = contact;
    }
    if (city !== undefined) customer.customer_city = city;
    if (status !== undefined) {
      customer.is_active = status === 'active';
      customer.status = status === 'active' ? 1 : 0;
    }
    customer.updated_at = new Date();

    await customer.save();

    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: {
        id: customer.customer_id,
        name: customer.customer_name,
        email: customer.email,
        phone: customer.phone,
        city: customer.customer_city,
        contact: customer.customer_contact,
        isActive: customer.is_active,
        updatedAt: customer.updated_at
      }
    });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update customer'
    });
  }
};
