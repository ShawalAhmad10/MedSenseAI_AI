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

    // Calculate totals using the selected batch's sale price.
    let subtotal = 0;
    const processedItems = [];
    const batchAllocations = []; // Track allocations for ledger entries

    for (const item of items) {
      const qty = Number(item.quantity ?? item.qty ?? 1);
      const itemDiscount = Number(item.discount || 0);
      const tax = Number(item.tax || 0);

      const productId = String(item.productId || item.product_id || '').replace(/^prod-/, '');
      
      if (!productId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Product ID is required for item: ${item.name || 'Unknown'}`
        });
      }

      const pricedProduct = await Product.findByPk(String(productId).replace(/^prod-/, ''), { transaction });
      if (!pricedProduct || pricedProduct.product_status === 0) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Selected product is unavailable.' });
      }
      let allocations;
      try {
        allocations = await BatchAllocationService.allocateBatchesForSale(productId, qty, transaction, item.batchId ?? item.batch_id ?? null);
      } catch (error) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: error.message });
      }
      const unitPrice = Number(allocations[0].sale_price);
      if (Array.isArray(item.fifo_quote) && (item.fifo_quote.length !== allocations.length || allocations.some((allocation, index) =>
        Number(item.fifo_quote[index]?.batch_id) !== Number(allocation.batch_id) ||
        Number(item.fifo_quote[index]?.quantity) !== Number(allocation.quantity) ||
        Number(item.fifo_quote[index]?.unit_price) !== Number(allocation.sale_price)))) {
        await transaction.rollback();
        return res.status(409).json({ success: false, message: 'FIFO stock or prices changed. Refresh the invoice before saving.' });
      }
      if (!Array.isArray(item.fifo_quote) && allocations.some(allocation => Number(allocation.sale_price) !== unitPrice)) {
        await transaction.rollback();
        return res.status(409).json({ success: false, message: 'Review the FIFO price breakdown before saving this invoice.' });
      }
      const submittedPrice = item.unitPrice ?? item.unit_price ?? item.price;
      if (submittedPrice != null && Number(submittedPrice) !== unitPrice) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'The selected batch sale price has changed. Refresh the batch before invoicing.' });
      }
      const totalPrice = allocations.reduce((sum, allocation) => sum + allocation.quantity * Number(allocation.sale_price), 0) - itemDiscount + tax;
      subtotal += totalPrice;

      // The selected batch owns the price; its identity and cost are captured on the invoice.
      try {
        
        // Store allocations for ledger entry
        batchAllocations.push({
          productId,
          allocations
        });

        // Create invoice item for each batch allocation
        for (const alloc of allocations) {
          processedItems.push({
            product_id: alloc.product_id,
            product_title: alloc.product_title || item.name || item.productTitle || item.product_title || 'Unknown Item',
            batch_number: alloc.batch_number,
            batch_id: alloc.batch_id,
            expiry_date: alloc.expiry_date,
            quantity: alloc.quantity,
            unit_price: Number(alloc.sale_price),
            purchase_price: Number(alloc.purchase_cost || 0), // ← store at invoice time
            discount: itemDiscount * alloc.quantity / qty,
            tax: tax * alloc.quantity / qty,
            total_price: (alloc.quantity * Number(alloc.sale_price)) - (itemDiscount * alloc.quantity / qty) + (tax * alloc.quantity / qty)
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
         i.legacy_source_schema, i.legacy_source_invoice_id, i.legacy_source_invoice_number,
         i.status, i.notes, i.created_by, i.invoice_date, i.created_at, i.updated_at,
         -- item fields
         ii.item_id, ii.product_id, ii.product_title, ii.quantity,
         ii.unit_price, ii.discount AS item_discount, ii.tax, ii.total_price,
         ii.batch_id, ii.batch_number, ii.expiry_date,
         -- purchase price stored at invoice creation time (no stock_history join needed)
         COALESCE(ii.purchase_price, 0) AS purchase_price,
         -- pack info from product table
         p.product_pack_size    AS pack_size,
         p.product_pack_description AS pack_description
       FROM invoice i
       LEFT JOIN invoice_report ii ON ii.invoice_id = i.invoice_id AND ii.status = 1
       LEFT JOIN product p ON p.product_id = ii.product_id
       WHERE (i.status = 1 OR i.legacy_source_schema IS NOT NULL)
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
          legacy_source_schema: row.legacy_source_schema,
          legacy_source_invoice_id: row.legacy_source_invoice_id,
          archived: Boolean(row.legacy_source_schema && row.status === 0),
          invoiceNumber:   row.legacy_source_invoice_number || row.invoice_number,
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
          batchId:       row.batch_id,
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
        legacy_source_schema: invoice.legacy_source_schema,
        legacy_source_invoice_id: invoice.legacy_source_invoice_id,
        id:              item.item_id,
        productId:       item.product_id,
        batchId:         item.batch_id,
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
        invoiceNumber:   invoice.legacy_source_invoice_number || invoice.invoice_number,
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

    if (invoice.legacy_source_schema) {
      await transaction.rollback();
      return res.status(409).json({ success: false, message: 'Imported cloud history is read-only; original item and stock records were not supplied.' });
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

    if (invoice.legacy_source_schema) {
      return res.status(409).json({ success: false, message: 'Imported cloud history is read-only; original item and stock records were not supplied.' });
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

// Create invoice return
exports.createInvoiceReturn = async (req, res) => {
  try {
    const invoiceId = Number(String(req.body.linkedInvoiceId || '').replace(/^inv-/,''));
    const data = await require('../services/customerOrderReturnService').createReturn({staff:true,
      invoiceId,items:req.body.items,description:req.body.description,performedBy:req.user?.email});
    return res.status(201).json({success:true,message:'Invoice return created successfully',data});
  } catch(error) {
    return res.status(error.status || 500).json({success:false,message:error.status ? error.message : 'Failed to create invoice return'});
  }
};
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
  try {
    const data = await require('../services/customerOrderReturnService').createReturn({
      customerId:req.user.id, invoiceId:req.body.linkedInvoiceId, items:req.body.items,
      description:req.body.description, performedBy:req.user.email
    });
    return res.status(201).json({success:true,message:'Return request submitted successfully',data});
  } catch(error) {
    if(!error.status) console.error('Customer return failed:',error.message);
    return res.status(error.status || 500).json({success:false,message:error.status ? error.message : 'Failed to submit return'});
  }
};
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

    if (refund_status === 'refunded') {
      await require('../services/customerOrderReturnService').refundReturn(Number(id),req.user?.email);
    } else {
      return res.status(409).json({success:false,message:'A recorded stock return cannot be reversed by changing its refund label.'});
    }

    res.json({ success: true, message: `Return status updated to ${refund_status}` });
  } catch (error) {
    console.error('Update return status error:', error);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Failed to update return status' });
  }
};
