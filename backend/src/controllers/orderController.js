// Order Controller - Invoices and Orders Management

const { sequelize } = require('../config/database');
const { createNotification } = require('./notificationController');
const User = require('../models/User');
const ddiService = require('../services/ddiService');
const funnelService = require('../services/funnelService');

// Get all orders (invoice) with pagination
exports.getAllOrders = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sortBy = 'created_at', 
      sortDir = 'desc',
      status,
      payment_status,
      search,
      customer_id,    // filter by specific customer (storefront use)
      storefront_only // 'true' = only show storefront orders (exclude POS)
    } = req.query;

    // ORDER_SORT_SAFETY_V1
    // Keep dynamic ORDER BY values inside the existing partner-safe contract.
    const validSortColumns = [
      'created_at',
      'invoice_date',
      'invoice_id',
      'total_amount',
      'customer_name'
    ];

    const sortColumn =
      validSortColumns.includes(sortBy)
        ? sortBy
        : 'created_at';

    const sortDirection =
      String(sortDir).toUpperCase() === 'ASC'
        ? 'ASC'
        : 'DESC';

    // ORDER_READ_PRIVACY_V1
    // Verified customer identity overrides caller-supplied ownership filters.
    const authenticatedCustomerId =
      Number(req.customerOrderCustomerId);

    const hasAuthenticatedCustomer =
      Number.isSafeInteger(authenticatedCustomerId) &&
      authenticatedCustomerId > 0;

    const effectiveCustomerId =
      hasAuthenticatedCustomer
        ? authenticatedCustomerId
        : customer_id;

    const effectiveStorefrontOnly =
      hasAuthenticatedCustomer
        ? 'true'
        : storefront_only;

    const offset = (page - 1) * limit;
    
    let whereConditions = ['i.status = 1'];
    let replacements = { limit: parseInt(limit), offset: parseInt(offset) };

    // Filter by specific customer (for storefront My Orders page)
    if (effectiveCustomerId) {
      whereConditions.push('i.customer_id = :customer_id');
      replacements.customer_id = parseInt(effectiveCustomerId);
    }

    // Exclude POS invoices — storefront orders have created_by starting with 'customer-'
    if (effectiveStorefrontOnly === 'true' && effectiveCustomerId) {
      whereConditions.push(`(i.created_by = :createdBy OR i.customer_id = :customer_id2)`);
      replacements.createdBy = `customer-${effectiveCustomerId}`;
      replacements.customer_id2 = parseInt(effectiveCustomerId);
    }

    if (status) {
      whereConditions.push('i.delivery_status = :status');
      replacements.status = status;
    }

    if (payment_status) {
      whereConditions.push('i.payment_status = :payment_status');
      replacements.payment_status = payment_status;
    }

    if (search) {
      whereConditions.push('(i.invoice_number LIKE :search OR i.customer_name LIKE :search)');
      replacements.search = `%${search}%`;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM invoice i
      ${whereClause}
    `;

    const [countResult] = await sequelize.query(countQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const total = parseInt(countResult.total);

    // Get orders with items
    const ordersQuery = `
      SELECT 
        i.invoice_id,
        i.invoice_number,
        i.customer_id,
        i.customer_name,
        i.customer_phone,
        i.customer_email,
        i.total_amount,
        i.discount,
        i.delivery_fee,
        i.paid_amount,
        i.due_amount,
        i.payment_status,
        i.payment_method,
        i.delivery_status,
        i.delivery_address,
        i.notes,
        i.invoice_date,
        i.created_at,
        i.updated_at,
        i.status,
        i.created_by,
        COUNT(ii.item_id) as item_count
      FROM invoice i
      LEFT JOIN invoice_report ii ON i.invoice_id = ii.invoice_id
      ${whereClause}
      GROUP BY i.invoice_id
      ORDER BY i.${sortColumn} ${sortDirection}
      LIMIT :limit OFFSET :offset
    `;

    const orders = await sequelize.query(ordersQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
};

// Get single order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const authenticatedCustomerId =
      Number(req.customerOrderCustomerId);

    const enforceCustomerOwnership =
      Number.isSafeInteger(authenticatedCustomerId) &&
      authenticatedCustomerId > 0;

    // Get order details (customer info is in invoice table directly)
    const orderQuery = `
      SELECT i.*, 
        CASE 
          WHEN i.payment_method = 'card' AND i.card_last_four IS NOT NULL 
          THEN json_build_object(
            'cardHolderName', i.card_holder_name,
            'cardLastFour', i.card_last_four,
            'cardExpiry', i.card_expiry,
            'billingAddress', i.billing_address
          )
          ELSE NULL
        END as card_details
      FROM invoice i
      WHERE i.invoice_id = :id
        ${enforceCustomerOwnership
          ? 'AND i.customer_id = :customer_id'
          : ''}
    `;

    const [order] = await sequelize.query(orderQuery, {
      replacements: enforceCustomerOwnership
        ? {
            id,
            customer_id: authenticatedCustomerId
          }
        : { id },
      type: sequelize.QueryTypes.SELECT
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get order items
    const itemsQuery = `
      SELECT 
        ii.*,
        p.product_description,
        p.product_salt
      FROM invoice_report ii
      LEFT JOIN product p ON ii.product_id = p.product_id
      WHERE ii.invoice_id = :id
      ORDER BY ii.item_id
    `;

    const items = await sequelize.query(itemsQuery, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: {
        ...order,
        items
      }
    });

  } catch (error) {
    console.error('Get order by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
      error: error.message
    });
  }
};

// Get order stats for dashboard
exports.getOrderStats = async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN delivery_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN delivery_status = 'processing' THEN 1 END) as processing,
        COUNT(CASE WHEN delivery_status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN delivery_status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid,
        COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END) as payment_pending,
        SUM(total_amount) as total_revenue,
        SUM(CASE WHEN payment_status = 'paid' THEN paid_amount ELSE 0 END) as total_paid,
        SUM(due_amount) as total_due
      FROM invoice
      WHERE status = 1
    `;

    const [stats] = await sequelize.query(statsQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: {
        total: parseInt(stats.total) || 0,
        pending: parseInt(stats.pending) || 0,
        processing: parseInt(stats.processing) || 0,
        delivered: parseInt(stats.delivered) || 0,
        cancelled: parseInt(stats.cancelled) || 0,
        paid: parseInt(stats.paid) || 0,
        paymentPending: parseInt(stats.payment_pending) || 0,
        totalRevenue: parseFloat(stats.total_revenue) || 0,
        totalPaid: parseFloat(stats.total_paid) || 0,
        totalDue: parseFloat(stats.total_due) || 0
      }
    });

  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order stats',
      error: error.message
    });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { delivery_status, payment_status, notes } = req.body;

    // Fetch current invoice
    const [current] = await sequelize.query(
      `SELECT invoice_id, customer_id, customer_name, invoice_number,
              total_amount, paid_amount, due_amount, payment_status AS cur_pay_status,
              delivery_status AS cur_del_status
       FROM invoice WHERE invoice_id = :id`,
      { replacements: { id }, type: sequelize.QueryTypes.SELECT, transaction }
    );

    if (!current) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    let updateFields = [];
    let replacements = { id };

    if (delivery_status) {
      updateFields.push('delivery_status = :delivery_status');
      replacements.delivery_status = delivery_status;
    }
    if (payment_status) {
      updateFields.push('payment_status = :payment_status');
      replacements.payment_status = payment_status;
    }
    if (notes !== undefined) {
      updateFields.push('notes = :notes');
      replacements.notes = notes;
    }
    updateFields.push('updated_at = NOW()');

    if (updateFields.length === 1) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    const [updated] = await sequelize.query(
      `UPDATE invoice SET ${updateFields.join(', ')} WHERE invoice_id = :id RETURNING *`,
      { replacements, type: sequelize.QueryTypes.UPDATE, transaction }
    );

    // ── When delivered: ensure customer_ledger has a "payment due" entry ──
    // This makes the order appear in Record Payment tab
    if (delivery_status === 'delivered' && current.cur_del_status !== 'delivered' && current.customer_id) {
      const CustomerAccount = require('../models/CustomerAccount');
      const CustomerLedger  = require('../models/CustomerLedger');

      const account = await CustomerAccount.findOne({
        where: { customer_id: current.customer_id, status: 1 }, transaction
      });

      if (account && Number(current.due_amount || 0) > 0) {
        // Only add ledger entry if not already there for this invoice
        const [existing] = await sequelize.query(
          `SELECT ledger_id FROM customer_ledger
           WHERE customer_id = :cid AND reference_id = :invId
             AND transaction_type = 'invoice' AND status = 1 LIMIT 1`,
          { replacements: { cid: current.customer_id, invId: id },
            type: sequelize.QueryTypes.SELECT, transaction }
        );

        if (!existing) {
          const dueAmount = Number(current.due_amount || current.total_amount || 0);
          const newBalance = Number(account.current_balance) + dueAmount;
          await account.update({
            current_balance: newBalance,
            total_debit: Number(account.total_debit) + dueAmount,
            updated_at: new Date()
          }, { transaction });

          await CustomerLedger.create({
            customer_id:      current.customer_id,
            account_id:       account.account_id,
            transaction_date: new Date(),
            transaction_type: 'invoice',
            reference_type:   'ORDER_DELIVERED',
            reference_id:     parseInt(id),
            reference_number: current.invoice_number,
            debit_amount:     dueAmount,
            credit_amount:    0,
            balance:          newBalance,
            payment_method:   'cash',
            description:      `COD payment due — ${current.invoice_number} (delivered)`,
            performed_by:     req.user?.email || 'system',
            status: 1, created_at: new Date(), updated_at: new Date()
          }, { transaction });
        }
      }
    }

    let lifecycleEvent = null;

    const requestedTerminal =
      delivery_status === 'delivered'
        ? 'purchase_completed'
        : delivery_status === 'cancelled'
          ? 'order_cancelled'
          : null;

    const previousWasTerminal = [
      'delivered',
      'cancelled',
      'refunded'
    ].includes(current.cur_del_status);

    if (
      requestedTerminal &&
      !previousWasTerminal
    ) {
      const productRows = await sequelize.query(
        `SELECT DISTINCT product_id
         FROM invoice_report
         WHERE invoice_id = :invoice_id
           AND status = 1
           AND product_id IS NOT NULL
         ORDER BY product_id`,
        {
          replacements: {
            invoice_id: Number(id)
          },
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );

      const productIds = [
        ...new Set(
          productRows
            .map((row) => Number(row.product_id))
            .filter(
              (value) =>
                Number.isSafeInteger(value) &&
                value > 0
            )
        )
      ];

      if (productIds.length > 0) {
        const transitionTimestamp =
          updated?.[0]?.updated_at
            ? new Date(updated[0].updated_at)
            : new Date();

        lifecycleEvent = {
          schema_version: 'storefront-funnel-v1',
          event_id:
            `amna-order-${id}-${requestedTerminal.replaceAll('_', '-')}`,
          event_name: requestedTerminal,
          session_id: `lifecycle-order-${id}`,
          cart_id: `lifecycle-cart-${id}`,
          occurred_at: transitionTimestamp.toISOString(),
          data_origin: 'partner_real',
          ...(
            Number.isSafeInteger(
              Number(current.customer_id)
            ) &&
            Number(current.customer_id) > 0
              ? {
                  customer_id:
                    String(
                      Number(current.customer_id)
                    )
                }
              : {}
          ),
          product_ids: productIds,
          order_id: String(id)
        };
      }
    }

    await transaction.commit();

    if (lifecycleEvent) {
      try {
        await funnelService.publishEvent(
          lifecycleEvent
        );
      } catch (telemetryError) {
        console.error(
          'Post-commit lifecycle telemetry failed:',
          telemetryError
        );
      }
    }

    res.json({ success: true, message: 'Order updated successfully', data: updated[0] });

  } catch (error) {
    await transaction.rollback();
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status', error: error.message });
  }
};

