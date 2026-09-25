const Invoice = require('../models/Invoice');
const InvoiceReport = require('../models/InvoiceReport');
const Product = require('../models/Product');
const CustomerAccount = require('../models/CustomerAccount');
const CustomerLedger = require('../models/CustomerLedger');
const BatchAllocationService = require('../services/batchAllocationService');
const { sequelize } = require('../config/database');
const invoiceNumberService =
  require('../services/invoiceNumberService');

// Generate sequential invoice number: INV-000001, INV-000002...
async function generateInvoiceNumber(
  transaction
) {
  return invoiceNumberService
    .generateNextInvoiceNumber(
      transaction
    );
}

// Create new invoice
exports.createInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const {
      customerName,
      customerPhone,
      customerEmail,
      customerId,
      branchName,
      discount,
      deliveryFee,
      paidAmount,
      paymentMethod,
      deliveryStatus,
      deliveryAddress,
      builtyNo,
      notes,
      createdBy,
      items = []
    } = req.body;

    // Validate required fields
    if (!customerName || !items || items.length === 0) {
      await transaction.rollback();

      return res.status(400).json({ 
        success: false, 
        message: 'Customer name and at least one item are required' 
      });
    }

    // Keep cross-flow lock ordering consistent:
    // invoice-number advisory lock first, stock row locks second.
    const invoiceNumber =
      await generateInvoiceNumber(
        transaction
      );

    // Calculate totals and allocate stock_history using FIFO
    let subtotal = 0;
    const processedItems = [];
    const batchAllocations = []; // Track allocations for ledger entries

    for (const item of items) {
      const qty = Number(item.quantity || item.qty || 1);
      const unitPrice = Number(item.unitPrice || item.unit_price || item.price || 0);
      const itemDiscount = Number(item.discount || 0);
      const tax = Number(item.tax || 0);
      const totalPrice = (qty * unitPrice) - itemDiscount + tax;

      subtotal += totalPrice;

      const productId = item.productId || item.product_id;
      
      if (!productId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Product ID is required for item: ${item.name || 'Unknown'}`
        });
      }

      // Allocate stock_history using FIFO/FEFO
      try {
        const allocations =
          await BatchAllocationService
            .allocateBatchesForSale(
              productId,
              qty,
              transaction
            );
        
        // Store allocations for ledger entry
        batchAllocations.push({
          productId,
          allocations
        });

        // Create invoice item for each batch allocation
        for (const alloc of allocations) {
          processedItems.push({
            product_id: productId,
            product_title: item.name || item.productTitle || item.product_title || 'Unknown Item',
            batch_number: alloc.batch_number,
            expiry_date: alloc.expiry_date,
            quantity: alloc.quantity,
            unit_price: unitPrice,
            purchase_price: Number(alloc.purchase_cost || 0), // ← store at invoice time
            discount: itemDiscount / allocations.length, // Distribute discount proportionally
            tax: tax / allocations.length, // Distribute tax proportionally
            total_price: (alloc.quantity * unitPrice) - (itemDiscount / allocations.length) + (tax / allocations.length)
          });
        }
      } catch (error) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Failed to allocate stock for ${item.name || 'Unknown'}: ${error.message}`
        });
      }
    }

    const invoiceDiscount = Number(discount || 0);
    const invoiceDeliveryFee = Number(deliveryFee || 0);
    const totalAmount = subtotal - invoiceDiscount + invoiceDeliveryFee;
    const paid = Number(paidAmount || 0);
    const due = totalAmount - paid;

    // Determine payment status - only paid or unpaid
    let paymentStatus = 'unpaid';
    if (paid >= totalAmount) {
      paymentStatus = 'paid';
    }

    // Create invoice
    const invoice = await Invoice.create({
      invoice_number: invoiceNumber,
      customer_id: customerId || null,
      customer_name: customerName,
      customer_phone: customerPhone || '',
      customer_email: customerEmail || '',
      branch_name: branchName || 'Main Branch',
      total_amount: totalAmount,
      discount: invoiceDiscount,
      delivery_fee: invoiceDeliveryFee,
      paid_amount: paid,
      due_amount: due,
      payment_status: paymentStatus,
      payment_method: paymentMethod || 'cash',
      delivery_status: deliveryStatus || 'pending',
      delivery_address: deliveryAddress || '',
      builty_no: builtyNo || '',
      notes: notes || '',
      created_by: createdBy || 'System',
      invoice_date: new Date(),
      status: 1
    }, { transaction });

    // Create invoice items
    const invoiceItems = [];
    for (const item of processedItems) {
      const invoiceItem = await InvoiceReport.create({
        invoice_id: invoice.invoice_id,
        ...item,
        status: 1
      }, { transaction });

      invoiceItems.push(invoiceItem);
    }

    // Deduct stock_history and create ledger entries
    for (const batchAlloc of batchAllocations) {
      await BatchAllocationService.deductBatches(
        batchAlloc.allocations,
        {
          type: 'INVOICE',
          id: invoice.invoice_id,
          number: invoice.invoice_number,
          performed_by: createdBy || 'System'
        },
        transaction
      );
    }

    // Update customer ledger if customer has an account
    if (customerId && due > 0) {
      const customerAccount = await CustomerAccount.findOne({
        where: { customer_id: customerId, status: 1 }
      });

      if (customerAccount) {
        // Update account balance
        const newBalance = Number(customerAccount.current_balance) + due;
        customerAccount.current_balance = newBalance;
        customerAccount.total_debit = Number(customerAccount.total_debit) + totalAmount;
        customerAccount.updated_at = new Date();
        await customerAccount.save({ transaction });

        // Create ledger entry for invoice
        await CustomerLedger.create({
          customer_id: customerId,
          account_id: customerAccount.account_id,
          transaction_date: new Date(),
          transaction_type: 'invoice',
          reference_type: 'INVOICE',
          reference_id: invoice.invoice_id,
          reference_number: invoice.invoice_number,
          debit_amount: totalAmount,
          credit_amount: 0,
          balance: newBalance,
          payment_method: null,
          description: `Invoice ${invoice.invoice_number} - ${customerName}`,
          performed_by: createdBy || 'System',
          created_at: new Date(),
          status: 1
        }, { transaction });

        // If payment made, record it
        if (paid > 0) {
          const balanceAfterPayment = newBalance - paid;
          customerAccount.current_balance = balanceAfterPayment;
          customerAccount.total_credit = Number(customerAccount.total_credit) + paid;
          await customerAccount.save({ transaction });

          await CustomerLedger.create({
            customer_id: customerId,
            account_id: customerAccount.account_id,
            transaction_date: new Date(),
            transaction_type: 'payment',
            reference_type: 'INVOICE_PAYMENT',
            reference_id: invoice.invoice_id,
            reference_number: invoice.invoice_number,
            debit_amount: 0,
            credit_amount: paid,
            balance: balanceAfterPayment,
            payment_method: paymentMethod || 'cash',
            description: `Payment for Invoice ${invoice.invoice_number}`,
            performed_by: createdBy || 'System',
            created_at: new Date(),
            status: 1
          }, { transaction });
        }
      }
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: {
        invoice_id: invoice.invoice_id,
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        total_amount: invoice.total_amount,
        payment_status: invoice.payment_status,
        delivery_status: invoice.delivery_status,
        created_at: invoice.created_at,
        items: invoiceItems.map(item => ({
          item_id: item.item_id,
          product_title: item.product_title,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price
        }))
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Create invoice error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create invoice',
      error: error.message 
    });
  }
};

