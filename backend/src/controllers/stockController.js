const Stock = require('../models/Stock');
const StockHistory = require('../models/StockHistory'); // New batch model
const StockReport = require('../models/StockReport'); // New ledger model
const StockHistoryOpen = require('../models/StockHistoryOpen');
const StockReturn = require('../models/StockReturn');
const StockReturnReport = require('../models/StockReturnReport');
const BatchAllocationService = require('../services/batchAllocationService');
const { sequelize } = require('../config/database');

// Create Stock StockHistory (Receive Stock)
exports.createStockBatch = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const {
      supplierId,
      supplierName,
      stockPrice,
      billNo,
      builtyNo,
      creationDate,
      createdBy,
      items = []
    } = req.body;

    // Validate required fields
    // Special case: supplierId = 0 means "Open Market" (no specific supplier)
    if (supplierId === undefined || supplierId === null || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Supplier and at least one item are required' 
      });
    }

    // Check for duplicate products in the same batch
    const productIds = items.map(item => item.productId);
    const uniqueProductIds = [...new Set(productIds)];
    
    if (productIds.length !== uniqueProductIds.length) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot add the same product multiple times in one batch. Each product should appear only once.' 
      });
    }

    // Auto-generate unique batch numbers for each product
    // Get the last batch number from database
    const lastBatchQuery = await sequelize.query(
      `SELECT batch_number FROM stock_history 
       WHERE batch_number LIKE 'BATCH-%' 
       ORDER BY batch_id DESC 
       LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, transaction }
    );
    
    let batchCounter = 1;
    if (lastBatchQuery.length > 0 && lastBatchQuery[0].batch_number) {
      const lastBatch = lastBatchQuery[0].batch_number;
      const match = lastBatch.match(/BATCH-(\d+)/);
      if (match) {
        batchCounter = parseInt(match[1]) + 1;
      }
    }

    // ✅ AUTO-GENERATE BILL NUMBER (NEW)
    let autoBillNo = billNo;
    if (!autoBillNo || autoBillNo.trim() === '') {
      const lastBillQuery = await sequelize.query(
        `SELECT bill_no FROM stock 
         WHERE bill_no LIKE 'BILL-%' 
         ORDER BY stock_id DESC 
         LIMIT 1`,
        { type: sequelize.QueryTypes.SELECT, transaction }
      );
      
      let billCounter = 1;
      if (lastBillQuery.length > 0 && lastBillQuery[0].bill_no) {
        const lastBillNo = lastBillQuery[0].bill_no;
        const match = lastBillNo.match(/BILL-(\d+)/);
        if (match) {
          billCounter = parseInt(match[1]) + 1;
        }
      }
      
      autoBillNo = `BILL-${String(billCounter).padStart(4, '0')}`;
    }

    // Calculate totals
    const totalAmount = items.reduce((sum, item) => {
      const qty = Number(item.qty || 0);
      const price = Number(item.purchasePrice || 0);
      const salesTax = Number(item.salesTax || 0);
      const advanceTax = Number(item.advanceTax || 0);
      const discount = Number(item.discount || 0);
      return sum + Math.max((qty * price) + salesTax + advanceTax - discount, 0);
    }, 0);

    // Create stock header
    // If supplierId is 0, it means "Open Market" (no specific supplier link)
    const stock = await Stock.create({
      supplier_id: supplierId === 0 ? null : supplierId,
      total_amount: stockPrice || totalAmount,
      paid_amount: 0,
      due_amount: stockPrice || totalAmount,
      discount: 0,
      bill_no: autoBillNo, // ✅ Use auto-generated bill number
      builty_no: builtyNo || '',
      creation_day: creationDate || new Date(),
      created_by: createdBy || 'System',
      status: 1
    }, { transaction });

    // Create stock history items with auto-generated batch numbers
    const stockHistoryItems = [];
    for (const item of items) {
      const qty = Number(item.qty || 0);
      const bonus = Number(item.bonus || 0);           // PDF: bonus field
      const purchasePrice = Number(item.purchasePrice || 0);
      const salesTax = Number(item.salesTax || 0);
      const advanceTax = Number(item.advanceTax || 0);
      const discount = Number(item.discount || 0);
      const totalPrice = Math.max((qty * purchasePrice) + salesTax + advanceTax - discount, 0);
      const totalQty = qty + bonus;                    // actual stock = qty + bonus

      // Handle bale and baleSize
      const bale = item.bale !== null && item.bale !== undefined && item.bale !== '' 
        ? Number(item.bale) 
        : null;
      const baleSize = item.baleSize !== null && item.baleSize !== undefined && item.baleSize !== '' 
        ? Number(item.baleSize) 
        : null;

      // Auto-generate batch number if not provided
      let batchNumber = item.batchNumber;
      if (!batchNumber || batchNumber.trim() === '') {
        batchNumber = `BATCH-${String(batchCounter).padStart(3, '0')}`;
        batchCounter++;
      }

      // Create batch entry using new StockHistory model
      const batch = await StockHistory.create({
        stock_id: stock.stock_id,
        product_id: item.productId || null,
        product_title: item.name || '',
        product_bale: bale,
        product_bale_size: baleSize,
        product_quantity: qty,
        product_bonus: bonus,              // ← actual bonus stored
        initial_quantity: totalQty,        // qty + bonus = real stock received
        remaining_quantity: totalQty,      // starts with full qty + bonus
        product_price: purchasePrice,
        sale_price: Number(item.salePrice || 0),
        sales_tax: salesTax,
        advance_tax: advanceTax,
        product_discount: discount,
        total_price: totalPrice,
        batch_number: batchNumber,
        expiry_date: item.productExpiry || null,
        batch_status: 'ACTIVE',
        creation_day: creationDate || new Date(),
        status: 1
      }, { transaction });

      // Create ledger entry with tax + expiry fields
      await StockReport.createEntry({
        batch_id: batch.batch_id,
        product_id: item.productId,
        transaction_type: 'PURCHASE',
        quantity_change: totalQty,
        balance_after: totalQty,
        reference_type: 'STOCK',
        reference_id: stock.stock_id,
        reference_number: autoBillNo,
        unit_price: purchasePrice,
        total_value: totalPrice,
        sales_tax: salesTax,           // ← PDF: sales_tax
        advance_tax: advanceTax,       // ← PDF: advance_tax
        product_expiry: item.productExpiry || null,  // ← PDF: product_expiry
        notes: `Purchase from ${supplierName || 'supplier'}${bonus > 0 ? ` (incl. ${bonus} bonus)` : ''}`,
        performed_by: createdBy || 'System',
        transaction_date: creationDate || new Date()
      }, transaction);

      // ✅ NO LONGER UPDATE product_stock_qty (it's removed from product table)
      // Stock is now calculated from stock_history dynamically via product_current_stock view

      stockHistoryItems.push(batch);
    }

    // ── Supplier Account + Ledger entries (one per item) ──────────────
    if (supplierId && supplierId !== 0) {
      // Ensure supplier_accounts row exists
      const [existingAcc] = await sequelize.query(
        `SELECT supplier_account_id, current_balance, total_debit FROM supplier_accounts
         WHERE supplier_id = :sid AND status = 1 LIMIT 1`,
        { replacements: { sid: supplierId }, type: sequelize.QueryTypes.SELECT, transaction }
      );

      let accountId;
      let currentBalance = Number(existingAcc?.current_balance || 0);

      if (!existingAcc) {
        const [newAcc] = await sequelize.query(
          `INSERT INTO supplier_accounts
             (supplier_id, current_balance, total_debit, total_credit, opening_balance, account_status, status, creation_day, created_at, updated_at)
           VALUES (:sid, 0, 0, 0, 0, 'active', 1, CURRENT_DATE, NOW(), NOW()) RETURNING supplier_account_id`,
          { replacements: { sid: supplierId }, type: sequelize.QueryTypes.INSERT, transaction }
        );
        accountId = newAcc[0].supplier_account_id;
      } else {
        accountId = existingAcc.supplier_account_id;
      }

      // Create one ledger entry per item (PDF: supplier_ledger has product-level detail)
      for (const batch of stockHistoryItems) {
        const itemTotal = (Number(batch.product_quantity) + Number(batch.product_bonus || 0)) * Number(batch.product_price);
        currentBalance += itemTotal;

        await sequelize.query(
          `INSERT INTO supplier_ledger
             (supplier_id, supplier_account_id, transaction_type, account_type, payment_type,
              stock_id, product_id, product_title, product_quantity, product_price, total_price,
              amount_paid, debit_amount, credit_amount, balance,
              description, reference_type, reference_number,
              performed_by, status, time_created, creation_day, updated_at)
           VALUES
             (:sid, :accId, 'stock_receive', 1, 0,
              :stockId, :productId, :productTitle, :qty, :price, :total,
              0, :total, 0, :balance,
              :desc, 'STOCK', :billNo,
              :by, 1, NOW(), CURRENT_DATE, NOW())`,
          {
            replacements: {
              sid:          supplierId,
              accId:        accountId,
              stockId:      stock.stock_id,
              productId:    batch.product_id,
              productTitle: batch.product_title,
              qty:          batch.product_quantity,
              price:        batch.product_price,
              total:        itemTotal,
              balance:      currentBalance,
              desc:         `Stock received — ${batch.product_title} (${autoBillNo})`,
              billNo:       autoBillNo,
              by:           createdBy || 'pharmacist'
            },
            type: sequelize.QueryTypes.INSERT,
            transaction
          }
        );
      }

      // Update supplier_accounts running totals
      await sequelize.query(
        `UPDATE supplier_accounts
         SET current_balance = :bal,
             total_debit     = total_debit + :total,
             updated_at      = NOW()
         WHERE supplier_id = :sid AND status = 1`,
        {
          replacements: { bal: currentBalance, total: totalAmount, sid: supplierId },
          type: sequelize.QueryTypes.UPDATE,
          transaction
        }
      );
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Stock batch created successfully',
      data: {
        stock_id: stock.stock_id,
        stockNumber: `STK-${stock.stock_id}`,
        supplier_id: stock.supplier_id,
        supplierName,
        total_amount: stock.total_amount,
        billNo: stock.bill_no,
        builtyNo: stock.builty_no,
        creationDate: stock.creation_day,
        createdBy: stock.created_by,
        createdAt: stock.created_at,
        items: stockHistoryItems.map(batch => ({
          id: batch.batch_id,
          batchNumber: batch.batch_number,
          productId: batch.product_id,
          name: batch.product_title,
          bale: batch.product_bale,
          baleSize: batch.product_bale_size,
          qty: batch.product_quantity,
          bonus: batch.product_bonus,         // ← bonus in response
          totalQty: batch.initial_quantity,   // qty + bonus
          purchasePrice: batch.product_price,
          salePrice: batch.sale_price,
          salesTax: batch.sales_tax,
          advanceTax: batch.advance_tax,
          discount: batch.product_discount,
          totalPrice: batch.total_price,
          productExpiry: batch.expiry_date,
          batchStatus: batch.batch_status
        }))
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Create stock batch error:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create stock batch',
      error: error.message,
      details: error.toString()
    });
  }
};

// List all stock stock_history
exports.listStockBatches = async (req, res) => {
  try {
    const stocks = await Stock.findAll({
      order: [['created_at', 'DESC']]
    });

    // Fetch supplier names from supplier_info table
    const supplierQuery = await sequelize.query(
      'SELECT supplier_id, supplier_name FROM supplier_info',
      { type: sequelize.QueryTypes.SELECT }
    );
    const supplierMap = {};
    supplierQuery.forEach(s => {
      supplierMap[s.supplier_id] = s.supplier_name;
    });

    // Fetch stock history items for each stock
    const stock_history = await Promise.all(stocks.map(async (stock) => {
      const items = await StockHistory.findAll({
        where: { stock_id: stock.stock_id }
      });

      return {
        id: `STK-${stock.stock_id}`,
        mode: 'stock-batch',
        stockNumber: `STK-${stock.stock_id}`,
        stock_id: stock.stock_id,
        supplierId: stock.supplier_id,
        supplierName: supplierMap[stock.supplier_id] || 'Unknown Supplier',
        stockPrice: stock.total_amount,
        totalAmount: Number(stock.total_amount || 0),
        paidAmount:  Number(stock.paid_amount  || 0),
        dueAmount:   Number(stock.due_amount   || 0),
        billNo: stock.bill_no || '',
        builtyNo: stock.builty_no || '',
        creationDate: stock.creation_day,
        createdBy: stock.created_by,
        createdAt: stock.created_at,
        items: items.map(item => ({
          id: `stk-line-${item.batch_id}`,
          batchNumber: item.batch_number,
          productId: item.product_id,
          name: item.product_title,
          bale: item.product_bale,
          baleSize: item.product_bale_size,
          qty: item.product_quantity,
          bonus: item.product_bonus || 0,
          totalQty: item.initial_quantity,
          purchasePrice: item.product_price,
          salePrice: item.sale_price,
          salesTax: item.sales_tax,
          advanceTax: item.advance_tax,
          discount: item.product_discount,
          totalPrice: item.total_price,
          productExpiry: item.expiry_date,
          batchStatus: item.batch_status,
          remainingQty: item.remaining_quantity
        }))
      };
    }));

    res.json({
      success: true,
      data: stock_history
    });
  } catch (error) {
    console.error('List stock stock_history error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch stock stock_history',
      error: error.message 
    });
  }
};

// Get single stock batch with details
exports.getStockBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const stockId = id.replace('STK-', '');

    const stock = await Stock.findByPk(stockId);
    if (!stock) {
      return res.status(404).json({ 
        success: false, 
        message: 'Stock batch not found' 
      });
    }

    const items = await StockHistory.findAll({
      where: { stock_id: stockId }
    });

    // Fetch supplier name
    const supplierQuery = await sequelize.query(
      'SELECT supplier_name FROM supplier_info WHERE supplier_id = ?',
      { 
        replacements: [stock.supplier_id],
        type: sequelize.QueryTypes.SELECT 
      }
    );

    res.json({
      success: true,
      data: {
        id: `STK-${stock.stock_id}`,
        stockNumber: `STK-${stock.stock_id}`,
        stock_id: stock.stock_id,
        supplierId: stock.supplier_id,
        supplierName: supplierQuery[0]?.supplier_name || 'Unknown Supplier',
        stockPrice: stock.total_amount,
        billNo: stock.bill_no,
        builtyNo: stock.builty_no,
        creationDate: stock.creation_day,
        createdBy: stock.created_by,
        createdAt: stock.created_at,
        items: items.map(item => ({
          id: `stk-line-${item.batch_id}`,
          batchNumber: item.batch_number,
          productId: item.product_id,
          name: item.product_title,
          bale: item.product_bale,
          baleSize: item.product_bale_size,
          qty: item.product_quantity,
          bonus: item.product_bonus || 0,
          totalQty: item.initial_quantity,
          purchasePrice: item.product_price,
          salePrice: item.sale_price,
          salesTax: item.sales_tax,
          advanceTax: item.advance_tax,
          discount: item.product_discount,
          totalPrice: item.total_price,
          productExpiry: item.expiry_date,
          batchStatus: item.batch_status,
          remainingQty: item.remaining_quantity
        }))
      }
    });
  } catch (error) {
    console.error('Get stock batch error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch stock batch',
      error: error.message 
    });
  }
};

// Create Stock Opening Entry
exports.createStockOpening = async (req, res) => {
  try {
    const {
      productId,
      productName,
      quantity,
      price,
      batchNumber,
      expiryDate,
      adjustmentType = 'opening',
      notes,
      user
    } = req.body;

    const totalPrice = Number(quantity || 0) * Number(price || 0);

    const opening = await StockHistoryOpen.create({
      product_id: productId,
      product_title: productName,
      product_quantity: quantity,
      product_price: price,
      total_price: totalPrice,
      batch_number: batchNumber,
      expiry_date: expiryDate,
      creation_day: new Date(),
      adjustment_type: adjustmentType,
      notes: notes || '',
      user: user || 'System',
      status: 1
    });

    res.status(201).json({
      success: true,
      message: 'Stock opening created successfully',
      data: {
        id: `OPEN-${opening.open_id}`,
        productId: opening.product_id,
        productName: opening.product_title,
        quantity: opening.product_quantity,
        price: opening.product_price,
        totalPrice: opening.total_price,
        batchNumber: opening.batch_number,
        expiryDate: opening.expiry_date,
        adjustmentType: opening.adjustment_type,
        notes: opening.notes,
        user: opening.user,
        createdAt: opening.created_at
      }
    });
  } catch (error) {
    console.error('Create stock opening error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create stock opening',
      error: error.message 
    });
  }
};

// List stock openings
exports.listStockOpenings = async (req, res) => {
  try {
    const openings = await StockHistoryOpen.findAll({
      order: [['created_at', 'DESC']]
    });

    const data = openings.map(opening => ({
      id: `OPEN-${opening.open_id}`,
      mode: 'stock-opening',
      productId: opening.product_id,
      productName: opening.product_title,
      quantity: opening.product_quantity,
      price: opening.product_price,
      totalPrice: opening.total_price,
      batchNumber: opening.batch_number,
      expiryDate: opening.expiry_date,
      adjustmentType: opening.adjustment_type,
      notes: opening.notes,
      user: opening.user,
      createdAt: opening.created_at
    }));

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('List stock openings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch stock openings',
      error: error.message 
    });
  }
};

// Create Stock Return
exports.createStockReturn = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const {
      stockId,
      supplierId,
      supplierName,
      returnType = 'normal',
      description,
      createdBy,
      items = []
    } = req.body;

    if (!supplierId || !items || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Supplier and at least one item are required' 
      });
    }

    const totalAmount = items.reduce((sum, item) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      return sum + (qty * price);
    }, 0);

    const stockReturn = await StockReturn.create({
      stock_id: stockId ? stockId.replace('STK-', '') : null,
      supplier_id: supplierId,
      total_amount: totalAmount,
      return_type: returnType,
      description: description || '',
      creation_day: new Date(),
      created_by: createdBy || 'System',
      status: 1
    }, { transaction });

    // Process each return item and update batch quantities
    for (const item of items) {
      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);

      // Create return record
      await StockReturnReport.create({
        return_id: stockReturn.return_id,
        product_id: item.productId,
        product_title: item.name,
        product_quantity: qty,
        product_price: price,
        total_price: qty * price,
        expiry_date: item.expiry,
        status: 1
      }, { transaction });

      // ── Reduce batch quantity + create stock ledger entry ──────────
      // Strategy:
      //   1. If batchLineId provided → use that exact batch (format: "stk-line-{batch_id}")
      //   2. If batchLineId missing OR batch not found → FIFO fallback using productId
      //      (same FEFO ordering as createOrder: oldest expiry first)
      let batchDeducted = false;

      if (item.batchLineId) {
        const batchIdMatch = item.batchLineId.match(/stk-line-(\d+)/);
        const batchId = batchIdMatch ? parseInt(batchIdMatch[1]) : null;

        if (batchId) {
          const batch = await StockHistory.findByPk(batchId, { transaction });
          if (batch) {
            const newQuantity = Math.max(Number(batch.remaining_quantity) - qty, 0);

            await batch.update({
              remaining_quantity: newQuantity,
              batch_status: newQuantity <= 0 ? 'FINISHED' : batch.batch_status
            }, { transaction });

            await StockReport.createEntry({
              batch_id:         batch.batch_id,
              product_id:       item.productId,
              transaction_type: 'RETURN',
              quantity_change:  -qty,
              balance_after:    newQuantity,
              reference_type:   'STOCK_RETURN',
              reference_id:     stockReturn.return_id,
              reference_number: `SRET-${stockReturn.return_id}`,
              unit_price:       price,
              total_value:      qty * price,
              notes: `Returned to supplier: ${description || 'Stock return'}`,
              performed_by:     createdBy || 'System',
              transaction_date: new Date()
            }, transaction);

            batchDeducted = true;
          }
        }
      }

      // Fallback: batchLineId missing or batch not found → FIFO from productId
      if (!batchDeducted && item.productId) {
        const batchRows = await sequelize.query(
          `SELECT batch_id, batch_number, remaining_quantity
           FROM stock_history
           WHERE product_id = :pid
             AND remaining_quantity > 0
             AND status = 1
           ORDER BY expiry_date ASC NULLS LAST, batch_id ASC`,
          { replacements: { pid: item.productId },
            type: sequelize.QueryTypes.SELECT, transaction }
        );

        let toDeduct = qty;
        for (const batch of batchRows) {
          if (toDeduct <= 0) break;
          const take    = Math.min(toDeduct, Number(batch.remaining_quantity));
          const newQty  = Number(batch.remaining_quantity) - take;

          await sequelize.query(
            `UPDATE stock_history
             SET remaining_quantity = :nq,
                 batch_status       = CASE WHEN :nq <= 0 THEN 'FINISHED' ELSE batch_status END,
                 updated_at         = NOW()
             WHERE batch_id = :bid`,
            { replacements: { nq: newQty, bid: batch.batch_id },
              type: sequelize.QueryTypes.UPDATE, transaction }
          );

          await StockReport.createEntry({
            batch_id:         batch.batch_id,
            product_id:       item.productId,
            transaction_type: 'RETURN',
            quantity_change:  -take,
            balance_after:    newQty,
            reference_type:   'STOCK_RETURN',
            reference_id:     stockReturn.return_id,
            reference_number: `SRET-${stockReturn.return_id}`,
            unit_price:       price,
            total_value:      take * price,
            notes: `Returned to supplier (FIFO fallback): ${description || 'Stock return'}`,
            performed_by:     createdBy || 'System',
            transaction_date: new Date()
          }, transaction);

          toDeduct -= take;
        }
      }
    }

    // ── Supplier accounts + ledger update on stock return ────────────
    if (supplierId && supplierId !== 0) {
      let [account] = await sequelize.query(
        `SELECT supplier_account_id, current_balance, total_debit, total_credit, total_return FROM supplier_accounts WHERE supplier_id = :sid AND status = 1 LIMIT 1`,
        { replacements: { sid: supplierId }, type: sequelize.QueryTypes.SELECT, transaction }
      );

      // Auto-create account if it doesn't exist yet
      if (!account) {
        const [newAcc] = await sequelize.query(
          `INSERT INTO supplier_accounts (supplier_id, current_balance, total_debit, total_credit, total_return, opening_balance, account_status, status, creation_day, created_at, updated_at)
           VALUES (:sid, 0, 0, 0, 0, 0, 'active', 1, CURRENT_DATE, NOW(), NOW()) RETURNING supplier_account_id, current_balance, total_debit, total_credit, total_return`,
          { replacements: { sid: supplierId }, type: sequelize.QueryTypes.INSERT, transaction }
        );
        account = newAcc[0];
      }

      if (account) {
        // Return logic:
        // total_debit  → stays SAME (stock received value doesn't change)
        // total_credit → stays SAME (cash payments don't change)
        // total_return → increases (value of goods returned)
        // current_balance = total_debit - total_credit - total_return
        const newReturn  = Number(account.total_return || 0) + totalAmount;
        const newBalance = Number(account.total_debit  || 0)
                         - Number(account.total_credit || 0)
                         - newReturn;

        await sequelize.query(
          `UPDATE supplier_accounts SET total_return=:ret, current_balance=:bal, updated_at=NOW() WHERE supplier_id=:sid AND status=1`,
          { replacements: { ret: newReturn, bal: newBalance, sid: supplierId }, type: sequelize.QueryTypes.UPDATE, transaction }
        );

        let runningBalance = newBalance;
        for (const item of items) {
          const qty = Number(item.quantity || 0);
          const price = Number(item.price || 0);
          const itemTotal = qty * price;
          await sequelize.query(
            `INSERT INTO supplier_ledger
              (supplier_id, supplier_account_id, transaction_type, account_type, payment_type,
               stock_id, product_id, product_title, product_quantity, product_price, total_price,
               amount_paid, debit_amount, credit_amount, balance,
               description, reference_type, reference_number,
               performed_by, status, time_created, creation_day, updated_at)
             VALUES
              (:sid, :accId, 'stock_return', 2, 0,
               :stockId, :productId, :productTitle, :qty, :price, :total,
               0, 0, :total, :balance,
               :desc, 'STOCK_RETURN', :ref, :by, 1, NOW(), CURRENT_DATE, NOW())`,
            {
              replacements: {
                sid: supplierId, accId: account.supplier_account_id,
                stockId: stockId ? stockId.replace('STK-', '') : null,
                productId: item.productId || null, productTitle: item.name || '',
                qty, price, total: itemTotal, balance: runningBalance,
                desc: description || `Stock returned — ${item.name}`,
                ref: `SRET-${stockReturn.return_id}`, by: createdBy || 'pharmacist'
              },
              type: sequelize.QueryTypes.INSERT, transaction
            }
          );
        }

        if (stockId) {
          // stock.total_amount stays unchanged — bill amount doesn't change on return
          // Return creates a credit — no change to the original bill total or paid_amount
          // Only update if there's still outstanding due amount
          const numericStockId = parseInt(stockId.toString().replace('STK-', ''));
          await sequelize.query(
            `UPDATE stock SET due_amount = GREATEST(due_amount - ${totalAmount}, 0), updated_at = NOW() WHERE stock_id = ${numericStockId}`,
            { type: sequelize.QueryTypes.UPDATE, transaction }
          );
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Stock return created successfully. StockHistory quantities updated.',
      data: {
        id: `SRET-${stockReturn.return_id}`,
        returnNumber: `SRET-${stockReturn.return_id}`,
        stockId: stockId,
        supplierId: stockReturn.supplier_id,
        supplierName,
        returnType: stockReturn.return_type,
        returnTotal: stockReturn.total_amount,
        description: stockReturn.description,
        createdBy: stockReturn.created_by,
        createdAt: stockReturn.created_at
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Create stock return error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create stock return',
      error: error.message 
    });
  }
};

// List stock returns
exports.listStockReturns = async (req, res) => {
  try {
    const returns = await StockReturn.findAll({
      order: [['created_at', 'DESC']]
    });

    // Fetch supplier names
    const supplierQuery = await sequelize.query(
      'SELECT supplier_id, supplier_name FROM supplier_info',
      { type: sequelize.QueryTypes.SELECT }
    );
    const supplierMap = {};
    supplierQuery.forEach(s => {
      supplierMap[s.supplier_id] = s.supplier_name;
    });

    const data = await Promise.all(returns.map(async (ret) => {
      const items = await StockReturnReport.findAll({
        where: { return_id: ret.return_id }
      });

      return {
        id: `SRET-${ret.return_id}`,
        mode: 'stock-return',
        returnNumber: `SRET-${ret.return_id}`,
        stockId: ret.stock_id ? `STK-${ret.stock_id}` : null,
        stockNumber: ret.stock_id ? `STK-${ret.stock_id}` : null,
        supplierId: ret.supplier_id,
        supplierName: supplierMap[ret.supplier_id] || 'Unknown Supplier',
        returnType: ret.return_type,
        returnTotal: ret.total_amount,
        description: ret.description,
        createdBy: ret.created_by,
        createdAt: ret.created_at,
        items: items.map(item => ({
          id: `sret-line-${item.report_id}`,
          productId: item.product_id,
          name: item.product_title,
          quantity: item.product_quantity,
          price: item.product_price,
          totalPrice: item.total_price,
          expiry: item.expiry_date
        }))
      };
    }));

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('List stock returns error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch stock returns',
      error: error.message 
    });
  }
};

// Update Stock StockHistory
exports.updateStockBatch = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const stockId = id.replace('STK-', '');
    
    const {
      supplierId,
      stockPrice,
      billNo,
      builtyNo,
      creationDate,
      items = []
    } = req.body;

    // Find existing stock
    const stock = await Stock.findByPk(stockId, { transaction });
    if (!stock) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Stock batch not found' 
      });
    }

    // Validate items
    if (!items || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'At least one item is required' 
      });
    }

    // Check for duplicate products
    const productIds = items.map(item => item.productId);
    const uniqueProductIds = [...new Set(productIds)];
    
    if (productIds.length !== uniqueProductIds.length) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot add the same product multiple times in one batch' 
      });
    }

    // Calculate new total
    const totalAmount = items.reduce((sum, item) => {
      const qty = Number(item.qty || 0);
      const price = Number(item.purchasePrice || 0);
      const salesTax = Number(item.salesTax || 0);
      const advanceTax = Number(item.advanceTax || 0);
      const discount = Number(item.discount || 0);
      return sum + Math.max((qty * price) + salesTax + advanceTax - discount, 0);
    }, 0);

    // Update stock header
    await stock.update({
      supplier_id: supplierId || stock.supplier_id,
      total_amount: stockPrice || totalAmount,
      bill_no: billNo !== undefined ? billNo : stock.bill_no,
      builty_no: builtyNo !== undefined ? builtyNo : stock.builty_no,
      creation_day: creationDate || stock.creation_day
    }, { transaction });

    // Delete existing batch items
    await StockHistory.destroy({
      where: { stock_id: stockId },
      transaction
    });

    // Create new batch items
    for (const item of items) {
      const qty = Number(item.qty || 0);
      const bonus = Number(item.bonus || 0);
      const totalQty = qty + bonus;
      const purchasePrice = Number(item.purchasePrice || 0);
      const salesTax = Number(item.salesTax || 0);
      const advanceTax = Number(item.advanceTax || 0);
      const discount = Number(item.discount || 0);
      const totalPrice = Math.max((qty * purchasePrice) + salesTax + advanceTax - discount, 0);

      const bale = item.bale !== null && item.bale !== undefined && item.bale !== '' 
        ? Number(item.bale) 
        : null;
      const baleSize = item.baleSize !== null && item.baleSize !== undefined && item.baleSize !== '' 
        ? Number(item.baleSize) 
        : null;

      await StockHistory.create({
        stock_id: stockId,
        product_id: item.productId || null,
        product_title: item.name || '',
        product_bale: bale,
        product_bale_size: baleSize,
        product_quantity: qty,
        product_bonus: bonus,
        initial_quantity: totalQty,
        remaining_quantity: totalQty,
        product_price: purchasePrice,
        sale_price: Number(item.salePrice || 0),
        sales_tax: salesTax,
        advance_tax: advanceTax,
        product_discount: discount,
        total_price: totalPrice,
        batch_number: item.batchNumber || '',
        expiry_date: item.productExpiry || null,
        batch_status: 'ACTIVE',
        creation_day: creationDate || new Date(),
        status: 1
      }, { transaction });
    }

    await transaction.commit();

    res.json({
      success: true,
      message: 'Stock batch updated successfully',
      data: {
        stock_id: stock.stock_id,
        stockNumber: `STK-${stock.stock_id}`
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Update stock batch error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update stock batch',
      error: error.message 
    });
  }
};

// Delete Stock StockHistory
exports.deleteStockBatch = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const stockId = id.replace('STK-', '');

    // Find stock
    const stock = await Stock.findByPk(stockId, { transaction });
    if (!stock) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Stock batch not found' 
      });
    }

    // Delete batch items first (foreign key constraint)
    await StockHistory.destroy({
      where: { stock_id: stockId },
      transaction
    });

    // Delete stock batch
    await stock.destroy({ transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Stock batch deleted successfully'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Delete stock batch error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete stock batch',
      error: error.message 
    });
  }
};


// Get Low Stock Alerts
exports.getLowStockAlerts = async (req, res) => {
  try {
    const products = await sequelize.query(
      `SELECT p.product_id, p.product_title, p.product_price,
              pcs.available_stock, p.product_min_threshold,
              p.product_supplier, s.supplier_name,
              pcs.nearest_expiry, pcs.active_batch_count
       FROM product p
       LEFT JOIN (
         SELECT product_id,
           SUM(CASE WHEN expiry_date >= CURRENT_DATE AND remaining_quantity > 0 THEN remaining_quantity ELSE 0 END) as available_stock,
           MIN(CASE WHEN expiry_date >= CURRENT_DATE AND remaining_quantity > 0 THEN expiry_date END) as nearest_expiry,
           COUNT(CASE WHEN expiry_date >= CURRENT_DATE AND remaining_quantity > 0 THEN 1 END) as active_batch_count
         FROM stock_history WHERE status = 1 GROUP BY product_id
       ) pcs ON p.product_id = pcs.product_id
       LEFT JOIN supplier_info s ON p.product_supplier = s.supplier_id
       WHERE p.product_status = 1 AND pcs.available_stock > 0 AND pcs.available_stock <= p.product_min_threshold
       ORDER BY pcs.available_stock ASC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const outOfStock = await sequelize.query(
      `SELECT p.product_id, p.product_title, p.product_price,
              COALESCE(pcs.available_stock, 0) as available_stock,
              p.product_min_threshold, p.product_supplier, s.supplier_name
       FROM product p
       LEFT JOIN (
         SELECT product_id,
           SUM(CASE WHEN expiry_date >= CURRENT_DATE AND remaining_quantity > 0 THEN remaining_quantity ELSE 0 END) as available_stock
         FROM stock_history WHERE status = 1 GROUP BY product_id
       ) pcs ON p.product_id = pcs.product_id
       LEFT JOIN supplier_info s ON p.product_supplier = s.supplier_id
       WHERE p.product_status = 1 AND COALESCE(pcs.available_stock, 0) = 0
       ORDER BY p.product_title ASC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    res.json({
      success: true,
      data: {
        lowStock: products.map(p => ({
          id: p.product_id,
          title: p.product_title,
          price: p.product_price,
          currentQty: p.available_stock,
          minThreshold: p.product_min_threshold,
          supplierId: p.product_supplier,
          supplierName: p.supplier_name || 'Unknown',
          nearestExpiry: p.nearest_expiry,
          batchCount: p.active_batch_count,
          alertLevel: 'low'
        })),
        outOfStock: outOfStock.map(p => ({
          id: p.product_id,
          title: p.product_title,
          price: p.product_price,
          currentQty: 0,
          minThreshold: p.product_min_threshold,
          supplierId: p.product_supplier,
          supplierName: p.supplier_name || 'Unknown',
          alertLevel: 'out'
        }))
      }
    });
  } catch (error) {
    console.error('Get low stock alerts error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch low stock alerts',
      error: error.message 
    });
  }
};

// Get Expiry Alerts
exports.getExpiryAlerts = async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    // Expiring soon — direct SQL (no association needed)
    const expiringBatches = await sequelize.query(
      `SELECT b.batch_id, b.batch_number, b.product_id, p.product_title,
              b.remaining_quantity, b.product_price, b.expiry_date,
              EXTRACT(DAY FROM (b.expiry_date::timestamp - NOW())) as days_left
       FROM stock_history b
       JOIN product p ON b.product_id = p.product_id
       WHERE b.expiry_date IS NOT NULL
         AND b.expiry_date > CURRENT_DATE
         AND b.expiry_date <= :thirtyDays
         AND b.remaining_quantity > 0
         AND b.status = 1
       ORDER BY b.expiry_date ASC`,
      {
        replacements: { thirtyDays: thirtyDaysFromNow.toISOString().split('T')[0] },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const expiredBatches = await sequelize.query(
      `SELECT b.batch_id, b.batch_number, b.product_id, p.product_title,
              b.remaining_quantity, b.product_price, b.expiry_date
       FROM stock_history b
       JOIN product p ON b.product_id = p.product_id
       WHERE b.expiry_date IS NOT NULL
         AND b.expiry_date <= CURRENT_DATE
         AND b.remaining_quantity > 0
         AND b.status = 1
       ORDER BY b.expiry_date DESC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    res.json({
      success: true,
      data: {
        expiringSoon: expiringBatches.map(b => ({
          id:             b.batch_id,
          batchNumber:    b.batch_number,
          productTitle:   b.product_title,
          expiryDate:     b.expiry_date,
          quantity:       b.remaining_quantity,
          price:          b.product_price,
          alertLevel:     'warning',
          daysUntilExpiry: Math.ceil(Number(b.days_left))
        })),
        expired: expiredBatches.map(b => ({
          id:             b.batch_id,
          batchNumber:    b.batch_number,
          productTitle:   b.product_title,
          expiryDate:     b.expiry_date,
          quantity:       b.remaining_quantity,
          price:          b.product_price,
          alertLevel:     'critical',
          daysUntilExpiry: Math.ceil((new Date(b.expiry_date) - today) / (1000 * 60 * 60 * 24))
        }))
      }
    });
  } catch (error) {
    console.error('Get expiry alerts error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch expiry alerts',
      error: error.message 
    });
  }
};