// Authoritative storefront cart DDI check.
// Client sends product IDs only; medicine identity/salt/status comes from PostgreSQL.
exports.checkCartDDI = async (req, res) => {
  try {
    const requestedItems = Array.isArray(req.body?.items)
      ? req.body.items
      : [];

    if (requestedItems.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'EMPTY_DDI_CART',
        message: 'Cart must contain at least one product for DDI review'
      });
    }

    const productIds = [];

    for (const item of requestedItems) {
      const rawId =
        typeof item?.product_id === 'string'
          ? item.product_id.replace(/^prod-/, '')
          : item?.product_id;

      const productId = Number(rawId);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_DDI_PRODUCT_ID',
          message: 'Every cart item must contain a valid product_id'
        });
      }

      if (!productIds.includes(productId)) {
        productIds.push(productId);
      }
    }

    const productRows = await sequelize.query(
      `SELECT
         product_id,
         product_title,
         product_generic_name,
         product_salt,
         product_requires_rx,
         product_status
       FROM product
       WHERE product_id IN (:product_ids)`,
      {
        replacements: { product_ids: productIds },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const rowsById = new Map(
      productRows.map((product) => [
        Number(product.product_id),
        product
      ])
    );

    const missingProductIds = productIds.filter(
      (productId) => !rowsById.has(productId)
    );

    if (missingProductIds.length > 0) {
      return res.status(404).json({
        success: false,
        code: 'DDI_PRODUCT_NOT_FOUND',
        message: 'One or more cart products no longer exist',
        data: {
          product_ids: missingProductIds
        }
      });
    }

    const authoritativeProducts = productIds.map((productId) => {
      const product = rowsById.get(productId);

      return {
        product_id: Number(product.product_id),
        product_title: product.product_title || null,
        product_generic_name: product.product_generic_name || null,
        product_salt: product.product_salt || null,
        product_requires_rx:
          product.product_requires_rx == null
            ? null
            : Boolean(product.product_requires_rx),
        product_status: Number(product.product_status ?? 0)
      };
    });

    const ddi = await ddiService.checkCart(authoritativeProducts);

    if (
      ddi.httpStatus === 503 ||
      ddi.result.status === 'SERVICE_UNAVAILABLE'
    ) {
      return res.status(503).json({
        success: false,
        code: 'DDI_SERVICE_UNAVAILABLE',
        message: ddi.result.message || 'DDI service is unavailable',
        data: ddi.result
      });
    }

    if (ddi.httpStatus !== 200) {
      return res.status(502).json({
        success: false,
        code: 'DDI_UPSTREAM_ERROR',
        message: 'DDI service returned an unexpected response',
        data: ddi.result
      });
    }

    return res.json({
      success: true,
      data: ddi.result
    });
  } catch (error) {
    console.error('Cart DDI check error:', error);

    return res.status(503).json({
      success: false,
      code: error.code || 'DDI_SERVICE_UNAVAILABLE',
      message: 'Drug interaction review could not be completed'
    });
  }
};