// List all invoice — optimized single query with profit
exports.listInvoices = async (req, res) => {
  try {
    const { limit, sortBy, sortDir } = req.query;
    const lim = limit ? parseInt(limit) : 100;
    const order = (sortDir || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    // Whitelist allowed sort columns
    const validCols = ['created_at','invoice_date','invoice_id','total_amount','customer_name'];
    const sortCol   = validCols.includes(sortBy) ? sortBy : 'invoice_id';

    // Single query: invoice + items — purchase_price stored on invoice_report at creation time
    const rows = await sequelize.query(
      `SELECT
         i.invoice_id, i.invoice_number, i.customer_id, i.customer_name,
         i.customer_phone, i.customer_email, i.branch_name,
         i.total_amount, i.discount, i.delivery_fee,
         i.paid_amount, i.due_amount, i.payment_status, i.payment_method,
         i.delivery_status, i.delivery_address, i.builty_no,
         i.notes, i.created_by, i.invoice_date, i.created_at, i.updated_at,
         -- item fields
         ii.item_id, ii.product_id, ii.product_title, ii.quantity,
         ii.unit_price, ii.discount AS item_discount, ii.tax, ii.total_price,
         ii.batch_number, ii.expiry_date,
         -- purchase price stored at invoice creation time (no stock_history join needed)
         COALESCE(ii.purchase_price, 0) AS purchase_price,
         -- pack info from product table
         p.product_pack_size    AS pack_size,
         p.product_pack_description AS pack_description
       FROM invoice i
       LEFT JOIN invoice_report ii ON ii.invoice_id = i.invoice_id AND ii.status = 1
       LEFT JOIN product p ON p.product_id = ii.product_id
       WHERE i.status = 1
       ORDER BY i.${sortCol} ${order}
       LIMIT :lim`,
      { replacements: { lim }, type: sequelize.QueryTypes.SELECT }
    );

    // Group rows by invoice_id
    const invoiceMap = new Map();
    for (const row of rows) {
      if (!invoiceMap.has(row.invoice_id)) {
        invoiceMap.set(row.invoice_id, {
          id:              Number(row.invoice_id),
          mode:            'invoice',
          invoiceNumber:   row.invoice_number,
          orderNumber:     row.invoice_number,
          invoiceTotal:    Number(row.total_amount || 0),
          totalAmount:     Number(row.total_amount || 0),
          customerName:    row.customer_name,
          customerPhone:   row.customer_phone,
          customerContact: row.customer_phone,
          customerEmail:   row.customer_email,
          customerCity:    row.delivery_address,
          branchName:      row.branch_name,
          discount:        row.discount,
          deliveryFee:     row.delivery_fee,
          paidAmount:      row.paid_amount,
          dueAmount:       row.due_amount,
          paymentStatus:   row.payment_status,
          paymentMethod:   row.payment_method,
          deliveryStatus:  row.delivery_status,
          deliveryAddress: row.delivery_address,
          builtyNo:        row.builty_no,
          notes:           row.notes,
          createdBy:       row.created_by,
          invoiceDate:     row.invoice_date,
          createdAt:       row.created_at,
          updatedAt:       row.updated_at,
          totalProfit:     0,
          items:           []
        });
      }

      // Add item if present
      if (row.item_id) {
        const profit = (Number(row.unit_price) - Number(row.purchase_price)) * Number(row.quantity);
        const inv = invoiceMap.get(row.invoice_id);
        inv.totalProfit += profit;
        inv.items.push({
          id:            row.item_id,
          productId:     row.product_id,
          name:          row.product_title,
          batchNumber:   row.batch_number,
          expiryDate:    row.expiry_date,
          qty:           row.quantity,
          quantity:      row.quantity,
          unitPrice:     row.unit_price,
          purchasePrice: Number(row.purchase_price),
          packSize:      row.pack_size,
          packDescription: row.pack_description,
          discount:      row.item_discount,
          tax:           row.tax,
          totalPrice:    row.total_price,
          profit:        Number(profit.toFixed(2))
        });
      }
    }

    // Round totalProfit
    const result = Array.from(invoiceMap.values()).map(inv => ({
      ...inv,
      totalProfit: Number(inv.totalProfit.toFixed(2))
    }));

    res.json({ success: true, data: result });

  } catch (error) {
    console.error('List invoice error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch invoice', error: error.message });
  }
};