// Get StockHistory-wise Stock Report
exports.getBatchWiseReport = async (req, res) => {
  try {
    const { productId, supplierId, expiryFrom, expiryTo } = req.query;

    let whereConditions = [];
    let replacements = {};

    if (productId) {
      whereConditions.push('b.product_id = :productId');
      replacements.productId = productId;
    }
    if (supplierId) {
      whereConditions.push('s.supplier_id = :supplierId');
      replacements.supplierId = supplierId;
    }
    if (expiryFrom) {
      whereConditions.push('b.expiry_date >= :expiryFrom');
      replacements.expiryFrom = expiryFrom;
    }
    if (expiryTo) {
      whereConditions.push('b.expiry_date <= :expiryTo');
      replacements.expiryTo = expiryTo;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const stock_history = await sequelize.query(
      `SELECT b.batch_id, b.batch_number, b.product_title, b.product_id,
              b.initial_quantity, b.remaining_quantity, b.product_price, b.sale_price,
              b.expiry_date, b.creation_day, b.batch_status,
              b.stock_id, s.bill_no, si.supplier_id, si.supplier_name
       FROM stock_history b
       LEFT JOIN stock s ON b.stock_id = s.stock_id
       LEFT JOIN supplier_info si ON s.supplier_id = si.supplier_id
       ${whereClause}
       ORDER BY b.creation_day DESC, b.batch_id DESC`,
      { 
        replacements,
        type: sequelize.QueryTypes.SELECT 
      }
    );

    const today = new Date();
    
    res.json({
      success: true,
      data: stock_history.map(b => {
        const initialQty = Number(b.initial_quantity || 0);
        const remainingQty = Number(b.remaining_quantity || 0);
        const qtySold = initialQty - remainingQty;
        
        let status = 'active';
        if (b.batch_status === 'EXPIRED' || (b.expiry_date && new Date(b.expiry_date) <= today)) {
          status = 'expired';
        } else if (b.batch_status === 'FINISHED' || remainingQty === 0) {
          status = 'sold_out';
        } else if (b.expiry_date) {
          const daysUntilExpiry = Math.ceil((new Date(b.expiry_date) - today) / (1000 * 60 * 60 * 24));
          if (daysUntilExpiry <= 30) {
            status = 'expiring_soon';
          }
        }

        return {
          id: b.batch_id,
          batch_id: b.batch_id,
          stockNumber: `STK-${b.stock_id}`,
          billNumber: b.bill_no || '-',
          batch_number: b.batch_number,
          product_id: b.product_id,
          productTitle: b.product_title,
          supplierId: b.supplier_id,
          supplierName: b.supplier_name || 'Unknown',
          initial_quantity: initialQty,
          remaining_quantity: remainingQty,
          qtySold,
          product_price: b.product_price,
          sale_price: b.sale_price,
          expiry_date: b.expiry_date,
          receivedDate: b.creation_day,
          batch_status: b.batch_status,
          status
        };
      })
    });
  } catch (error) {
    console.error('Get batch-wise report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch batch-wise report',
      error: error.message 
    });
  }
};

