const Supplier = require('../models/Supplier');

// Get all suppliers
exports.getAllSuppliers = async (req, res) => {
  try {
    const suppliers = await Supplier.findAll({
      order: [['created_at', 'DESC']]
    });

    // Transform to match frontend format
    const formattedSuppliers = suppliers.map(supplier => ({
      id: `sup-${supplier.supplier_id}`,
      name: supplier.supplier_name,
      city: supplier.supplier_city || '',
      contact: supplier.supplier_contact || '',
      status: supplier.status === 1 ? 'active' : 'disabled',
      createdAt: supplier.created_at,
      updatedAt: supplier.updated_at
    }));

    res.json(formattedSuppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ message: 'Error fetching suppliers', error: error.message });
  }
};

// Create new supplier
exports.createSupplier = async (req, res) => {
  try {
    const { name, city, contact, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    // ✅ Check if supplier already exists
    const existing = await Supplier.findOne({
      where: { supplier_name: name.trim() }
    });

    if (existing) {
      return res.status(400).json({ message: 'Supplier with this name already exists' });
    }

    const supplier = await Supplier.create({
      supplier_name: name.trim(),
      supplier_city: city?.trim() || null,
      supplier_contact: contact?.trim() || null,
      status: status === 'disabled' ? 0 : 1
    });

    const formattedSupplier = {
      id: `sup-${supplier.supplier_id}`,
      name: supplier.supplier_name,
      city: supplier.supplier_city || '',
      contact: supplier.supplier_contact || '',
      status: supplier.status === 1 ? 'active' : 'disabled',
      createdAt: supplier.created_at,
      updatedAt: supplier.updated_at
    };

    res.status(201).json(formattedSupplier);
  } catch (error) {
    // ✅ Handle unique constraint violation
    if (error.name === 'SequelizeUniqueConstraintError' || 
        error.parent?.code === '23505' ||
        error.message?.includes('unique constraint')) {
      return res.status(400).json({ 
        message: 'Supplier with this name already exists' 
      });
    }
    
    console.error('Error creating supplier:', error);
    res.status(500).json({ message: 'Error creating supplier', error: error.message });
  }
};

// Update supplier
exports.updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, city, contact, status } = req.body;

    const supplierId = id.replace('sup-', '');
    const supplier = await Supplier.findByPk(supplierId);
    
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    // ✅ Check if name is being changed and if it already exists
    if (name && name.trim() !== supplier.supplier_name) {
      const existing = await Supplier.findOne({
        where: { supplier_name: name.trim() }
      });

      if (existing) {
        return res.status(400).json({ message: 'Supplier with this name already exists' });
      }
    }

    await supplier.update({
      supplier_name: name ? name.trim() : supplier.supplier_name,
      supplier_city: city !== undefined ? (city?.trim() || null) : supplier.supplier_city,
      supplier_contact: contact !== undefined ? (contact?.trim() || null) : supplier.supplier_contact,
      status: status === 'active' ? 1 : status === 'disabled' ? 0 : supplier.status,
      updated_at: new Date()
    });

    const formattedSupplier = {
      id: `sup-${supplier.supplier_id}`,
      name: supplier.supplier_name,
      city: supplier.supplier_city || '',
      contact: supplier.supplier_contact || '',
      status: supplier.status === 1 ? 'active' : 'disabled',
      createdAt: supplier.created_at,
      updatedAt: supplier.updated_at
    };

    res.json({ success: true, data: formattedSupplier });
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json({ message: 'Error updating supplier', error: error.message });
  }
};

// Delete supplier
exports.deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const supplierId = id.replace('sup-', '');

    const supplier = await Supplier.findByPk(supplierId);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    await supplier.destroy();
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ message: 'Error deleting supplier', error: error.message });
  }
};