// Get single invoice
exports.getInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      where: { invoice_id: id, status: 1 }
    });

    if (!invoice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invoice not found' 
      });
    }

    const items = await InvoiceReport.findAll({
      where: { invoice_id: id, status: 1 }
    });

    // Calculate profit per item — purchase_price stored on invoice_report at creation time
    let totalProfit = 0;
    const itemsWithProfit = await Promise.all(items.map(async (item) => {
      const purchasePrice = Number(item.purchase_price || 0);
      const profit = (Number(item.unit_price) - purchasePrice) * Number(item.quantity);
      totalProfit += profit;

      // Get pack info from product
      const [prod] = await sequelize.query(
        `SELECT product_pack_size, product_pack_description FROM product WHERE product_id = :pid`,
        { replacements: { pid: item.product_id }, type: sequelize.QueryTypes.SELECT }
      );

      return {
        id:              item.item_id,
        productId:       item.product_id,
        name:            item.product_title,
        batchNumber:     item.batch_number,
        expiryDate:      item.expiry_date,
        qty:             item.quantity,
        quantity:        item.quantity,
        unitPrice:       item.unit_price,
        purchasePrice,
        packSize:        prod?.product_pack_size    || null,
        packDescription: prod?.product_pack_description || null,
        discount:        item.discount,
        tax:             item.tax,
        totalPrice:      item.total_price,
        profit:          Number(profit.toFixed(2))
      };
    }));

    const totalAmount = Number(invoice.total_amount || 0);

    res.json({
      success: true,
      data: {
        id:              invoice.invoice_id,
        mode:            'invoice',
        invoiceNumber:   invoice.invoice_number,
        invoiceTotal:    totalAmount,
        totalAmount,
        customerName:    invoice.customer_name,
        customerPhone:   invoice.customer_phone,
        customerContact: invoice.customer_phone,
        customerEmail:   invoice.customer_email,
        branchName:      invoice.branch_name,
        discount:        invoice.discount,
        deliveryFee:     invoice.delivery_fee,
        paidAmount:      invoice.paid_amount,
        dueAmount:       invoice.due_amount,
        paymentStatus:   invoice.payment_status,
        paymentMethod:   invoice.payment_method,
        deliveryStatus:  invoice.delivery_status,
        deliveryAddress: invoice.delivery_address,
        builtyNo:        invoice.builty_no,
        notes:           invoice.notes,
        createdBy:       invoice.created_by,
        invoiceDate:     invoice.invoice_date,
        createdAt:       invoice.created_at,
        totalProfit:     Number(totalProfit.toFixed(2)),
        items:           itemsWithProfit
      }
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch invoice',
      error: error.message 
    });
  }
};

// Update invoice status
exports.updateInvoiceStatus = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { deliveryStatus, paymentStatus, paidAmount } = req.body;

    const invoice = await Invoice.findOne({
      where: { invoice_id: id, status: 1 }
    });

    if (!invoice) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const updates = {};

    if (deliveryStatus) {
      updates.delivery_status = deliveryStatus;
    }

    let cashReceived = 0;

    if (paidAmount !== undefined) {
      const paid     = Number(paidAmount);
      const prevPaid = Number(invoice.paid_amount || 0);
      cashReceived   = paid - prevPaid;           // how much NEW cash came in this update

      updates.paid_amount    = paid;
      updates.due_amount     = Number(invoice.total_amount) - paid;
      updates.payment_status = paid >= Number(invoice.total_amount) ? 'paid' : 'unpaid';

    } else if (paymentStatus === 'paid') {
      // Caller just sent paymentStatus:'paid' without an amount → treat full amount as received
      const prevPaid = Number(invoice.paid_amount || 0);
      cashReceived   = Number(invoice.total_amount) - prevPaid;

      updates.paid_amount    = Number(invoice.total_amount);
      updates.due_amount     = 0;
      updates.payment_status = 'paid';

    } else if (paymentStatus) {
      updates.payment_status = paymentStatus;
    }

    updates.updated_at = new Date();
    await invoice.update(updates, { transaction });

    // ── LEDGER CREDIT ENTRY (only when actual cash received) ──
    if (cashReceived > 0 && invoice.customer_id) {
      const account = await CustomerAccount.findOne({
        where: { customer_id: invoice.customer_id, status: 1 },
        transaction
      });

      if (account) {
        const newBalance = Number(account.current_balance) - cashReceived;

        // Update account totals
        await account.update({
          current_balance: newBalance,
          total_credit:    Number(account.total_credit) + cashReceived,
          updated_at:      new Date()
        }, { transaction });

        // Credit entry in customer_ledger
        await CustomerLedger.create({
          customer_id:      invoice.customer_id,
          account_id:       account.account_id,
          transaction_date: new Date(),
          transaction_type: 'payment',
          reference_type:   'PAYMENT',
          reference_id:     invoice.invoice_id,
          reference_number: invoice.invoice_number,    // INV-XXXXXX as reference
          debit_amount:     0,
          credit_amount:    cashReceived,
          balance:          newBalance,
          payment_method:   'cash',
          description:      `Cash received for ${invoice.invoice_number}`,
          performed_by:     req.user?.email || 'pharmacist',
          product_id:       null,
          product_quantity: null,
          status:           1,
          created_at:       new Date(),
          updated_at:       new Date()
        }, { transaction });
      }
    }

    await transaction.commit();

    res.json({
      success: true,
      message: 'Invoice updated successfully',
      data: {
        invoice_id:     invoice.invoice_id,
        invoice_number: invoice.invoice_number,
        payment_status: updates.payment_status || invoice.payment_status,
        delivery_status: updates.delivery_status || invoice.delivery_status,
        paid_amount:    updates.paid_amount    ?? invoice.paid_amount,
        due_amount:     updates.due_amount     ?? invoice.due_amount
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Update invoice error:', error);
    res.status(500).json({ success: false, message: 'Failed to update invoice', error: error.message });
  }
};

// Delete invoice (soft delete)
exports.deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      where: { invoice_id: id, status: 1 }
    });

    if (!invoice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invoice not found' 
      });
    }

    await invoice.update({ status: 0 });
    await InvoiceReport.update(
      { status: 0 },
      { where: { invoice_id: id } }
    );

    res.json({
      success: true,
      message: 'Invoice deleted successfully'
    });
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete invoice',
      error: error.message 
    });
  }
};

