const Customer = require('../models/Customer');
const CustomerAccount = require('../models/CustomerAccount');
const CustomerLedger = require('../models/CustomerLedger');
const { sequelize } = require('../config/database');

// ─────────────────────────────────────────────
// LIST ALL CUSTOMERS
// ─────────────────────────────────────────────
exports.listCustomers = async (req, res) => {
  try {
    const { search = '', status = 'all' } = req.query;

    let whereClause = 'WHERE c.status = 1';

    if (search && search.trim()) {
      whereClause += ` AND (
        c.customer_name ILIKE '%${search.trim()}%' OR
        c.email        ILIKE '%${search.trim()}%' OR
        c.phone        ILIKE '%${search.trim()}%' OR
        c.customer_city ILIKE '%${search.trim()}%'
      )`;
    }

    if (status !== 'all') {
      whereClause += ` AND ca.account_status = '${status}'`;
    }

    const customer = await sequelize.query(`
      SELECT
        c.customer_id,
        c.customer_name,
        c.email,
        c.phone,
        c.customer_city,
        c.customer_contact,
        c.address,
        c.is_active,
        c.created_at,
        ca.account_id,
        ca.current_balance,
        ca.total_debit,
        ca.total_credit,
        ca.credit_limit,
        ca.payment_terms,
        ca.account_status,
        COALESCE(os.total_orders,    0) AS total_orders,
        COALESCE(os.total_spent,     0) AS total_spent,
        COALESCE(os.last_order_date, NULL) AS last_order_date
      FROM customer c
      LEFT JOIN customer_accounts ca
        ON c.customer_id = ca.customer_id AND ca.status = 1
      LEFT JOIN (
        SELECT
          customer_id,
          COUNT(*)          AS total_orders,
          SUM(total_amount) AS total_spent,
          MAX(created_at)   AS last_order_date
        FROM invoice
        WHERE status = 1 AND customer_id IS NOT NULL
        GROUP BY customer_id
      ) os ON c.customer_id = os.customer_id
      ${whereClause}
      ORDER BY c.created_at DESC
    `, { type: sequelize.QueryTypes.SELECT });

    const totalReceivable = customer.reduce((s, c) => s + Number(c.current_balance || 0), 0);
    const totalPayments   = customer.reduce((s, c) => s + Number(c.total_credit   || 0), 0);

    res.json({
      success: true,
      data: {
        customers: customer.map(c => ({
          id:            c.customer_id,
          customerId:    c.customer_id,
          name:          c.customer_name,
          email:         c.email,
          phone:         c.phone,
          city:          c.customer_city,
          contact:       c.customer_contact,
          address:       c.address,
          isActive:      c.is_active,
          createdAt:     c.created_at,
          accountId:     c.account_id,
          currentBalance: Number(c.current_balance || 0),
          totalDebit:    Number(c.total_debit  || 0),
          totalCredit:   Number(c.total_credit || 0),
          creditLimit:   Number(c.credit_limit || 0),
          paymentTerms:  c.payment_terms,
          accountStatus: c.account_status || 'active',
          status:        c.is_active ? 'active' : 'inactive',
          totalOrders:   Number(c.total_orders || 0),
          totalSpent:    Number(c.total_spent  || 0),
          totalPaid:     Number(c.total_credit || 0),   // ← totalCredit = cash received = totalPaid
          lastOrderDate: c.last_order_date
        })),
        stats: {
          totalCustomers:   customer.length,
          activeCustomers:  customer.filter(c => c.account_status === 'active').length,
          totalReceivable,
          totalPayments
        }
      }
    });
  } catch (error) {
    console.error('List customer error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer' });
  }
};