// Toggle supplier status
exports.toggleSupplierStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const supplierId = id.replace('sup-', '');

    const supplier = await Supplier.findByPk(supplierId);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    await supplier.update({
      status: supplier.status === 1 ? 0 : 1,
      updated_at: new Date()
    });

    const formattedSupplier = {
      id: `sup-${supplier.supplier_id}`,
      name: supplier.supplier_name,
      city: supplier.supplier_city || '',
      contact: supplier.supplier_contact || '',
      status: supplier.status === 1 ? 'active' : 'disabled',
      createdAt: supplier.created_at,
      updatedAt: supplier.updated_at
    };

    res.json(formattedSupplier);
  } catch (error) {
    console.error('Error toggling supplier status:', error);
    res.status(500).json({ message: 'Error toggling supplier status', error: error.message });
  }
};

// Get single supplier by ID
exports.getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;
    const supplierId = id.replace('sup-', '');
    const supplier = await Supplier.findByPk(supplierId);

    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }

    res.json({
      success: true,
      data: {
        id: `sup-${supplier.supplier_id}`,
        supplier_id: supplier.supplier_id,
        name: supplier.supplier_name,
        city: supplier.supplier_city || '',
        contact: supplier.supplier_contact || '',
        status: supplier.status === 1 ? 'active' : 'disabled',
        createdAt: supplier.created_at,
        updatedAt: supplier.updated_at
      }
    });
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({ success: false, message: 'Error fetching supplier', error: error.message });
  }
};

// ─────────────────────────────────────────────
// SUPPLIER ACCOUNTS
// ─────────────────────────────────────────────
const { sequelize } = require('../config/database');

// Get all suppliers with account summary
exports.listSuppliersWithAccounts = async (req, res) => {
  try {
    const suppliers = await sequelize.query(`
      SELECT
        s.supplier_id,
        s.supplier_name,
        s.supplier_city,
        s.supplier_contact,
        s.status,
        COALESCE(sa.supplier_account_id, 0)  AS account_id,
        COALESCE(sa.current_balance,  0)     AS current_balance,
        COALESCE(sa.total_debit,      0)     AS total_debit,
        COALESCE(sa.total_credit,     0)     AS total_credit,
        COALESCE(sa.opening_balance,  0)     AS opening_balance,
        COALESCE(sa.total_return,     0)     AS total_return,
        COALESCE(sa.account_status, 'active') AS account_status,
        sa.notes,
        -- Cash actually received back from supplier (refund ledger entries)
        COALESCE(refund_stats.refund_received, 0) AS refund_received,
        -- Stock stats
        COALESCE(stock_stats.total_stocks,  0) AS total_stocks,
        COALESCE(stock_stats.total_value,   0) AS total_value,
        COALESCE(stock_stats.last_stock_date, NULL) AS last_stock_date
      FROM supplier_info s
      LEFT JOIN supplier_accounts sa
        ON s.supplier_id = sa.supplier_id AND sa.status = 1
      LEFT JOIN (
        SELECT
          supplier_id,
          COUNT(*)        AS total_stocks,
          SUM(total_amount) AS total_value,
          MAX(created_at)   AS last_stock_date
        FROM stock
        WHERE status = 1
        GROUP BY supplier_id
      ) stock_stats ON s.supplier_id = stock_stats.supplier_id
      LEFT JOIN (
        SELECT
          supplier_id,
          COALESCE(SUM(debit_amount), 0) AS refund_received
        FROM supplier_ledger
        WHERE transaction_type = 'refund'
        GROUP BY supplier_id
      ) refund_stats ON s.supplier_id = refund_stats.supplier_id
      WHERE s.status = 1
      ORDER BY s.supplier_name ASC
    `, { type: sequelize.QueryTypes.SELECT });

    const totalPayable  = suppliers.reduce((s, x) => s + Number(x.current_balance || 0), 0);
    const totalPayments = suppliers.reduce((s, x) => s + Number(x.total_credit   || 0), 0);

    res.json({
      success: true,
      data: {
        suppliers: suppliers.map(s => ({
          id:             s.supplier_id,
          supplierId:     s.supplier_id,
          name:           s.supplier_name,
          city:           s.supplier_city || '',
          contact:        s.supplier_contact || '',
          status:         s.status === 1 ? 'active' : 'inactive',
          accountId:      s.account_id,
          currentBalance: Number(s.current_balance),   // how much we owe
          totalDebit:     Number(s.total_debit),        // total stock received
          totalCredit:    Number(s.total_credit),       // total paid to them
          totalReturn:    Number(s.total_return   || 0),// total returned goods value
          refundReceived: Number(s.refund_received || 0),// cash received back from supplier
          refundPending:  Math.max(Number(s.total_return||0) - Number(s.refund_received||0), 0), // still owed
          openingBalance: Number(s.opening_balance),
          accountStatus:  s.account_status,
          notes:          s.notes,
          totalStocks:    Number(s.total_stocks),
          totalValue:     Number(s.total_value),
          lastStockDate:  s.last_stock_date
        })),
        stats: {
          totalSuppliers: suppliers.length,
          totalPayable,
          totalPayments
        }
      }
    });
  } catch (error) {
    console.error('List suppliers with accounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch supplier accounts', error: error.message });
  }
};