// Create new order (invoice)
exports.createOrder = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('=== CREATE ORDER START ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const {
      customer_id,
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      items, // [{ product_id, product_title, quantity, unit_price, discount, tax }]
      discount = 0, // Discount percentage (e.g., 10 for 10%)
      delivery_fee = 0,
      payment_method = 'cash', // Only cash on delivery supported
      notes
    } = req.body;

    console.log('Extracted data - payment_method:', payment_method);

    // Validate payment method (only cash supported)
    if (payment_method !== 'cash') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Only Cash on Delivery is supported currently'
      });
    }

    // Validate items
    if (!items || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Order must contain at least one item'
      });
    }

    // ================================================================
    // SERVER-AUTHORITATIVE CHECKOUT VALIDATION
    // Product identity, title, selling price and stock come from PostgreSQL.
    // ================================================================
    const normalizedItems = [];

    for (const requestedItem of items) {
      const productId = Number(requestedItem.product_id);
      const requestedQty = Number(requestedItem.quantity);

      if (
        !Number.isInteger(productId) ||
        productId <= 0 ||
        !Number.isInteger(requestedQty) ||
        requestedQty <= 0
      ) {
        await transaction.rollback();

        return res.status(400).json({
          success: false,
          code: 'INVALID_ORDER_ITEM',
          message: 'Each item requires a valid product_id and positive integer quantity'
        });
      }

      const productRows = await sequelize.query(
        "SELECT product_id, product_title, product_price, product_discount, product_status, product_salt, product_generic_name, product_requires_rx FROM product WHERE product_id = :product_id AND COALESCE(product_status, 1) = 1 LIMIT 1",
        {
          replacements: {
            product_id: productId
          },
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );

      const product = productRows[0];

      if (!product) {
        await transaction.rollback();

        return res.status(404).json({
          success: false,
          code: 'PRODUCT_NOT_AVAILABLE',
          message: 'Product ' + productId + ' is not available'
        });
      }

      const stockRows = await sequelize.query(
        "SELECT COALESCE(SUM(remaining_quantity), 0)::int AS available FROM stock_history WHERE product_id = :product_id AND remaining_quantity > 0 AND status = 1 AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)",
        {
          replacements: {
            product_id: productId
          },
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );

      const availableStock =
        Number(stockRows[0]?.available || 0);

      if (availableStock < requestedQty) {
        await transaction.rollback();

        return res.status(409).json({
          success: false,
          code: 'INSUFFICIENT_STOCK',
          message:
            'Insufficient stock for ' +
            product.product_title +
            '. Requested ' +
            requestedQty +
            ', available ' +
            availableStock +
            '.',
          data: {
            product_id: productId,
            requested: requestedQty,
            available: availableStock
          }
        });
      }

      normalizedItems.push({
        product_id: product.product_id,
        product_title: product.product_title,
        quantity: requestedQty,

        // Client selling price is ignored.
        unit_price:
          Number(product.product_price || 0),

        // Keep latest-partner discount/tax contract unchanged.
        discount:
          Number(requestedItem.discount || 0),

        tax:
          Number(requestedItem.tax || 0),

        product_salt:
          product.product_salt || null,

        product_generic_name:
          product.product_generic_name || null,

        product_requires_rx:
          Boolean(product.product_requires_rx)
      });
    }

    items.length = 0;
    items.push(...normalizedItems);

    // ================================================================
    // SERVER-AUTHORITATIVE DDI CHECKOUT GATE
    // Uses only products already reloaded from PostgreSQL above.
    // Duplicate cart lines are collapsed for DDI identity evaluation.
    // ================================================================
    const ddiProductsById = new Map();

    for (const item of normalizedItems) {
      ddiProductsById.set(Number(item.product_id), {
        product_id: Number(item.product_id),
        product_title: item.product_title || null,
        product_generic_name: item.product_generic_name || null,
        product_salt: item.product_salt || null,
        product_requires_rx:
          item.product_requires_rx == null
            ? null
            : Boolean(item.product_requires_rx),
        product_status: 1
      });
    }

    let ddi;

    try {
      ddi = await ddiService.checkCart(
        Array.from(ddiProductsById.values())
      );
    } catch (error) {
      await transaction.rollback();

      console.error('Checkout DDI service error:', error);

      return res.status(503).json({
        success: false,
        code: 'DDI_SERVICE_UNAVAILABLE',
        message:
          'Drug interaction review is unavailable. Checkout was stopped because the safety check could not be completed.'
      });
    }

    if (
      ddi.httpStatus === 503 ||
      ddi.result.status === 'SERVICE_UNAVAILABLE'
    ) {
      await transaction.rollback();

      return res.status(503).json({
        success: false,
        code: 'DDI_SERVICE_UNAVAILABLE',
        message:
          ddi.result.message ||
          'Drug interaction review is unavailable. Checkout was stopped.',
        data: {
          ddi: ddi.result
        }
      });
    }

    if (ddi.httpStatus !== 200) {
      await transaction.rollback();

      return res.status(502).json({
        success: false,
        code: 'DDI_UPSTREAM_ERROR',
        message:
          'Drug interaction review returned an unexpected response. Checkout was stopped.',
        data: {
          ddi: ddi.result
        }
      });
    }

    if (!ddi.result.checkout_allowed) {
      await transaction.rollback();

      return res.status(409).json({
        success: false,
        code: 'DDI_REVIEW_REQUIRED',
        message:
          ddi.result.message ||
          'Drug interaction review is required before checkout.',
        data: {
          ddi: ddi.result
        }
      });
    }

    // Calculate totals
    let subtotal = 0;
    let totalItemDiscount = 0;
    let totalTax = 0;

    for (const item of items) {
      const itemTotal = item.quantity * item.unit_price;
      const itemDiscount = item.discount || 0;
      const itemTax = item.tax || 0;
      
      subtotal += itemTotal;
      totalItemDiscount += itemDiscount;
      totalTax += itemTax;
    }

    // Calculate order-level discount from percentage
    const order_discount_amount = (subtotal * discount) / 100;

    // Total discount = item discounts + order discount percentage
    const totalDiscount = totalItemDiscount + order_discount_amount;

    // Final total = subtotal - total discount + tax + delivery
    const total_amount = subtotal - totalDiscount + totalTax + delivery_fee;
    
    // Cash on Delivery - always unpaid initially
    const paid_amount = 0;
    const due_amount = total_amount;
    const payment_status = 'unpaid';

    // Generate sequential invoice number matching invoiceController format
    const lastInvoiceQuery = await sequelize.query(
      `SELECT invoice_number FROM invoice
       WHERE invoice_number ~ '^INV-[0-9]+$'
       ORDER BY invoice_id DESC LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, transaction }
    );
    let invoiceCounter = 1;
    if (lastInvoiceQuery.length > 0 && lastInvoiceQuery[0].invoice_number) {
      const m = lastInvoiceQuery[0].invoice_number.match(/INV-(\d+)/);
      if (m) invoiceCounter = parseInt(m[1]) + 1;
    }
    const invoice_number = `INV-${String(invoiceCounter).padStart(6, '0')}`;

    // Create invoice with basic details (Cash on Delivery only)
    const invoiceData = {
      customer_id: customer_id || null,
      customer_name,
      customer_phone: customer_phone || null,
      customer_email: customer_email || null,
      invoice_number,
      invoice_date: new Date().toISOString().split('T')[0],
      total_amount,
      discount: totalDiscount,
      delivery_fee,
      paid_amount,
      due_amount,
      payment_status: payment_status,
      payment_method,
      delivery_status: 'pending',
      delivery_address: customer_address || null,
      notes: notes || null,
      created_by: customer_id ? `customer-${customer_id}` : 'guest',
      status: 1
    };

    const [invoice] = await sequelize.query(
      `INSERT INTO invoice (
        customer_id, customer_name, customer_phone, customer_email, invoice_number, invoice_date,
        total_amount, discount, delivery_fee, paid_amount, due_amount,
        payment_status, payment_method, delivery_status, delivery_address, notes,
        created_by, status, created_at, updated_at
      ) VALUES (
        :customer_id, :customer_name, :customer_phone, :customer_email, :invoice_number, :invoice_date,
        :total_amount, :discount, :delivery_fee, :paid_amount, :due_amount,
        :payment_status, :payment_method, :delivery_status, :delivery_address, :notes,
        :created_by, :status, NOW(), NOW()
      ) RETURNING invoice_id`,
      { 
        replacements: invoiceData,
        type: sequelize.QueryTypes.INSERT,
        transaction
      }
    );

    const invoice_id = invoice[0].invoice_id;

    // Create invoice items with per-batch FIFO allocation
    // Each batch allocation gets its OWN invoice_report row for accurate profit tracking
    for (const item of items) {
      const unitPrice    = item.unit_price;
      const itemDiscount = item.discount || 0;
      const itemTax      = item.tax      || 0;

      // FIFO: get available batches oldest-first (FEFO)
      const stock_history = await sequelize.query(
        `SELECT batch_id, batch_number, remaining_quantity, expiry_date,
                product_price AS purchase_price
         FROM stock_history
         WHERE product_id = :product_id
           AND remaining_quantity > 0
           AND status = 1
            AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
         ORDER BY expiry_date ASC, batch_id ASC
          FOR UPDATE`,
        { replacements: { product_id: item.product_id },
          type: sequelize.QueryTypes.SELECT, transaction }
      );

      let quantityToAllocate = item.quantity;
      const batchAllocations = [];   // [{batch, allocateQty}]

      // Pass 1 – compute allocations
      for (const batch of stock_history) {
        if (quantityToAllocate <= 0) break;
        const allocateQty = Math.min(quantityToAllocate, batch.remaining_quantity);
        batchAllocations.push({ batch, allocateQty });
        quantityToAllocate -= allocateQty;
      }

      // Pass 2 – write invoice_report + deduct stock + write stock_report
      const totalAllocated = batchAllocations.reduce((s, a) => s + a.allocateQty, 0);

      if (
        quantityToAllocate > 0 ||
        totalAllocated !== item.quantity
      ) {
        throw new Error(
          'STOCK_ALLOCATION_FAILED: product ' +
          item.product_id +
          ', requested ' +
          item.quantity +
          ', allocated ' +
          totalAllocated
        );
      }

      for (const { batch, allocateQty } of batchAllocations) {
        // Distribute discount & tax proportionally across batches
        const fraction     = totalAllocated > 0 ? allocateQty / totalAllocated : 0;
        const batchDiscount = Number((itemDiscount * fraction).toFixed(2));
        const batchTax      = Number((itemTax      * fraction).toFixed(2));
        const batchTotal    = (allocateQty * unitPrice) - batchDiscount + batchTax;

        // One invoice_report row per batch  ← KEY CHANGE
        await sequelize.query(
          `INSERT INTO invoice_report (
             invoice_id, product_id, product_title, quantity, unit_price,
             discount, tax, total_price, batch_number, expiry_date,
             purchase_price, status, created_at, updated_at
           ) VALUES (
             :invoice_id, :product_id, :product_title, :quantity, :unit_price,
             :discount, :tax, :total_price, :batch_number, :expiry_date,
             :purchase_price, 1, NOW(), NOW()
           )`,
          {
            replacements: {
              invoice_id,
              product_id:     item.product_id,
              product_title:  item.product_title || item.product_name || item.name || 'Unknown',
              quantity:       allocateQty,
              unit_price:     unitPrice,
              discount:       batchDiscount,
              tax:            batchTax,
              total_price:    batchTotal,
              batch_number:   batch.batch_number,
              expiry_date:    batch.expiry_date || null,
              purchase_price: Number(batch.purchase_price || 0)
            },
            type: sequelize.QueryTypes.INSERT,
            transaction
          }
        );

        // Deduct from stock_history batch
        await sequelize.query(
          `UPDATE stock_history
           SET remaining_quantity = remaining_quantity - :qty, updated_at = NOW()
           WHERE batch_id = :batch_id`,
          { replacements: { qty: allocateQty, batch_id: batch.batch_id },
            type: sequelize.QueryTypes.UPDATE, transaction }
        );

        // Running balance after this deduction
        const [stockTotals] = await sequelize.query(
          `SELECT COALESCE(SUM(remaining_quantity), 0) AS total_qty
           FROM stock_history
           WHERE product_id = :product_id AND status = 1`,
          { replacements: { product_id: item.product_id },
            type: sequelize.QueryTypes.SELECT, transaction }
        );

        // Stock ledger entry
        await sequelize.query(
          `INSERT INTO stock_report (
             product_id, batch_id, transaction_type, reference_type, reference_number,
             quantity_change, balance_after, unit_price, notes, transaction_date, created_at
           ) VALUES (
             :product_id, :batch_id, 'SALE', 'INVOICE', :ref,
             :qty_change, :balance, :unit_price, :notes, NOW(), NOW()
           )`,
          {
            replacements: {
              product_id:  item.product_id,
              batch_id:    batch.batch_id,
              ref:         invoice_number,
              qty_change:  -allocateQty,
              balance:     parseFloat(stockTotals.total_qty),
              unit_price:  batch.purchase_price,
              notes:       `Sale - ${invoice_number} - Batch ${batch.batch_number}`
            },
            type: sequelize.QueryTypes.INSERT,
            transaction
          }
        );
      }
    }

    // Create customer ledger entry for this purchase
    if (customer_id) {
      // Check if customer account exists
      const [accountExists] = await sequelize.query(
        `SELECT account_id FROM customer_accounts WHERE customer_id = :customer_id AND status = 1`,
        {
          replacements: { customer_id },
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );

      if (!accountExists) {
        await sequelize.query(
          `INSERT INTO customer_accounts (
            customer_id, opening_balance, current_balance, total_debit, total_credit,
            credit_limit, payment_terms, account_status, status, created_at, updated_at
          ) VALUES (
            :customer_id, 0, 0, 0, 0, 50000, 30, 'active', 1, NOW(), NOW()
          )`,
          {
            replacements: { customer_id },
            type: sequelize.QueryTypes.INSERT,
            transaction
          }
        );
      }

      // Get current balance
      const [accountData] = await sequelize.query(
        `SELECT account_id, current_balance FROM customer_accounts WHERE customer_id = :customer_id AND status = 1`,
        {
          replacements: { customer_id },
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );

      const currentBalance = parseFloat(accountData?.current_balance || 0);
      const newBalance = currentBalance + total_amount;

      // Update customer account balance (unpaid invoice)
      await sequelize.query(
        `UPDATE customer_accounts 
         SET current_balance = :current_balance,
             total_debit = total_debit + :total_amount,
             updated_at = NOW()
         WHERE customer_id = :customer_id`,
        {
          replacements: { customer_id, current_balance: newBalance, total_amount },
          type: sequelize.QueryTypes.UPDATE,
          transaction
        }
      );

      // Create ledger entry per item: INVOICE (debit - customer owes us)
      // reference_number = invoice_number (same as PDF invoice_id reference)
      for (const item of items) {
        await sequelize.query(
          `INSERT INTO customer_ledger (
            customer_id, account_id, transaction_date, transaction_type,
            reference_type, reference_id, reference_number,
            debit_amount, credit_amount, balance,
            payment_method, description, performed_by,
            product_id, product_quantity,
            status, created_at, updated_at
          ) VALUES (
            :customer_id, :account_id, NOW(), 'invoice',
            'INVOICE', :invoice_id, :invoice_number,
            :debit_amount, 0, :balance,
            'cash', :description, :performed_by,
            :product_id, :product_quantity,
            1, NOW(), NOW()
          )`,
          {
            replacements: {
              customer_id,
              account_id:       accountData.account_id,
              invoice_id,
              invoice_number,                                      // INV-XXXXXX as reference
              debit_amount:     (item.quantity * item.unit_price) - (item.discount || 0),
              balance:          newBalance,
              description:      `${invoice_number} - ${item.product_title}`,
              performed_by:     req.user?.email || 'pharmacist',
              product_id:       item.product_id,                  // product_id per PDF
              product_quantity: item.quantity                      // quantity per PDF
            },
            type: sequelize.QueryTypes.INSERT,
            transaction
          }
        );
      }
    }

    await transaction.commit();

    // Commerce is already committed. Analytics cannot fail this order.
    try {
      const sessionId =
        typeof req.body?.funnel_session_id === 'string'
          ? req.body.funnel_session_id.trim()
          : '';

      const cartId =
        typeof req.body?.funnel_cart_id === 'string'
          ? req.body.funnel_cart_id.trim()
          : '';

      const funnelProductIds = [
        ...new Set(
          normalizedItems
            .map((item) => Number(item.product_id))
            .filter(
              (productId) =>
                Number.isSafeInteger(productId) &&
                productId > 0
            )
        )
      ];

      if (
        sessionId &&
        sessionId.length <= 128 &&
        cartId &&
        cartId.length <= 128 &&
        funnelProductIds.length > 0
      ) {
        void funnelService.publishEvent({
          schema_version: 'storefront-funnel-v1',
          event_id: `amna-order-${invoice_id}`,
          event_name: 'order_created',
          session_id: sessionId,
          cart_id: cartId,
          occurred_at: new Date().toISOString(),
          data_origin: 'partner_real',
          ...(
            Number.isSafeInteger(
              Number(req.customerUser?.id)
            ) &&
            Number(req.customerUser.id) > 0
              ? {
                  customer_id:
                    String(
                      Number(req.customerUser.id)
                    )
                }
              : {}
          ),
          product_ids: funnelProductIds,
          order_id: String(invoice_id)
        }).catch((funnelError) => {
          console.error(
            'Order funnel telemetry failed:',
            funnelError.message
          );
        });
      }
    } catch (funnelError) {
      console.error(
        'Order funnel telemetry setup failed:',
        funnelError.message
      );
    }

    // Create notification for all pharmacy staff
    try {
      const pharmacists = await User.findAll({
        where: { role: 'pharmacist', isActive: true }
      });

      for (const pharmacist of pharmacists) {
        await createNotification(
          pharmacist.id,
          'new_order',
          `New Order: ${invoice_number}`,
          `${customer_name || 'Customer'} placed an order — PKR ${total_amount.toLocaleString()}`,
          {
            orderId: invoice_id,
            orderNumber: invoice_number,
            customerName: customer_name,
            totalAmount: total_amount
          }
        );
      }
    } catch (notifError) {
      console.error('Failed to create notification:', notifError);
      // Don't fail the order if notification fails
    }

    res.status(201).json({
      success: true,
      message: 'Order placed successfully (Cash on Delivery)',
      data: {
        orderId: invoice_id,
        orderNumber: invoice_number,
        total: total_amount,
        paymentStatus: payment_status,
        paymentMethod: payment_method,
        deliveryStatus: 'pending'
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('=== CREATE ORDER ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TODAY STATS  — today's orders, revenue, paid amount vs yesterday
// ─────────────────────────────────────────────────────────────────────────────
exports.getTodayStats = async (req, res) => {
  try {
    const [today, yesterday, thisMonth] = await Promise.all([
      sequelize.query(`
        SELECT
          COUNT(*)                                                AS total_orders,
          COALESCE(SUM(total_amount), 0)                         AS total_revenue,
          COALESCE(SUM(CASE WHEN payment_status='paid' THEN paid_amount ELSE 0 END), 0) AS total_paid,
          COALESCE(SUM(due_amount), 0)                           AS total_due,
          COUNT(CASE WHEN delivery_status='pending'    THEN 1 END) AS pending,
          COUNT(CASE WHEN delivery_status='delivered'  THEN 1 END) AS delivered,
          COUNT(CASE WHEN payment_status='paid'        THEN 1 END) AS paid_count
        FROM invoice
        WHERE status = 1
          AND DATE(created_at) = CURRENT_DATE
      `, { type: sequelize.QueryTypes.SELECT }),

      sequelize.query(`
        SELECT
          COUNT(*)                                                AS total_orders,
          COALESCE(SUM(total_amount), 0)                         AS total_revenue,
          COALESCE(SUM(CASE WHEN payment_status='paid' THEN paid_amount ELSE 0 END), 0) AS total_paid
        FROM invoice
        WHERE status = 1
          AND DATE(created_at) = CURRENT_DATE - INTERVAL '1 day'
      `, { type: sequelize.QueryTypes.SELECT }),

      sequelize.query(`
        SELECT
          COUNT(*)                                                AS total_orders,
          COALESCE(SUM(total_amount), 0)                         AS total_revenue,
          COALESCE(SUM(CASE WHEN payment_status='paid' THEN paid_amount ELSE 0 END), 0) AS total_paid,
          COALESCE(SUM(due_amount), 0)                           AS total_due
        FROM invoice
        WHERE status = 1
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      `, { type: sequelize.QueryTypes.SELECT }),
    ]);

    const t = today[0];
    const y = yesterday[0];
    const m = thisMonth[0];

    const pct = (curr, prev) => {
      const c = parseFloat(curr || 0);
      const p = parseFloat(prev || 0);
      if (p === 0) return c > 0 ? 100 : 0;
      return Math.round(((c - p) / p) * 100);
    };

    res.json({
      success: true,
      data: {
        today: {
          totalOrders:   parseInt(t.total_orders   || 0),
          totalRevenue:  parseFloat(t.total_revenue  || 0),
          totalPaid:     parseFloat(t.total_paid     || 0),
          totalDue:      parseFloat(t.total_due      || 0),
          pending:       parseInt(t.pending          || 0),
          delivered:     parseInt(t.delivered        || 0),
          paidCount:     parseInt(t.paid_count       || 0),
        },
        yesterday: {
          totalOrders:  parseInt(y.total_orders   || 0),
          totalRevenue: parseFloat(y.total_revenue  || 0),
          totalPaid:    parseFloat(y.total_paid     || 0),
        },
        thisMonth: {
          totalOrders:  parseInt(m.total_orders   || 0),
          totalRevenue: parseFloat(m.total_revenue  || 0),
          totalPaid:    parseFloat(m.total_paid     || 0),
          totalDue:     parseFloat(m.total_due      || 0),
        },
        trends: {
          ordersVsYesterday:  pct(t.total_orders,  y.total_orders),
          revenueVsYesterday: pct(t.total_revenue, y.total_revenue),
          paidVsYesterday:    pct(t.total_paid,    y.total_paid),
        },
      },
    });
  } catch (error) {
    console.error('Get today stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch today stats', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DAILY STATS — last 7 days revenue + order count for chart
// ─────────────────────────────────────────────────────────────────────────────
exports.getDailyStats = async (req, res) => {
  try {
    const days = parseInt(req.query.days || 7);

    const rows = await sequelize.query(`
      SELECT
        DATE(created_at)                        AS day,
        COUNT(*)                                AS orders,
        COALESCE(SUM(total_amount),    0)       AS revenue,
        COALESCE(SUM(CASE WHEN payment_status='paid' THEN paid_amount ELSE 0 END), 0) AS paid
      FROM invoice
      WHERE status = 1
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `, { type: sequelize.QueryTypes.SELECT });

    // Fill in missing days so chart always has `days` data points
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const found = rows.find(r => String(r.day).slice(0, 10) === key);
      result.push({
        day:     d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        date:    key,
        orders:  found ? parseInt(found.orders  || 0) : 0,
        revenue: found ? parseFloat(found.revenue || 0) : 0,
        paid:    found ? parseFloat(found.paid    || 0) : 0,
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get daily stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch daily stats', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TOP MEDICINES — top 5 by units sold in last 30 days (from invoice_report)
// ─────────────────────────────────────────────────────────────────────────────
exports.getTopMedicines = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || 5);
    const days  = parseInt(req.query.days  || 30);

    const rows = await sequelize.query(`
      SELECT
        ir.product_title                        AS name,
        SUM(ir.quantity)                        AS units_sold,
        SUM(ir.total_price)                     AS total_revenue,
        COUNT(DISTINCT ir.invoice_id)           AS invoice_count
      FROM invoice_report ir
      INNER JOIN invoice i ON i.invoice_id = ir.invoice_id
      WHERE i.status = 1
        AND i.created_at >= NOW() - INTERVAL '${days} days'
        AND ir.status = 1
        AND ir.product_title IS NOT NULL
      GROUP BY ir.product_title
      ORDER BY units_sold DESC
      LIMIT :limit
    `, {
      replacements: { limit },
      type: sequelize.QueryTypes.SELECT,
    });

    res.json({
      success: true,
      data: rows.map(r => ({
        name:         r.name,
        units:        parseInt(r.units_sold    || 0),
        revenue:      parseFloat(r.total_revenue || 0),
        invoiceCount: parseInt(r.invoice_count  || 0),
      })),
    });
  } catch (error) {
    console.error('Get top medicines error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch top medicines', error: error.message });
  }
};

module.exports = exports;