// Get invoice statistics
exports.getInvoiceStats = async (req, res) => {
  try {
    const [invoiceStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_invoices,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_invoices,
        COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END) as unpaid_invoices,
        COALESCE(SUM(total_amount), 0) as total_value,
        COALESCE(SUM(paid_amount), 0) as total_paid,
        COALESCE(SUM(due_amount), 0) as total_due
      FROM invoice
      WHERE status = 1
    `);

    res.json({
      success: true,
      data: invoiceStats[0] || {
        total_invoices: 0,
        paid_invoices: 0,
        unpaid_invoices: 0,
        total_value: 0,
        total_paid: 0,
        total_due: 0
      }
    });
  } catch (error) {
    console.error('Get invoice stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch invoice statistics',
      error: error.message 
    });
  }
};

// Generate sequential return number: RET-000001, RET-000002...
async function generateReturnNumber() {
  const [last] = await sequelize.query(
    `SELECT return_number FROM invoice_return
     WHERE return_number ~ '^RET-[0-9]+$'
     ORDER BY return_id DESC LIMIT 1`,
    { type: sequelize.QueryTypes.SELECT }
  );
  let next = 1;
  if (last?.return_number) {
    const m = last.return_number.match(/RET-(\d+)/);
    if (m) next = parseInt(m[1]) + 1;
  }
  return `RET-${String(next).padStart(6, '0')}`;
}

// Create invoice return
exports.createInvoiceReturn = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('=== Invoice Return Request ===');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const {
      linkedInvoiceId,
      invoiceNumber,
      customerName,
      invoiceType,
      description,
      createdBy,
      items = []
    } = req.body;

    // Validate required fields
    if (!linkedInvoiceId || !customerName) {
      await transaction.rollback();
      console.error('Validation failed:', { linkedInvoiceId, customerName });
      return res.status(400).json({ 
        success: false, 
        message: 'Linked invoice and customer name are required' 
      });
    }

    if (!items || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'At least one item is required for return' 
      });
    }

    // Extract numeric invoice ID if it's in format "inv-123" or just a string number
    let numericInvoiceId = linkedInvoiceId;
    if (typeof linkedInvoiceId === 'string') {
      if (linkedInvoiceId.includes('-')) {
        numericInvoiceId = parseInt(linkedInvoiceId.split('-').pop());
      } else {
        numericInvoiceId = parseInt(linkedInvoiceId);
      }
    }
    
    console.log('Parsed invoice ID:', numericInvoiceId);

    // Verify invoice exists
    const invoiceCheck = await Invoice.findOne({
      where: { invoice_id: numericInvoiceId, status: 1 }
    });

    if (!invoiceCheck) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Invoice with ID ${numericInvoiceId} not found`
      });
    }

    // Calculate totals
    let subtotal = 0;
    const processedItems = [];

    for (const item of items) {
      const qty = Number(item.qty || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const purchasePrice = Number(item.purchasePrice || 0);
      const totalPrice = qty * unitPrice;
      const productProfit = (unitPrice - purchasePrice) * qty;  // PDF: product_profit

      if (qty <= 0) continue;

      // Keep product ID as-is (UUID)
      let numericProductId = item.productId;

      subtotal += totalPrice;
      processedItems.push({
        productId: numericProductId,
        productName: item.name,
        quantity: qty,
        unitPrice: unitPrice,
        totalPrice: totalPrice,
        purchasePrice: purchasePrice,
        productProfit: Number(productProfit.toFixed(2))   // ← PDF: product_profit
      });
    }

    console.log('Processed items:', processedItems.length);

    if (processedItems.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'At least one item with valid quantity is required'
      });
    }

    const totalAmount = subtotal;
    const returnNumber = await generateReturnNumber();
    
    console.log('Creating return:', { returnNumber, numericInvoiceId, totalAmount });

    // Create invoice return record - using INSERT with RETURNING
    const [returnResult] = await sequelize.query(`
      INSERT INTO invoice_return (
        return_number,
        linked_invoice_id,
        linked_invoice_number,
        customer_name,
        invoice_type,
        return_description,
        subtotal,
        total_amount,
        refund_amount,
        refund_status,
        created_by,
        status
      ) VALUES (
        :returnNumber,
        :linkedInvoiceId,
        :invoiceNumber,
        :customerName,
        :invoiceType,
        :description,
        :subtotal,
        :totalAmount,
        :refundAmount,
        'pending',
        :createdBy,
        1
      )
      RETURNING return_id, return_number
    `, {
      replacements: {
        returnNumber,
        linkedInvoiceId: numericInvoiceId,
        invoiceNumber: invoiceNumber || invoiceCheck.invoice_number,
        customerName,
        invoiceType: invoiceType || 'normal',
        description: description || '',
        subtotal,
        totalAmount,
        refundAmount: totalAmount, // Full refund by default
        createdBy: createdBy || 'System'
      },
      transaction,
      type: sequelize.QueryTypes.INSERT
    });

    const returnId = returnResult[0]?.return_id;
    
    if (!returnId) {
      throw new Error('Failed to get return_id from database');
    }
    
    console.log('Return created with ID:', returnId);

    // Insert return items
    for (const item of processedItems) {
      await sequelize.query(`
        INSERT INTO invoice_return_report (
          return_id,
          product_id,
          product_name,
          quantity,
          unit_price,
          total_price,
          product_profit,
          invoice_type,
          status
        ) VALUES (
          :returnId,
          :productId,
          :productName,
          :quantity,
          :unitPrice,
          :totalPrice,
          :productProfit,
          :invoiceType,
          1
        )
      `, {
        replacements: {
          returnId,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          productProfit: item.productProfit || 0,    // ← PDF: product_profit
          invoiceType: invoiceType || 'normal'       // ← PDF: invoice_type
        },
        transaction
      });

      // Return stock back to inventory (add to stock_history)
      // Find the most recent batch for this product
      const [stock_history] = await sequelize.query(`
        SELECT batch_id, remaining_quantity
        FROM stock_history
        WHERE product_id = :productId
          AND batch_status = 'ACTIVE'
          AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
        ORDER BY created_at DESC
        LIMIT 1
      `, {
        replacements: { productId: item.productId },
        transaction
      });

      if (stock_history && stock_history.length > 0) {
        const batch = stock_history[0];
        const currentQty = batch.remaining_quantity;
        const newQty = currentQty + item.quantity;
        
        // Add returned quantity back to batch
        await sequelize.query(`
          UPDATE stock_history
          SET remaining_quantity = remaining_quantity + :quantity
          WHERE batch_id = :batchId
        `, {
          replacements: {
            batchId: batch.batch_id,
            quantity: item.quantity
          },
          transaction
        });

        // Log in stock ledger with balance_after
        await sequelize.query(`
          INSERT INTO stock_report (
            batch_id,
            product_id,
            transaction_type,
            quantity_change,
            balance_after,
            reference_type,
            reference_id,
            notes,
            created_at
          ) VALUES (
            :batchId,
            :productId,
            'RETURN',
            :quantityChange,
            :balanceAfter,
            'INVOICE_RETURN',
            :returnId,
            :notes,
            CURRENT_TIMESTAMP
          )
        `, {
          replacements: {
            batchId: batch.batch_id,
            productId: item.productId,
            quantityChange: item.quantity,
            balanceAfter: newQty,
            returnId,
            notes: `Returned from invoice ${invoiceNumber || invoiceCheck.invoice_number}`
          },
          transaction
        });
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BUG-FIX: Update customer account + ledger + original invoice on return
    // ══════════════════════════════════════════════════════════════════════════

    // Step A: Get customer_id from the linked invoice
    const customerId = invoiceCheck.customer_id;

    // ── Bug 2 & 3: Customer account balance + customer ledger credit entry ──
    if (customerId) {
      const customerAccount = await CustomerAccount.findOne({
        where: { customer_id: customerId, status: 1 },
        transaction
      });

      if (customerAccount) {
        // Invoice return: reduce outstanding (customer owes less)
        // Correct formula: balance = total_debit - total_credit (after deducting return amount from debit)
        const reducedDebit   = Math.max(Number(customerAccount.total_debit) - totalAmount, 0);
        const reducedBalance = reducedDebit - Number(customerAccount.total_credit);

        await customerAccount.update({
          current_balance: reducedBalance,
          total_debit:     reducedDebit,
          updated_at:      new Date()
        }, { transaction });

        // Bug 3: Create customer_ledger CREDIT entry (refund type)
        await CustomerLedger.create({
          customer_id:      customerId,
          account_id:       customerAccount.account_id,
          transaction_date: new Date(),
          transaction_type: 'refund',
          reference_type:   'INVOICE_RETURN',
          reference_id:     returnId,
          reference_number: returnNumber,
          debit_amount:     0,
          credit_amount:    totalAmount,   // credit = reduces what customer owes
          balance:          reducedBalance,
          payment_method:   null,
          description:      `Return ${returnNumber} — ${customerName} (Invoice: ${invoiceNumber || invoiceCheck.invoice_number})`,
          performed_by:     createdBy || 'System',
          status:           1,
          created_at:       new Date(),
          updated_at:       new Date()
        }, { transaction });
      }
    }

    // ── Bug 4: Adjust original invoice paid_amount / due_amount ─────────────
    // Logic:
    //  • If invoice was fully paid and full return → set paid_amount -= returnTotal, due_amount += returnTotal
    //  • If invoice was unpaid → reduce total_amount conceptually via due_amount -= returnTotal
    //  • payment_status recalculated from new paid vs total
    const origTotal = Number(invoiceCheck.total_amount || 0);
    const origPaid  = Number(invoiceCheck.paid_amount  || 0);
    const origDue   = Number(invoiceCheck.due_amount   || 0);

    // New effective total after return (items returned reduces what was billed)
    const newInvoiceTotal = Math.max(origTotal - totalAmount, 0);
    // Paid amount can't exceed new total
    const newPaidAmount   = Math.min(origPaid, newInvoiceTotal);
    const newDueAmount    = Math.max(newInvoiceTotal - newPaidAmount, 0);
    const newPaymentStatus = newDueAmount <= 0 ? 'paid' : 'unpaid';

    await sequelize.query(
      `UPDATE invoice
       SET total_amount    = :newTotal,
           paid_amount     = :newPaid,
           due_amount      = :newDue,
           payment_status  = :payStatus,
           updated_at      = NOW()
       WHERE invoice_id = :invId`,
      {
        replacements: {
          newTotal:  newInvoiceTotal,
          newPaid:   newPaidAmount,
          newDue:    newDueAmount,
          payStatus: newPaymentStatus,
          invId:     numericInvoiceId
        },
        type: sequelize.QueryTypes.UPDATE,
        transaction
      }
    );

    // ── Bug 5: Recalculate profit on invoice_report ──────────────────────────
    // For each returned product, reduce the invoice_report quantity and total_price.
    // Profit on a line item = (unit_price - purchase_price) * quantity_remaining
    // We achieve this by updating invoice_report rows for returned products:
    //   new_qty = original_qty - returned_qty  (min 0)
    //   new_total_price = new_qty * unit_price
    // If quantity hits 0, the line still exists but shows 0 (no deletion so history is preserved).
    for (const item of processedItems) {
      await sequelize.query(
        `UPDATE invoice_report
         SET quantity   = GREATEST(quantity   - :retQty, 0),
             total_price = GREATEST(total_price - (:retQty * unit_price), 0),
             updated_at  = NOW()
         WHERE invoice_id  = :invId
           AND product_id  = :productId
           AND status      = 1`,
        {
          replacements: {
            retQty:    item.quantity,
            invId:     numericInvoiceId,
            productId: item.productId
          },
          type: sequelize.QueryTypes.UPDATE,
          transaction
        }
      );
    }

    // ── Update original invoice delivery_status to 'returned' ──────────────
    // Also mark payment_status based on whether full return (total=0) or partial
    const returnStatus = newInvoiceTotal <= 0 ? 'cancelled' : 'returned';
    await sequelize.query(
      `UPDATE invoice
       SET delivery_status = :retStatus,
           updated_at      = NOW()
       WHERE invoice_id = :invId`,
      {
        replacements: { retStatus: returnStatus, invId: numericInvoiceId },
        type: sequelize.QueryTypes.UPDATE,
        transaction
      }
    );
    // ═══════════════════════════════════════════════════════════════════════

    await transaction.commit();
    console.log('✓ Invoice return completed successfully');

    res.status(201).json({
      success: true,
      message: 'Invoice return created successfully',
      data: {
        returnId,
        returnNumber,
        linkedInvoiceNumber: invoiceNumber || invoiceCheck.invoice_number,
        customerName,
        totalAmount,
        itemCount: processedItems.length,
        invoiceAdjusted: {
          newInvoiceTotal,
          newPaidAmount,
          newDueAmount,
          newPaymentStatus,
          deliveryStatus: returnStatus
        },
        customerAccountUpdated: !!customerId
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Create invoice return error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    if (error.sql) {
      console.error('SQL:', error.sql);
    }
    if (error.original) {
      console.error('Original error:', error.original);
    }
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create invoice return',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get all invoice returns
exports.listInvoiceReturns = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE ir.status = 1';
    if (search) {
      whereClause += ` AND (
        ir.return_number ILIKE '%${search}%' OR
        ir.linked_invoice_number ILIKE '%${search}%' OR
        ir.customer_name ILIKE '%${search}%'
      )`;
    }

    const [returns] = await sequelize.query(`
      SELECT 
        ir.return_id,
        ir.return_number,
        ir.linked_invoice_id,
        ir.linked_invoice_number,
        ir.customer_name,
        ir.invoice_type,
        ir.return_description,
        ir.subtotal,
        ir.total_amount,
        ir.refund_amount,
        ir.refund_status,
        ir.created_by,
        ir.created_at,
        ir.updated_at,
        COUNT(iri.return_item_id) as item_count
      FROM invoice_return ir
      LEFT JOIN invoice_return_report iri ON ir.return_id = iri.return_id AND iri.status = 1
      ${whereClause}
      GROUP BY ir.return_id, ir.return_number, ir.linked_invoice_id, ir.linked_invoice_number, 
               ir.customer_name, ir.invoice_type, ir.return_description, ir.subtotal, 
               ir.total_amount, ir.refund_amount, ir.refund_status, ir.created_by, 
               ir.created_at, ir.updated_at
      ORDER BY ir.created_at DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { limit: parseInt(limit), offset: parseInt(offset) }
    });

    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM invoice_return ir
      ${whereClause}
    `);

    res.json({
      success: true,
      data: returns,
      pagination: {
        total: parseInt(countResult[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countResult[0].total / limit)
      }
    });

  } catch (error) {
    console.error('List invoice returns error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch invoice returns',
      error: error.message 
    });
  }
};

// Get single invoice return details
exports.getInvoiceReturn = async (req, res) => {
  try {
    const { id } = req.params;

    const [returns] = await sequelize.query(`
      SELECT 
        ir.return_id,
        ir.return_number,
        ir.linked_invoice_id,
        ir.linked_invoice_number,
        ir.customer_name,
        ir.customer_phone,
        ir.customer_email,
        ir.invoice_type,
        ir.return_description,
        ir.subtotal,
        ir.discount,
        ir.total_amount,
        ir.refund_amount,
        ir.refund_method,
        ir.refund_status,
        ir.created_by,
        ir.created_at
      FROM invoice_return ir
      WHERE ir.return_id = :id AND ir.status = 1
    `, {
      replacements: { id }
    });

    if (!returns || returns.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice return not found'
      });
    }

    const invoiceReturn = returns[0];

    // Get return items
    const [items] = await sequelize.query(`
      SELECT 
        iri.return_item_id,
        iri.product_id,
        iri.product_name,
        iri.quantity,
        iri.unit_price,
        iri.total_price,
        iri.product_profit,
        iri.invoice_type
      FROM invoice_return_report iri
      WHERE iri.return_id = :returnId AND iri.status = 1
      ORDER BY iri.return_item_id
    `, {
      replacements: { returnId: id }
    });

    res.json({
      success: true,
      data: {
        ...invoiceReturn,
        items
      }
    });

  } catch (error) {
    console.error('Get invoice return error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch invoice return',
      error: error.message 
    });
  }
};