// Get single supplier detail with ledger
exports.getSupplierDetail = async (req, res) => {
  try {
    const { supplierId } = req.params;

    const [supplier] = await sequelize.query(
      `SELECT * FROM supplier_info WHERE supplier_id = :sid AND status = 1`,
      { replacements: { sid: supplierId }, type: sequelize.QueryTypes.SELECT }
    );
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });

    const [account] = await sequelize.query(
      `SELECT * FROM supplier_accounts WHERE supplier_id = :sid AND status = 1 LIMIT 1`,
      { replacements: { sid: supplierId }, type: sequelize.QueryTypes.SELECT }
    );

    const ledger = await sequelize.query(`
      SELECT
        ledger_number, transaction_type, creation_day,
        stock_id, product_id, product_title,
        product_quantity, product_price, total_price,
        amount_paid, description,
        account_type, payment_type,
        debit_amount, credit_amount, balance,
        reference_type, reference_number, performed_by,
        time_created
      FROM supplier_ledger
      WHERE supplier_id = :sid AND status = 1
      ORDER BY time_created DESC
      LIMIT 100
    `, { replacements: { sid: supplierId }, type: sequelize.QueryTypes.SELECT });

    res.json({
      success: true,
      data: {
        supplier: {
          id:      supplier.supplier_id,
          name:    supplier.supplier_name,
          city:    supplier.supplier_city,
          contact: supplier.supplier_contact,
          status:  supplier.status
        },
        account: account ? {
          accountId:      account.supplier_account_id,
          currentBalance: Number(account.current_balance || 0),
          totalDebit:     Number(account.total_debit     || 0),
          totalCredit:    Number(account.total_credit    || 0),
          totalReturn:    Number(account.total_return    || 0),
          openingBalance: Number(account.opening_balance || 0),
          accountStatus:  account.account_status
        } : null,
        ledgerEntries: ledger.map(e => ({
          id:              e.ledger_number,
          transactionType: e.transaction_type,
          transactionDate: e.time_created,
          creationDay:     e.creation_day,
          stockId:         e.stock_id,
          productId:       e.product_id,
          productTitle:    e.product_title,
          productQuantity: e.product_quantity,
          productPrice:    Number(e.product_price   || 0),
          totalPrice:      Number(e.total_price     || 0),
          amountPaid:      Number(e.amount_paid     || 0),
          description:     e.description,
          accountType:     e.account_type,
          paymentType:     e.payment_type,
          debitAmount:     Number(e.debit_amount  || 0),
          creditAmount:    Number(e.credit_amount || 0),
          balance:         Number(e.balance       || 0),
          referenceType:   e.reference_type,
          referenceNumber: e.reference_number,
          performedBy:     e.performed_by
        }))
      }
    });
  } catch (error) {
    console.error('Get supplier detail error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch supplier detail', error: error.message });
  }
};