// Get Profit & Loss Report — uses invoice + invoice_report + stock_history
exports.getProfitLossReport = async (req, res) => {
  try {
    const { startDate, endDate, productId, supplierId } = req.query;

    let dateWhere = '';
    const replacements = {};

    if (startDate) { dateWhere += ' AND DATE(i.invoice_date) >= :startDate'; replacements.startDate = startDate; }
    if (endDate)   { dateWhere += ' AND DATE(i.invoice_date) <= :endDate';   replacements.endDate   = endDate;   }
    if (productId) { dateWhere += ' AND ii.product_id = :productId::uuid';   replacements.productId = productId; }

    // Join invoice_report with stock_history via batch_number to get purchase price
    const rows = await sequelize.query(
      `SELECT
         ii.product_id,
         ii.product_title,
         ii.quantity,
         ii.unit_price                         AS sale_price,
         COALESCE(b.product_price, 0)          AS purchase_price,
         ii.quantity * ii.unit_price           AS revenue,
         ii.quantity * COALESCE(b.product_price, 0) AS cost,
         ii.quantity * (ii.unit_price - COALESCE(b.product_price, 0)) AS profit,
         i.invoice_date
       FROM invoice_report ii
       JOIN invoice i  ON ii.invoice_id = i.invoice_id
       LEFT JOIN stock_history b ON b.batch_number = ii.batch_number
       WHERE i.status = 1 AND ii.status = 1
         AND i.payment_status IN ('paid')
         ${dateWhere}
       ORDER BY i.invoice_date ASC`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    // Supplier filter (via product → supplier)
    let filteredRows = rows;
    if (supplierId) {
      const supProds = await sequelize.query(
        `SELECT product_id FROM product WHERE product_supplier = :supplierId`,
        { replacements: { supplierId }, type: sequelize.QueryTypes.SELECT }
      );
      const supProdIds = new Set(supProds.map(p => p.product_id));
      filteredRows = rows.filter(r => supProdIds.has(r.product_id));
    }

    const totalRevenue = filteredRows.reduce((s, r) => s + Number(r.revenue), 0);
    const totalCost    = filteredRows.reduce((s, r) => s + Number(r.cost),    0);
    const totalProfit  = filteredRows.reduce((s, r) => s + Number(r.profit),  0);
    const totalQty     = filteredRows.reduce((s, r) => s + Number(r.quantity), 0);

    // Group by product
    const byProduct = {};
    for (const r of filteredRows) {
      if (!byProduct[r.product_id]) {
        byProduct[r.product_id] = {
          productId:     r.product_id,
          productTitle:  r.product_title,
          qtySold:       0,
          totalRevenue:  0,
          totalCost:     0,
          totalProfit:   0,
          profitMargin:  '0%'
        };
      }
      byProduct[r.product_id].qtySold      += Number(r.quantity);
      byProduct[r.product_id].totalRevenue += Number(r.revenue);
      byProduct[r.product_id].totalCost    += Number(r.cost);
      byProduct[r.product_id].totalProfit  += Number(r.profit);
    }
    Object.values(byProduct).forEach(p => {
      p.profitMargin = p.totalRevenue > 0
        ? ((p.totalProfit / p.totalRevenue) * 100).toFixed(2) + '%'
        : '0%';
      p.totalRevenue = Number(p.totalRevenue.toFixed(2));
      p.totalCost    = Number(p.totalCost.toFixed(2));
      p.totalProfit  = Number(p.totalProfit.toFixed(2));
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalRevenue:     Number(totalRevenue.toFixed(2)),
          totalCost:        Number(totalCost.toFixed(2)),
          totalProfit:      Number(totalProfit.toFixed(2)),
          grossProfit:      Number(totalProfit.toFixed(2)),
          profitMargin:     totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) + '%' : '0%',
          totalQtySold:     totalQty,
          invoicesIncluded: new Set(filteredRows.map(r => r.product_id)).size,
          costingMethod:    'Purchase price from batch (FIFO allocated)'
        },
        byProduct: Object.values(byProduct).sort((a, b) => b.totalProfit - a.totalProfit)
      }
    });

  } catch (error) {
    console.error('Get profit & loss report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profit & loss report',
      error: error.message
    });
  }
};