// ─────────────────────────────────────────────
// GET CUSTOMER DETAILS  (uses customer_ledger)
// ─────────────────────────────────────────────
exports.getCustomerDetails = async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const account = await CustomerAccount.findOne({
      where: { customer_id: customerId, status: 1 }
    });

    // Fetch from actual customer_ledger table
    const ledgerEntries = await sequelize.query(`
      SELECT
        ledger_id,
        transaction_date,
        transaction_type,
        reference_type,
        reference_number,
        debit_amount,
        credit_amount,
        balance,
        payment_method,
        product_id,
        product_quantity,
        description,
        performed_by,
        created_at
      FROM customer_ledger
      WHERE customer_id = :customerId AND status = 1
      ORDER BY created_at DESC
      LIMIT 100
    `, {
      replacements: { customerId },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: {
        customer: {
          id:        customer.customer_id,
          name:      customer.customer_name,
          email:     customer.email,
          phone:     customer.phone,
          city:      customer.customer_city,
          address:   customer.address,
          isActive:  customer.is_active,
          createdAt: customer.created_at
        },
        account: account ? {
          accountId:      account.account_id,
          currentBalance: Number(account.current_balance || 0),  // total outstanding (unpaid invoice)
          totalDebit:     Number(account.total_debit     || 0),  // total invoiced
          totalCredit:    Number(account.total_credit    || 0),  // total cash received
          creditLimit:    Number(account.credit_limit || 0),
          paymentTerms:   Number(account.payment_terms || 0),
          accountStatus:  account.account_status
        } : null,
        ledgerEntries: ledgerEntries.map(e => ({
          ledgerId:        e.ledger_id,
          transactionDate: e.transaction_date,
          paymentDate:     e.transaction_date,
          transactionType: e.transaction_type,
          referenceType:   e.reference_type,
          referenceNumber: e.reference_number,
          debitAmount:     Number(e.debit_amount  || 0),
          creditAmount:    Number(e.credit_amount || 0),
          amount:          Number(e.credit_amount || 0),
          balance:         Number(e.balance       || 0),
          paymentMethod:   e.payment_method || 'cash',
          paymentStatus:   e.transaction_type === 'payment' ? 'paid' : 'pending',
          productId:       e.product_id       || null,
          productQuantity: e.product_quantity || null,
          description:     e.description,
          notes:           e.description,
          performedBy:     e.performed_by,
          createdAt:       e.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Get customer details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer details' });
  }
};

// ─────────────────────────────────────────────
// CREATE CUSTOMER
// ─────────────────────────────────────────────
exports.createCustomer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { name, email, phone, city, address, openingBalance = 0, notes } = req.body;

    // Required field checks
    if (!name    || !name.trim())    { await transaction.rollback(); return res.status(400).json({ success: false, message: 'Customer name is required' }); }
    if (!phone   || !phone.trim())   { await transaction.rollback(); return res.status(400).json({ success: false, message: 'Phone number is required' }); }
    if (!city    || !city.trim())    { await transaction.rollback(); return res.status(400).json({ success: false, message: 'City is required' }); }
    if (!address || !address.trim()) { await transaction.rollback(); return res.status(400).json({ success: false, message: 'Address is required' }); }

    // Email uniqueness
    if (email && email.trim()) {
      const exists = await Customer.findOne({ where: { email: email.trim() } });
      if (exists) {
        await transaction.rollback();
        return res.status(409).json({ success: false, message: 'Email already registered' });
      }
    }

    const customer = await Customer.create({
      customer_name:   name.trim(),
      email:           email && email.trim() ? email.trim() : null,
      phone:           phone.trim(),
      customer_city:   city.trim(),
      customer_contact: phone.trim(),
      address:         address.trim(),
      is_active: true,
      status: 1,
      created_at: new Date(),
      updated_at: new Date()
    }, { transaction });

    const account = await CustomerAccount.create({
      customer_id:     customer.customer_id,
      current_balance: Number(openingBalance || 0),
      total_debit:     0,
      total_credit:    0,
      credit_limit:    0,
      payment_terms:   30,
      account_status:  'active',
      notes:           notes || null,
      created_at: new Date(),
      updated_at: new Date(),
      status: 1
    }, { transaction });

    // Opening balance ledger entry (only if non-zero)
    if (Number(openingBalance) > 0) {
      await CustomerLedger.create({
        customer_id:      customer.customer_id,
        account_id:       account.account_id,
        transaction_date: new Date(),
        transaction_type: 'opening_balance',
        reference_type:   'OPENING',
        reference_number: `OPEN-${customer.customer_id}`,
        debit_amount:     Number(openingBalance),
        credit_amount:    0,
        balance:          Number(openingBalance),
        description:      'Opening balance',
        performed_by:     req.user?.email || 'System',
        created_at: new Date(),
        updated_at: new Date(),
        status: 1
      }, { transaction });
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: {
        customerId: customer.customer_id,
        accountId:  account.account_id,
        name:       customer.customer_name,
        email:      customer.email,
        phone:      customer.phone,
        city:       customer.customer_city,
        address:    customer.address,
        currentBalance: Number(account.current_balance)
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Create customer error:', error);
    res.status(500).json({ success: false, message: 'Failed to create customer' });
  }
};

// ─────────────────────────────────────────────
// UPDATE CUSTOMER
// ─────────────────────────────────────────────
exports.updateCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { name, email, phone, city, address, accountStatus, notes } = req.body;

    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (email && email.trim() && email.trim() !== customer.email) {
      const exists = await Customer.findOne({ where: { email: email.trim() } });
      if (exists) return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    if (name    && name.trim())    { customer.customer_name    = name.trim(); }
    if (email   !== undefined)     { customer.email            = email && email.trim() ? email.trim() : null; }
    if (phone   !== undefined)     { customer.phone = customer.customer_contact = phone; }
    if (city    !== undefined)     { customer.customer_city    = city; }
    if (address !== undefined)     { customer.address          = address; }
    customer.updated_at = new Date();
    await customer.save();

    const account = await CustomerAccount.findOne({ where: { customer_id: customerId, status: 1 } });
    if (account) {
      if (accountStatus !== undefined) account.account_status = accountStatus;
      if (notes         !== undefined) account.notes          = notes;
      account.updated_at = new Date();
      await account.save();
    }

    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: { customerId: customer.customer_id, name: customer.customer_name, email: customer.email, phone: customer.phone }
    });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ success: false, message: 'Failed to update customer' });
  }
};