// Get supplier ledger only
exports.getSupplierLedger = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { type, fromDate, toDate } = req.query;

    let where = 'supplier_id = :sid AND status = 1';
    const replacements = { sid: supplierId };

    if (type && type !== 'all') { where += ' AND transaction_type = :type'; replacements.type = type; }
    if (fromDate) { where += ' AND creation_day >= :fromDate'; replacements.fromDate = fromDate; }
    if (toDate)   { where += ' AND creation_day <= :toDate';   replacements.toDate   = toDate;   }

    const entries = await sequelize.query(`
      SELECT
        ledger_number, transaction_type, creation_day,
        stock_id, product_id, product_title,
        product_quantity, product_price, total_price,
        amount_paid, description,
        debit_amount, credit_amount, balance,
        reference_number, performed_by, time_created
      FROM supplier_ledger
      WHERE ${where}
      ORDER BY time_created DESC
    `, { replacements, type: sequelize.QueryTypes.SELECT });

    res.json({
      success: true,
      data: entries.map(e => ({
        id:              e.ledger_number,
        transactionType: e.transaction_type,
        transactionDate: e.time_created,
        creationDay:     e.creation_day,
        stockId:         e.stock_id,
        productId:       e.product_id,
        productTitle:    e.product_title,
        productQuantity: Number(e.product_quantity || 0),
        productPrice:    Number(e.product_price    || 0),
        totalPrice:      Number(e.total_price      || 0),
        amountPaid:      Number(e.amount_paid      || 0),
        description:     e.description,
        debitAmount:     Number(e.debit_amount  || 0),
        creditAmount:    Number(e.credit_amount || 0),
        balance:         Number(e.balance       || 0),
        referenceNumber: e.reference_number,
        performedBy:     e.performed_by
      }))
    });
  } catch (error) {
    console.error('Get supplier ledger error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch supplier ledger', error: error.message });
  }
};