// ─────────────────────────────────────────────────────────────
// INVOICE REPORT — all invoice_report with profit (PDF: invoice_report)
// ─────────────────────────────────────────────────────────────
exports.listInvoiceReport = async (req, res) => {
  try {
    const { limit = 200, search = '', fromDate, toDate } = req.query;

    let where = 'i.status = 1 AND ii.status = 1';
    const replacements = {};

    if (search.trim()) {
      where += ` AND (p.product_title ILIKE :search OR i.invoice_number ILIKE :search OR i.customer_name ILIKE :search)`;
      replacements.search = `%${search.trim()}%`;
    }
    if (fromDate) { where += ' AND i.invoice_date >= :fromDate'; replacements.fromDate = fromDate; }
    if (toDate)   { where += ' AND i.invoice_date <= :toDate';   replacements.toDate   = toDate;   }

    const rows = await sequelize.query(`
      SELECT
        ii.item_id,
        ii.invoice_id,
        i.invoice_number,
        i.invoice_date,
        i.customer_name,
        i.payment_status,
        ii.product_id,
        ii.product_title,
        ii.quantity      AS product_quantity,
        ii.unit_price    AS product_price,
        ii.discount      AS product_discount,
        ii.tax,
        ii.total_price,
        ii.batch_number,
        ii.expiry_date   AS product_expiry,
        -- profit = (sale_price - purchase_price) × qty — purchase_price stored at invoice creation
        COALESCE(ii.purchase_price, 0)                                    AS purchase_price,
        (ii.unit_price - COALESCE(ii.purchase_price, 0)) * ii.quantity    AS product_profit,
        i.created_at
      FROM invoice_report ii
      JOIN invoice i ON ii.invoice_id = i.invoice_id
      LEFT JOIN product p ON p.product_id = ii.product_id
      WHERE ${where}
      ORDER BY i.invoice_date DESC, ii.item_id DESC
      LIMIT :lim
    `, { replacements: { ...replacements, lim: parseInt(limit) }, type: sequelize.QueryTypes.SELECT });

    res.json({
      success: true,
      data: rows.map(r => ({
        id:              r.item_id,
        invoiceId:       r.invoice_id,
        invoiceNumber:   r.invoice_number,
        invoiceDate:     r.invoice_date,
        customerName:    r.customer_name,
        paymentStatus:   r.payment_status,
        productId:       r.product_id,
        productTitle:    r.product_title,
        productQuantity: Number(r.product_quantity || 0),
        productPrice:    Number(r.product_price    || 0),
        productDiscount: Number(r.product_discount || 0),
        tax:             Number(r.tax              || 0),
        totalPrice:      Number(r.total_price      || 0),
        batchNumber:     r.batch_number,
        productExpiry:   r.product_expiry,
        purchasePrice:   Number(r.purchase_price   || 0),
        productProfit:   Number(r.product_profit   || 0),
        createdAt:       r.created_at
      }))
    });
  } catch (error) {
    console.error('List invoice report error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch invoice report', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// INVOICE RETURN REPORT — all invoice_return_report (PDF: invoice_return_report)
// ─────────────────────────────────────────────────────────────
exports.listInvoiceReturnReport = async (req, res) => {
  try {
    const { limit = 200, search = '', fromDate, toDate } = req.query;

    let where = 'ir.status = 1 AND iri.status = 1';
    const replacements = {};

    if (search.trim()) {
      where += ` AND (iri.product_name ILIKE :search OR ir.return_number ILIKE :search OR ir.customer_name ILIKE :search)`;
      replacements.search = `%${search.trim()}%`;
    }
    if (fromDate) { where += ' AND ir.created_at::date >= :fromDate'; replacements.fromDate = fromDate; }
    if (toDate)   { where += ' AND ir.created_at::date <= :toDate';   replacements.toDate   = toDate;   }

    const rows = await sequelize.query(`
      SELECT
        iri.return_item_id,
        iri.return_id,
        ir.return_number,
        ir.linked_invoice_id,
        ir.linked_invoice_number,
        ir.customer_name,
        ir.invoice_type,
        ir.refund_status,
        iri.product_id,
        iri.product_name    AS product_title,
        iri.quantity        AS product_quantity,
        iri.unit_price      AS product_price,
        iri.total_price,
        iri.product_profit,
        iri.invoice_type    AS item_invoice_type,
        ir.created_at
      FROM invoice_return_report iri
      JOIN invoice_return ir ON iri.return_id = ir.return_id
      WHERE ${where}
      ORDER BY ir.created_at DESC, iri.return_item_id DESC
      LIMIT :lim
    `, { replacements: { ...replacements, lim: parseInt(limit) }, type: sequelize.QueryTypes.SELECT });

    res.json({
      success: true,
      data: rows.map(r => ({
        id:               r.return_item_id,
        returnId:         r.return_id,
        returnNumber:     r.return_number,
        linkedInvoiceId:  r.linked_invoice_id,
        linkedInvoiceNo:  r.linked_invoice_number,
        customerName:     r.customer_name,
        invoiceType:      r.invoice_type || 'normal',
        refundStatus:     r.refund_status,
        productId:        r.product_id,
        productTitle:     r.product_title,
        productQuantity:  Number(r.product_quantity || 0),
        productPrice:     Number(r.product_price    || 0),
        totalPrice:       Number(r.total_price      || 0),
        productProfit:    Number(r.product_profit   || 0),
        itemInvoiceType:  r.item_invoice_type || 'normal',
        createdAt:        r.created_at
      }))
    });
  } catch (error) {
    console.error('List invoice return report error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch invoice return report', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER-FACING RETURN  (storefront — 14-day rule enforced)
// POST /api/invoice/customer-return
// ─────────────────────────────────────────────────────────────────────────────
exports.createCustomerReturn = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const customerId = req.user?.id;               // from verifyCustomerToken
    const { linkedInvoiceId, items, description } = req.body;

    if (!linkedInvoiceId || !items || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invoice ID and at least one item are required' });
    }

    // Verify the invoice belongs to this customer
    const invoiceCheck = await Invoice.findOne({
      where: { invoice_id: linkedInvoiceId, customer_id: customerId, status: 1 }
    });
    if (!invoiceCheck) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Invoice not found or does not belong to your account' });
    }

    // ── 14-day rule ──────────────────────────────────────────────────────────
    const invoiceDate   = new Date(invoiceCheck.invoice_date || invoiceCheck.created_at);
    const today         = new Date();
    const diffDays      = Math.floor((today - invoiceDate) / (1000 * 60 * 60 * 24));
    if (diffDays > 14) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Return window has expired. Returns are only accepted within 14 days of purchase. This order was placed ${diffDays} days ago.`
      });
    }

    // Check if already returned
    const existingReturn = await sequelize.query(
      `SELECT return_id FROM invoice_return WHERE linked_invoice_id = :invId AND status = 1 LIMIT 1`,
      { replacements: { invId: linkedInvoiceId }, type: sequelize.QueryTypes.SELECT, transaction }
    );
    if (existingReturn.length > 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'A return has already been submitted for this order.' });
    }

    // Get invoice items with purchase prices for profit calculation
    const invoiceItems = await InvoiceReport.findAll({
      where: { invoice_id: linkedInvoiceId, status: 1 }
    });
    const priceMap = {};
    invoiceItems.forEach(it => { priceMap[String(it.product_id)] = Number(it.purchase_price || 0); });

    // Validate quantities don't exceed original
    const qtyMap = {};
    invoiceItems.forEach(it => { qtyMap[String(it.product_id)] = (qtyMap[String(it.product_id)] || 0) + Number(it.quantity); });

    let subtotal = 0;
    const processedItems = [];
    for (const item of items) {
      const qty = Number(item.qty || 0);
      if (qty <= 0) continue;
      const unitPrice     = Number(item.unitPrice || 0);
      const purchasePrice = priceMap[String(item.productId)] ?? Number(item.purchasePrice || 0);
      const maxQty        = qtyMap[String(item.productId)] || 0;
      if (qty > maxQty) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: `Return quantity for ${item.name} (${qty}) exceeds original order quantity (${maxQty}).` });
      }
      subtotal += qty * unitPrice;
      processedItems.push({
        productId: item.productId, productName: item.name, quantity: qty,
        unitPrice, totalPrice: qty * unitPrice,
        purchasePrice, productProfit: (unitPrice - purchasePrice) * qty
      });
    }
    if (processedItems.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No valid items to return' });
    }

    const totalAmount  = subtotal;
    const returnNumber = await generateReturnNumber();

    // Insert invoice_return
    const [returnResult] = await sequelize.query(`
      INSERT INTO invoice_return (
        return_number, linked_invoice_id, linked_invoice_number,
        customer_name, invoice_type, return_description,
        subtotal, total_amount, refund_amount, refund_status,
        created_by, status
      ) VALUES (
        :returnNumber, :linkedInvoiceId, :invoiceNumber,
        :customerName, 'normal', :description,
        :subtotal, :totalAmount, :totalAmount, 'pending',
        :createdBy, 1
      ) RETURNING return_id, return_number`,
      {
        replacements: {
          returnNumber, linkedInvoiceId,
          invoiceNumber: invoiceCheck.invoice_number,
          customerName:  invoiceCheck.customer_name,
          description:   description || 'Customer return request',
          subtotal, totalAmount,
          createdBy: req.user?.email || 'customer'
        },
        transaction, type: sequelize.QueryTypes.INSERT
      }
    );
    const returnId = returnResult[0]?.return_id;
    if (!returnId) throw new Error('Failed to create return record');

    // Insert return items + restore stock + update invoice_report quantities
    for (const item of processedItems) {
      // invoice_return_report
      await sequelize.query(`
        INSERT INTO invoice_return_report (return_id, product_id, product_name, quantity, unit_price, total_price, product_profit, invoice_type, status)
        VALUES (:returnId, :productId, :productName, :quantity, :unitPrice, :totalPrice, :productProfit, 'normal', 1)`,
        { replacements: { returnId, productId: item.productId, productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice, productProfit: Number(item.productProfit.toFixed(2)) }, transaction }
      );

      // Restore stock
      const [batch] = await sequelize.query(`
        SELECT batch_id, remaining_quantity FROM stock_history
        WHERE product_id = :pid AND batch_status = 'ACTIVE' AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
        ORDER BY created_at DESC LIMIT 1`,
        { replacements: { pid: item.productId }, type: sequelize.QueryTypes.SELECT, transaction }
      );
      if (batch) {
        await sequelize.query(`UPDATE stock_history SET remaining_quantity = remaining_quantity + :qty WHERE batch_id = :bid`,
          { replacements: { qty: item.quantity, bid: batch.batch_id }, transaction });
        await sequelize.query(`INSERT INTO stock_report (product_id, batch_id, transaction_type, quantity_change, balance_after, reference_type, reference_id, notes, created_at)
          VALUES (:pid, :bid, 'RETURN', :qty, :bal, 'INVOICE_RETURN', :rid, :notes, NOW())`,
          { replacements: { pid: item.productId, bid: batch.batch_id, qty: item.quantity, bal: batch.remaining_quantity + item.quantity, rid: returnId, notes: `Customer return - ${returnNumber}` }, transaction }
        );
      }

      // Reduce invoice_report quantity
      await sequelize.query(`
        UPDATE invoice_report SET quantity = GREATEST(quantity - :qty, 0), total_price = GREATEST(total_price - (:qty * unit_price), 0), updated_at = NOW()
        WHERE invoice_id = :invId AND product_id = :pid AND status = 1`,
        { replacements: { qty: item.quantity, invId: linkedInvoiceId, pid: item.productId }, transaction }
      );
    }

    // Recalculate invoice total
    const [newTotal] = await sequelize.query(
      `SELECT COALESCE(SUM(total_price), 0) AS total FROM invoice_report WHERE invoice_id = :invId AND status = 1`,
      { replacements: { invId: linkedInvoiceId }, type: sequelize.QueryTypes.SELECT, transaction }
    );
    const newInvoiceTotal = Number(newTotal?.total || 0);
    const returnStatus    = newInvoiceTotal <= 0 ? 'cancelled' : 'returned';
    await sequelize.query(
      `UPDATE invoice SET total_amount = :total, delivery_status = :status, updated_at = NOW() WHERE invoice_id = :invId`,
      { replacements: { total: newInvoiceTotal, status: returnStatus, invId: linkedInvoiceId }, transaction }
    );

    // Update customer account balance
    if (customerId) {
      const customerAccount = await CustomerAccount.findOne({ where: { customer_id: customerId, status: 1 }, transaction });
      if (customerAccount) {
        const reducedDebit   = Math.max(Number(customerAccount.total_debit) - totalAmount, 0);
        const reducedBalance = reducedDebit - Number(customerAccount.total_credit);
        await customerAccount.update({ current_balance: reducedBalance, total_debit: reducedDebit, updated_at: new Date() }, { transaction });
        await CustomerLedger.create({
          customer_id: customerId, account_id: customerAccount.account_id,
          transaction_date: new Date(), transaction_type: 'refund',
          reference_type: 'INVOICE_RETURN', reference_id: returnId, reference_number: returnNumber,
          debit_amount: 0, credit_amount: totalAmount, balance: reducedBalance,
          payment_method: null, description: `Return ${returnNumber} — ${invoiceCheck.invoice_number}`,
          performed_by: req.user?.email || 'customer', status: 1, created_at: new Date(), updated_at: new Date()
        }, { transaction });
      }
    }

    await transaction.commit();
    res.status(201).json({
      success: true,
      message: 'Return request submitted successfully. Your refund will be processed within 3-5 business days.',
      data: { returnId, returnNumber, totalRefund: totalAmount, daysRemaining: 14 - diffDays }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Customer return error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit return', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LIST CUSTOMER'S OWN RETURNS  (storefront)
// GET /api/invoice/customer-returns
// ─────────────────────────────────────────────────────────────────────────────
exports.listCustomerReturns = async (req, res) => {
  try {
    const customerId = req.user?.id;
    const rows = await sequelize.query(
      `SELECT ir.return_id, ir.return_number, ir.linked_invoice_id, ir.linked_invoice_number,
              ir.customer_name, ir.return_description, ir.total_amount, ir.refund_amount,
              ir.refund_status, ir.created_at,
              json_agg(json_build_object('product_name', irr.product_name, 'quantity', irr.quantity,
                'unit_price', irr.unit_price, 'total_price', irr.total_price)) AS items
       FROM invoice_return ir
       JOIN invoice_return_report irr ON irr.return_id = ir.return_id
       JOIN invoice i ON i.invoice_id = ir.linked_invoice_id
       WHERE i.customer_id = :cid AND ir.status = 1
       GROUP BY ir.return_id
       ORDER BY ir.created_at DESC`,
      { replacements: { cid: customerId }, type: sequelize.QueryTypes.SELECT }
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List customer returns error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch returns', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE RETURN STATUS  (pharmacist marks refund as processed)
// PATCH /api/invoice/returns/:id/status
// ─────────────────────────────────────────────────────────────────────────────
exports.updateReturnStatus = async (req, res) => {
  try {
    const { id }           = req.params;
    const { refund_status } = req.body;

    if (!['pending', 'refunded', 'rejected'].includes(refund_status)) {
      return res.status(400).json({ success: false, message: 'Invalid refund_status. Must be pending | refunded | rejected' });
    }

    await sequelize.query(
      `UPDATE invoice_return SET refund_status = :status, updated_at = NOW() WHERE return_id = :id`,
      { replacements: { status: refund_status, id }, type: sequelize.QueryTypes.UPDATE }
    );

    res.json({ success: true, message: `Return status updated to ${refund_status}` });
  } catch (error) {
    console.error('Update return status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update return status', error: error.message });
  }
};