// ─────────────────────────────────────────────
// GET CUSTOMER LEDGER
// ─────────────────────────────────────────────
exports.getCustomerLedger = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { type, fromDate, toDate } = req.query;

    // transaction_type values: 'opening_balance' | 'invoice' | 'payment'
    let where = 'customer_id = :customerId AND status = 1';
    const replacements = { customerId };

    if (type && type !== 'all') {
      where += ' AND transaction_type = :type';
      replacements.type = type;
    }
    if (fromDate) { where += ' AND transaction_date >= :fromDate'; replacements.fromDate = fromDate; }
    if (toDate)   { where += ' AND transaction_date <= :toDate';   replacements.toDate   = toDate;   }

    const entries = await sequelize.query(`
      SELECT
        ledger_id,
        transaction_date,
        transaction_type,
        reference_number,
        debit_amount,
        credit_amount,
        balance,
        payment_method,
        product_id,
        product_quantity,
        description,
        performed_by,
        created_at
      FROM customer_ledger
      WHERE ${where}
      ORDER BY created_at DESC
    `, { replacements, type: sequelize.QueryTypes.SELECT });

    res.json({
      success: true,
      data: entries.map(e => ({
        // camelCase (used by customerService.js)
        id:              e.ledger_id,
        transactionDate: e.transaction_date,
        paymentDate:     e.transaction_date,
        transactionType: e.transaction_type,
        referenceNumber: e.reference_number,
        debitAmount:     Number(e.debit_amount  || 0),
        creditAmount:    Number(e.credit_amount || 0),
        amount:          Number(e.credit_amount || 0),
        balance:         Number(e.balance       || 0),
        paymentMethod:   e.payment_method || 'cash',
        paymentStatus:   e.transaction_type === 'payment' ? 'paid' : 'pending',
        productId:       e.product_id       || null,
        productQuantity: e.product_quantity || null,
        description:     e.description,
        notes:           e.description,
        performedBy:     e.performed_by,
        createdAt:       e.created_at,
        // snake_case (used by Customers.jsx direct api.get call)
        ledger_id:         e.ledger_id,
        transaction_date:  e.transaction_date,
        transaction_type:  e.transaction_type,
        reference_number:  e.reference_number,
        debit_amount:      Number(e.debit_amount  || 0),
        credit_amount:     Number(e.credit_amount || 0),
        payment_method:    e.payment_method || 'cash',
        performed_by:      e.performed_by,
        created_at:        e.created_at,
      }))
    });
  } catch (error) {
    console.error('Get customer ledger error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ledger' });
  }
};