// Get Dashboard Alerts Summary
exports.getDashboardAlerts = async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    // Low stock count - direct stock_history subquery
    const lowStockCount = await sequelize.query(
      `SELECT COUNT(*) as count
       FROM product p
       INNER JOIN (
         SELECT product_id,
           SUM(CASE WHEN expiry_date >= CURRENT_DATE AND remaining_quantity > 0 THEN remaining_quantity ELSE 0 END) as available_stock
         FROM stock_history WHERE status = 1 GROUP BY product_id
       ) pcs ON p.product_id = pcs.product_id
       WHERE pcs.available_stock > 0 AND pcs.available_stock <= p.product_min_threshold`,
      { type: sequelize.QueryTypes.SELECT }
    );

    // Out of stock count - direct stock_history subquery
    const outOfStockCount = await sequelize.query(
      `SELECT COUNT(*) as count
       FROM product p
       LEFT JOIN (
         SELECT product_id,
           SUM(CASE WHEN expiry_date >= CURRENT_DATE AND remaining_quantity > 0 THEN remaining_quantity ELSE 0 END) as available_stock
         FROM stock_history WHERE status = 1 GROUP BY product_id
       ) pcs ON p.product_id = pcs.product_id
       WHERE COALESCE(pcs.available_stock, 0) = 0 AND p.product_status = 1`,
      { type: sequelize.QueryTypes.SELECT }
    );

    // Expiring soon count - Using stock_history table
    const expiringSoonCount = await sequelize.query(
      `SELECT COUNT(*) as count 
       FROM stock_history 
       WHERE expiry_date IS NOT NULL 
         AND expiry_date > CURRENT_DATE 
         AND expiry_date <= :thirtyDays
         AND batch_status = 'ACTIVE'
         AND remaining_quantity > 0`,
      { 
        replacements: { thirtyDays: thirtyDaysFromNow.toISOString().split('T')[0] },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    // Expired count - Using stock_history table
    const expiredCount = await sequelize.query(
      `SELECT COUNT(*) as count 
       FROM stock_history 
       WHERE expiry_date IS NOT NULL 
         AND expiry_date <= CURRENT_DATE
         AND remaining_quantity > 0`,
      { type: sequelize.QueryTypes.SELECT }
    );

    res.json({
      success: true,
      data: {
        lowStock: Number(lowStockCount[0]?.count || 0),
        outOfStock: Number(outOfStockCount[0]?.count || 0),
        expiringSoon: Number(expiringSoonCount[0]?.count || 0),
        expired: Number(expiredCount[0]?.count || 0),
        totalAlerts: Number(lowStockCount[0]?.count || 0) + 
                     Number(outOfStockCount[0]?.count || 0) + 
                     Number(expiringSoonCount[0]?.count || 0) + 
                     Number(expiredCount[0]?.count || 0)
      }
    });
  } catch (error) {
    console.error('Get dashboard alerts error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard alerts',
      error: error.message 
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STOCK REPORT — stock_report full list (PDF: stock_report)
// Shows every PURCHASE/SALE/RETURN transaction per batch
// ─────────────────────────────────────────────────────────────────────────────
exports.getStockReport = async (req, res) => {
  try {
    const { limit = 300, search = '', transactionType, fromDate, toDate } = req.query;

    let where = '1=1';
    const replacements = {};

    if (transactionType && transactionType !== 'all') {
      where += ' AND sl.transaction_type = :txType';
      replacements.txType = transactionType.toUpperCase();
    }
    if (fromDate) { where += ' AND sl.transaction_date::date >= :fromDate'; replacements.fromDate = fromDate; }
    if (toDate)   { where += ' AND sl.transaction_date::date <= :toDate';   replacements.toDate   = toDate;   }
    if (search.trim()) {
      where += ` AND (p.product_title ILIKE :search OR sl.reference_number ILIKE :search)`;
      replacements.search = `%${search.trim()}%`;
    }

    const rows = await sequelize.query(`
      SELECT
        sl.ledger_id,
        sl.batch_id,
        sl.product_id,
        p.product_title,
        b.batch_number,
        sl.transaction_type,
        sl.quantity_change,
        sl.balance_after,
        sl.unit_price        AS product_price,
        sl.total_value       AS total_price,
        sl.sales_tax,
        sl.advance_tax,
        sl.product_expiry,
        sl.reference_type,
        sl.reference_number,
        sl.notes,
        sl.performed_by,
        sl.transaction_date  AS creation_day,
        b.expiry_date,
        si.supplier_name
      FROM stock_report sl
      LEFT JOIN stock_history b      ON b.batch_id = sl.batch_id
      LEFT JOIN product p      ON p.product_id = sl.product_id::uuid
      LEFT JOIN stock s        ON s.stock_id = b.stock_id
      LEFT JOIN supplier_info si ON si.supplier_id = s.supplier_id
      WHERE ${where}
      ORDER BY sl.transaction_date DESC, sl.ledger_id DESC
      LIMIT :lim
    `, { replacements: { ...replacements, lim: parseInt(limit) }, type: sequelize.QueryTypes.SELECT });

    res.json({
      success: true,
      data: rows.map(r => ({
        id:              r.ledger_id,
        batchId:         r.batch_id,
        productId:       r.product_id,
        productTitle:    r.product_title   || 'Unknown',
        batchNumber:     r.batch_number    || '-',
        transactionType: r.transaction_type,
        quantityChange:  Number(r.quantity_change || 0),
        balanceAfter:    Number(r.balance_after   || 0),
        productPrice:    Number(r.product_price   || 0),
        totalPrice:      Number(r.total_price     || 0),
        salesTax:        Number(r.sales_tax       || 0),
        advanceTax:      Number(r.advance_tax     || 0),
        productExpiry:   r.product_expiry || r.expiry_date || '-',
        referenceType:   r.reference_type,
        referenceNumber: r.reference_number,
        notes:           r.notes,
        performedBy:     r.performed_by,
        creationDay:     r.creation_day,
        supplierName:    r.supplier_name  || '-'
      }))
    });
  } catch (error) {
    console.error('Get stock report error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stock report', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STOCK RETURN REPORT — stock_return_report full list (PDF: stock_return_report)
// Line items per return: product, qty, price, expiry, return_type
// ─────────────────────────────────────────────────────────────────────────────
exports.getStockReturnReport = async (req, res) => {
  try {
    const { limit = 300, search = '', fromDate, toDate } = req.query;

    let where = 'srr.status = 1';
    const replacements = {};

    if (fromDate) { where += ' AND srr.created_at::date >= :fromDate'; replacements.fromDate = fromDate; }
    if (toDate)   { where += ' AND srr.created_at::date <= :toDate';   replacements.toDate   = toDate;   }
    if (search.trim()) {
      where += ` AND (srr.product_title ILIKE :search OR sr.description ILIKE :search)`;
      replacements.search = `%${search.trim()}%`;
    }

    const rows = await sequelize.query(`
      SELECT
        srr.report_id,
        srr.return_id,
        srr.product_id,
        srr.product_title,
        srr.product_quantity,
        srr.product_price,
        srr.total_price,
        srr.expiry_date   AS product_expiry,
        srr.created_at    AS creation_day,
        srr.status,
        sr.description,
        sr.created_by,
        sr.return_type,
        si.supplier_name
      FROM stock_return_report srr
      LEFT JOIN stock_return sr   ON sr.return_id = srr.return_id
      LEFT JOIN product p         ON p.product_id = srr.product_id::uuid
      LEFT JOIN supplier_info si  ON si.supplier_id = sr.supplier_id
      WHERE ${where}
      ORDER BY srr.created_at DESC, srr.report_id DESC
      LIMIT :lim
    `, { replacements: { ...replacements, lim: parseInt(limit) }, type: sequelize.QueryTypes.SELECT });

    res.json({
      success: true,
      data: rows.map(r => ({
        id:              r.report_id,
        returnId:        r.return_id,
        productId:       r.product_id,
        productTitle:    r.product_title    || 'Unknown',
        productQuantity: Number(r.product_quantity || 0),
        productPrice:    Number(r.product_price    || 0),
        totalPrice:      Number(r.total_price      || 0),
        productExpiry:   r.product_expiry   || '-',
        creationDay:     r.creation_day,
        returnType:      r.return_type === 1 ? 'Open Return' : 'Normal',
        description:     r.description     || '-',
        createdBy:       r.created_by      || '-',
        supplierName:    r.supplier_name   || '-'
      }))
    });
  } catch (error) {
    console.error('Get stock return report error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stock return report', error: error.message });
  }
};