// Record payment to supplier (CREDIT entry)
exports.recordSupplierPayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { supplierId } = req.params;
    const { amount, description, referenceNumber, stockId } = req.body;

    if (!amount || Number(amount) <= 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Valid payment amount is required' });
    }

    // Get or create supplier account
    let [account] = await sequelize.query(
      `SELECT * FROM supplier_accounts WHERE supplier_id = :sid AND status = 1 LIMIT 1`,
      { replacements: { sid: supplierId }, type: sequelize.QueryTypes.SELECT, transaction }
    );

    if (!account) {
      const [newAcc] = await sequelize.query(
        `INSERT INTO supplier_accounts (supplier_id, current_balance, total_debit, total_credit, opening_balance, account_status, status, creation_day, created_at, updated_at)
         VALUES (:sid, 0, 0, 0, 0, 'active', 1, CURRENT_DATE, NOW(), NOW()) RETURNING *`,
        { replacements: { sid: supplierId }, type: sequelize.QueryTypes.INSERT, transaction }
      );
      account = newAcc[0];
    }

    const paidAmount   = Number(amount);
    const newCredit    = Number(account.total_credit) + paidAmount;
    const newBalance   = Number(account.total_debit  || 0)
                       - newCredit
                       - Number(account.total_return || 0); // correct formula

    // Update account
    await sequelize.query(
      `UPDATE supplier_accounts
       SET current_balance = :bal, total_credit = :credit, updated_at = NOW()
       WHERE supplier_id = :sid AND status = 1`,
      { replacements: { bal: newBalance, credit: newCredit, sid: supplierId }, type: sequelize.QueryTypes.UPDATE, transaction }
    );

    // Credit ledger entry
    await sequelize.query(
      `INSERT INTO supplier_ledger
        (supplier_id, supplier_account_id, transaction_type, account_type, payment_type,
         amount_paid, credit_amount, debit_amount, balance,
         description, reference_number, reference_type,
         performed_by, stock_id, status, time_created, creation_day, updated_at)
       VALUES
        (:sid, :accId, 'payment', 0, 0,
         :amount, :amount, 0, :balance,
         :desc, :ref, 'PAYMENT',
         :by, :stockId, 1, NOW(), CURRENT_DATE, NOW())`,
      {
        replacements: {
          sid:     supplierId,
          accId:   account.supplier_account_id,
          amount:  paidAmount,
          balance: newBalance,
          desc:    description || `Payment to supplier`,
          ref:     referenceNumber || `PAY-${Date.now()}`,
          by:      req.user?.email || 'pharmacist',
          stockId: stockId || null
        },
        type: sequelize.QueryTypes.INSERT,
        transaction
      }
    );

    // ── Update stock table paid_amount / due_amount ──────────────────
    // Strategy:
    // 1. If stockId provided → update that specific stock bill
    // 2. Otherwise → distribute payment across unpaid bills (oldest first)
    let remainingPayment = paidAmount;

    if (stockId) {
      // Specific bill payment
      const [bill] = await sequelize.query(
        `SELECT stock_id, total_amount, paid_amount, due_amount FROM stock WHERE stock_id = :sid AND supplier_id = :suppId AND status = 1`,
        { replacements: { sid: stockId, suppId: supplierId }, type: sequelize.QueryTypes.SELECT, transaction }
      );
      if (bill) {
        const newPaid = Math.min(Number(bill.paid_amount) + remainingPayment, Number(bill.total_amount));
        const newDue  = Math.max(Number(bill.total_amount) - newPaid, 0);
        await sequelize.query(
          `UPDATE stock SET paid_amount = :paid, due_amount = :due, updated_at = NOW() WHERE stock_id = :sid`,
          { replacements: { paid: newPaid, due: newDue, sid: stockId }, type: sequelize.QueryTypes.UPDATE, transaction }
        );
      }
    } else {
      // Distribute across unpaid bills oldest first
      const unpaidBills = await sequelize.query(
        `SELECT stock_id, total_amount, paid_amount, due_amount FROM stock
         WHERE supplier_id = :suppId AND due_amount > 0 AND status = 1
         ORDER BY created_at ASC`,
        { replacements: { suppId: supplierId }, type: sequelize.QueryTypes.SELECT, transaction }
      );
      for (const bill of unpaidBills) {
        if (remainingPayment <= 0) break;
        const applyAmount = Math.min(remainingPayment, Number(bill.due_amount));
        const newPaid = Number(bill.paid_amount) + applyAmount;
        const newDue  = Math.max(Number(bill.total_amount) - newPaid, 0);
        await sequelize.query(
          `UPDATE stock SET paid_amount = :paid, due_amount = :due, updated_at = NOW() WHERE stock_id = :sid`,
          { replacements: { paid: newPaid, due: newDue, sid: bill.stock_id }, type: sequelize.QueryTypes.UPDATE, transaction }
        );
        remainingPayment -= applyAmount;
      }
    }
    // ─────────────────────────────────────────────────────────────────

    await transaction.commit();

    res.json({
      success: true,
      message: 'Payment recorded successfully',
      data: { supplierId, amountPaid: paidAmount, newBalance }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Record supplier payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to record payment', error: error.message });
  }
};