// ─────────────────────────────────────────────
// MARK PAYMENT RECEIVED  (COD — cash collected on delivery)
// Also handles REFUND when transactionType = 'refund'
// ─────────────────────────────────────────────
exports.markPaymentReceived = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query('SELECT pg_advisory_xact_lock(44201,17001)', {transaction});
    const { customerId } = req.params;
    const { amount, invoiceId, invoiceNumber, notes, paymentMethod, referenceNumber, transactionType } = req.body;

    const isRefund = transactionType === 'refund';
    const rawAmount = Number(amount);

    // For regular payment: amount must be positive
    // For refund: we accept negative (frontend sends negative) or positive with transactionType='refund'
    if (!Number.isFinite(rawAmount) || rawAmount === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Valid payment amount is required' });
    }

    // Normalise: always work with positive absolute value, direction determined by isRefund
    const absAmount = Math.abs(rawAmount);

    const account = await CustomerAccount.findOne({
      where: { customer_id: customerId, status: 1 }, transaction, lock:transaction.LOCK.UPDATE
    });
    if (!account) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Customer account not found' });
    }

    // For payment:  customer pays US → balance DECREASES (they owe us less)
    // For refund:   WE pay customer → balance moves TOWARD ZERO from either direction
    let newBalance;
    if (isRefund) {
      const currentBal = Number(account.current_balance);
      if (currentBal < 0) {
        // We owe them — paying them back: balance goes up towards 0
        newBalance = currentBal + absAmount;
      } else if (currentBal > 0) {
        // They overpaid or return reduces what they owe — reduce balance
        newBalance = currentBal - absAmount;
      } else {
        // Balance already 0 — nothing to refund
        newBalance = 0;
      }
    } else {
      // Regular payment from customer
      newBalance = Number(account.current_balance) - absAmount;
    }

    // Update account
    account.current_balance = newBalance;
    if (isRefund) {
      // Refund: we paid cash out to customer — reduce total_credit (reversing their overpayment)
      // total_debit stays the same (invoice return already reduced it)
      account.total_credit = Math.max(Number(account.total_credit) - absAmount, 0);
    } else {
      // Payment received: increase total_credit
      account.total_credit = Number(account.total_credit) + absAmount;
    }
    account.updated_at = new Date();
    await account.save({ transaction });

    // Ledger entry
    const txType    = isRefund ? 'refund' : 'payment';
    const refType   = isRefund ? 'REFUND' : 'PAYMENT';
    const refNumber = referenceNumber || invoiceNumber || `${isRefund ? 'REF' : 'PAY'}-${Date.now()}`;

    await CustomerLedger.create({
      customer_id:      customerId,
      account_id:       account.account_id,
      transaction_date: new Date(),
      transaction_type: txType,
      reference_type:   refType,
      reference_id:     invoiceId   || null,
      reference_number: refNumber,
      debit_amount:     isRefund ? absAmount : 0,   // refund = we paid out (debit our records)
      credit_amount:    isRefund ? 0 : absAmount,   // payment = we received (credit our records)
      balance:          newBalance,
      payment_method:   paymentMethod || 'cash',
      description:      notes || (isRefund ? `Refund paid to customer - ${refNumber}` : `Cash received for ${refNumber}`),
      performed_by:     req.user?.email || 'pharmacist',
      product_id:       null,
      product_quantity: null,
      created_at: new Date(),
      updated_at: new Date(),
      status: 1
    }, { transaction });

    // Update invoice payment status if invoiceId provided (only for regular payments)
    if (!isRefund) {
      if (invoiceId) {
        // Specific invoice payment
        const inv = await sequelize.query(
          `SELECT invoice_id, total_amount, paid_amount FROM invoice WHERE invoice_id = :invoiceId`,
          { replacements: { invoiceId }, type: sequelize.QueryTypes.SELECT, transaction }
        );
        if (inv.length > 0) {
          const totalPaid = Number(inv[0].paid_amount || 0) + absAmount;
          const isPaid    = totalPaid >= Number(inv[0].total_amount);
          await sequelize.query(
            `UPDATE invoice SET paid_amount = :totalPaid, due_amount = total_amount - :totalPaid,
             payment_status = :status, updated_at = NOW() WHERE invoice_id = :invoiceId`,
            {
              replacements: { totalPaid, status: isPaid ? 'paid' : 'unpaid', invoiceId },
              type: sequelize.QueryTypes.UPDATE, transaction
            }
          );
        }
      } else {
        // General payment — apply to oldest unpaid delivered orders (FIFO)
        const unpaidOrders = await sequelize.query(
          `SELECT invoice_id, total_amount, paid_amount, due_amount
           FROM invoice
           WHERE customer_id = :cid AND status = 1
             AND delivery_status = 'delivered' AND payment_status = 'unpaid'
           ORDER BY created_at ASC`,
          { replacements: { cid: customerId }, type: sequelize.QueryTypes.SELECT, transaction }
        );
        let remaining = absAmount;
        for (const ord of unpaidOrders) {
          if (remaining <= 0) break;
          const apply    = Math.min(remaining, Number(ord.due_amount || ord.total_amount));
          const newPaid  = Number(ord.paid_amount || 0) + apply;
          const isPaid   = newPaid >= Number(ord.total_amount);
          await sequelize.query(
            `UPDATE invoice SET paid_amount = :p, due_amount = total_amount - :p,
             payment_status = :s, updated_at = NOW() WHERE invoice_id = :id`,
            { replacements: { p: newPaid, s: isPaid ? 'paid' : 'unpaid', id: ord.invoice_id },
              type: sequelize.QueryTypes.UPDATE, transaction }
          );
          remaining -= apply;
        }
      }
    }

    // When refund is recorded, update any pending invoice_return for this customer → 'refunded'
    if (isRefund) {
      await sequelize.query(
        `UPDATE invoice_return
         SET refund_status = 'refunded', updated_at = NOW()
         WHERE linked_invoice_id IN (
           SELECT invoice_id FROM invoice
           WHERE customer_id = :cid AND status = 1
         )
         AND (:invoiceId IS NULL OR linked_invoice_id = :invoiceId)
         AND refund_status = 'pending'
         AND status = 1`,
        { replacements: { cid: customerId,invoiceId:invoiceId || null }, type: sequelize.QueryTypes.UPDATE, transaction }
      );
    }

    await transaction.commit();

    res.json({
      success: true,
      message: isRefund ? 'Refund recorded successfully' : 'Payment received and recorded',
      data: {
        customerId,
        [isRefund ? 'refundAmount' : 'amountReceived']: absAmount,
        newOutstanding: newBalance < 0 ? 0 : newBalance,
        referenceNumber: refNumber,
        transactionType: txType
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Mark payment received error:', error);
    res.status(500).json({ success: false, message: 'Failed to record payment' });
  }
};

// ─────────────────────────────────────────────
// DEACTIVATE CUSTOMER
// ─────────────────────────────────────────────
exports.deactivateCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const customer = await Customer.findByPk(customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    customer.is_active  = false;
    customer.updated_at = new Date();
    await customer.save();

    const account = await CustomerAccount.findOne({ where: { customer_id: customerId, status: 1 } });
    if (account) { account.account_status = 'closed'; account.updated_at = new Date(); await account.save(); }

    res.json({ success: true, message: 'Customer deactivated successfully' });
  } catch (error) {
    console.error('Deactivate customer error:', error);
    res.status(500).json({ success: false, message: 'Failed to deactivate customer' });
  }
};

module.exports = exports;