// Record refund from supplier (supplier pays us back after stock return)
exports.recordSupplierRefund = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { supplierId } = req.params;
    const { amount, description, referenceNumber, returnId } = req.body;

    if (!amount || Number(amount) <= 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Valid refund amount is required' });
    }

    // Get supplier account
    const [account] = await sequelize.query(
      `SELECT * FROM supplier_accounts WHERE supplier_id = :sid AND status = 1 LIMIT 1`,
      { replacements: { sid: supplierId }, type: sequelize.QueryTypes.SELECT, transaction }
    );
    if (!account) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Supplier account not found' });
    }

    const refundAmount = Number(amount);

    // ── CORRECT LOGIC ────────────────────────────────────────────────────────
    // Supplier refund = supplier is PAYING US cash (for the goods we returned).
    // This is equivalent to a payment RECEIVED FROM supplier, so it increases
    // total_credit (reducing what we owe them) just like a regular payment would.
    //
    // Formula:
    //   current_balance = total_debit - total_credit - total_return
    //
    // On refund:  total_credit += refundAmount  →  balance DECREASES  ✅
    // (total_return stays the same — it records the value of goods returned,
    //  not the cash settlement. The cash settlement goes into total_credit.)
    // ─────────────────────────────────────────────────────────────────────────
    const newTotalCredit = Number(account.total_credit || 0) + refundAmount;
    const newBalance     = Number(account.total_debit  || 0)
                         - newTotalCredit
                         - Number(account.total_return || 0);

    // Update supplier_accounts
    await sequelize.query(
      `UPDATE supplier_accounts
       SET total_credit = :credit, current_balance = :bal, updated_at = NOW()
       WHERE supplier_id = :sid AND status = 1`,
      { replacements: { credit: newTotalCredit, bal: newBalance, sid: supplierId },
        type: sequelize.QueryTypes.UPDATE, transaction }
    );

    // ── Fetch product details from linked stock_return ────────────
    // If returnId provided use it, else get the most recent returns for this supplier
    // that haven't been refunded yet (ordered oldest first)
    let returnItems = [];
    if (returnId) {
      returnItems = await sequelize.query(
        `SELECT rr.product_id, rr.product_title, rr.product_quantity,
                rr.product_price, rr.total_price, r.stock_id
         FROM stock_return_report rr
         JOIN stock_return r ON rr.return_id = r.return_id
         WHERE rr.return_id = :rid`,
        { replacements: { rid: returnId }, type: sequelize.QueryTypes.SELECT, transaction }
      );
    } else {
      // Get all pending (not yet refunded) return items for this supplier
      const refundedReturnIds = await sequelize.query(
        `SELECT DISTINCT CAST(reference_number AS TEXT) as ref
         FROM supplier_ledger
         WHERE supplier_id = :sid AND transaction_type = 'refund' AND reference_number LIKE 'SRET-%'`,
        { replacements: { sid: supplierId }, type: sequelize.QueryTypes.SELECT, transaction }
      );
      const refundedIds = refundedReturnIds.map(r => r.ref?.replace('SRET-', '')).filter(Boolean);

      returnItems = await sequelize.query(
        `SELECT rr.product_id, rr.product_title, rr.product_quantity,
                rr.product_price, rr.total_price, r.stock_id, r.return_id
         FROM stock_return_report rr
         JOIN stock_return r ON rr.return_id = r.return_id
         WHERE r.supplier_id = :sid
           ${refundedIds.length > 0 ? `AND r.return_id NOT IN (${refundedIds.join(',')})` : ''}
         ORDER BY r.created_at ASC`,
        { replacements: { sid: supplierId }, type: sequelize.QueryTypes.SELECT, transaction }
      );
    }

    // ── Single ledger entry for the actual cash amount refunded ──
    // Always insert one entry = exact amount user entered (not per-item)
    const refRef = referenceNumber || `REF-${Date.now()}`;

    await sequelize.query(
      `INSERT INTO supplier_ledger
        (supplier_id, supplier_account_id, transaction_type, account_type, payment_type,
         amount_paid, debit_amount, credit_amount, balance,
         description, reference_number, reference_type,
         performed_by, stock_id, status, time_created, creation_day, updated_at)
       VALUES
        (:sid, :accId, 'refund', 3, 0,
         :amount, :amount, 0, :balance,
         :desc, :ref, 'REFUND',
         :by, NULL, 1, NOW(), CURRENT_DATE, NOW())`,
      {
        replacements: {
          sid:     supplierId,
          accId:   account.supplier_account_id,
          amount:  refundAmount,
          balance: newBalance,
          desc:    description || `Refund received from supplier`,
          ref:     refRef,
          by:      req.user?.email || 'pharmacist'
        },
        type: sequelize.QueryTypes.INSERT,
        transaction
      }
    );

    await transaction.commit();

    res.json({
      success: true,
      message: 'Refund recorded successfully',
      data: {
        supplierId,
        refundAmount,
        newBalance,
        newTotalCredit,
        productsRefunded: returnItems.length
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Record supplier refund error:', error);
    res.status(500).json({ success: false, message: 'Failed to record refund', error: error.message });
  }
};
