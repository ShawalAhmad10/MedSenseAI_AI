const Product = require('../models/Product');
const StockHistory = require('../models/StockHistory');
const Brand = require('../models/Brand');
const Supplier = require('../models/Supplier');
const BatchAllocationService = require('../services/batchAllocationService');
const { sequelize } = require('../config/database');
const { money } = require('../services/productPricingService');
const { setSalePrice } = require('../services/salePricingService');
const { selectMarketProducts, listProductBatches, synchronizeProductStatus } = require('../services/marketProductService');

exports.setSalePrice = async (req, res) => {
  try {
    res.json(await setSalePrice(req.params.id, req.body.price));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Failed to update sale price' });
  }
};

// Get all products with brand and supplier names
exports.getAllProducts = async (req, res) => {
  try {
    // Independent reads: execute concurrently to reduce DB round trips.
    const [products, brand, suppliers] = await Promise.all([
      Product.findAll({
        where: { archived: false },
        order: [['product_id', 'DESC']]
      }),
      Brand.findAll(),
      Supplier.findAll()
    ]);

    const brandMap = {};
    brand.forEach(b => brandMap[b.brand_id] = b.brand_name);

    const supplierMap = {};
    suppliers.forEach(s => supplierMap[s.supplier_id] = s.supplier_name);

    // Get stock info directly from stock_history table
    const [stockInfo] = await sequelize.query(`
      SELECT 
        product_id,
        SUM(CASE WHEN (expiry_date IS NULL OR expiry_date >= CURRENT_DATE) AND COALESCE(batch_status, 'ACTIVE') = 'ACTIVE' AND remaining_quantity > 0 THEN remaining_quantity ELSE 0 END) as available_stock,
        MIN(CASE WHEN (expiry_date IS NULL OR expiry_date >= CURRENT_DATE) AND COALESCE(batch_status, 'ACTIVE') = 'ACTIVE' AND remaining_quantity > 0 THEN expiry_date ELSE NULL END) as nearest_expiry,
        COUNT(CASE WHEN (expiry_date IS NULL OR expiry_date >= CURRENT_DATE) AND COALESCE(batch_status, 'ACTIVE') = 'ACTIVE' AND remaining_quantity > 0 THEN 1 END) as active_batch_count,
        SUM(CASE WHEN expiry_date < CURRENT_DATE THEN remaining_quantity ELSE 0 END) as expired_stock,
        COUNT(CASE WHEN expiry_date < CURRENT_DATE THEN 1 END) as expired_batch_count
        , MAX(CASE WHEN (expiry_date IS NULL OR expiry_date >= CURRENT_DATE) AND COALESCE(batch_status, 'ACTIVE') = 'ACTIVE' AND remaining_quantity > 0 THEN batch_id END) as latest_receipt_id
      FROM stock_history
      WHERE status = 1
      GROUP BY product_id
    `);
    const stockMap = {};
    stockInfo.forEach(s => {
      stockMap[s.product_id] = {
        available_stock: Number(s.available_stock || 0),
        nearest_expiry: s.nearest_expiry,
        active_batch_count: Number(s.active_batch_count || 0),
        expired_stock: Number(s.expired_stock || 0),
        expired_batch_count: Number(s.expired_batch_count || 0)
        , latest_receipt_id: Number(s.latest_receipt_id || 0)
      };
    });

    const batchesByProduct = new Map();
    for (const batch of await listProductBatches()) {
      if (!batchesByProduct.has(batch.product_id)) batchesByProduct.set(batch.product_id, []);
      batchesByProduct.get(batch.product_id).push(batch);
    }

    // Transform to match frontend format
    const formattedProducts = products.map(product => {
      const unitPrice = Number(product.product_price || 0);
      const batches = batchesByProduct.get(product.product_id) || [];
      const activeBatch = batches.find(batch => batch.available);
      const packSize = Number(product.product_pack_size || 1);
      const storedPackPrice = Number(product.product_pack_price || 0);
      
      // Pack price logic:
      // - If stored in DB, use it (primary source of truth)
      // - If missing, calculate from unit price × pack size (fallback for legacy data)
      const calculatedPackPrice = storedPackPrice > 0 
        ? storedPackPrice 
        : (unitPrice * packSize);
      
      const stock = stockMap[product.product_id] || { 
        available_stock: 0, 
        nearest_expiry: null, 
        active_batch_count: 0,
        expired_stock: 0,
        expired_batch_count: 0
      };
      
      return {
        id: `prod-${product.product_id}`,
        familyId: product.fifo_family_id,
        manuallyInactive: product.manually_inactive,
        archived: product.archived,
        title: product.product_title || '',
        genericName: product.product_generic_name || '',
        salt: product.product_salt || '',
        category: product.product_category || '',
        brandId: product.product_brand,
        brandName: brandMap[product.product_brand] || '',
        supplierId: product.product_supplier,
        supplierName: supplierMap[product.product_supplier] || '',
        price: unitPrice,
        purchasePrice: product.product_purchase_price == null ? null : Number(product.product_purchase_price),
        priceLabel: `${product.product_title || ''} - PKR ${unitPrice}/unit`,
        packPrice: calculatedPackPrice,
        packSize: packSize,
        packDescription: product.product_pack_description || '',
        stockQty: stock.available_stock, // From stock_history, not product table
        minThreshold: product.product_min_threshold || 0,
        expiryDate: stock.nearest_expiry || '', // Nearest expiry from active stock_history
        batchCount: stock.active_batch_count,
        latestReceiptId: activeBatch?.batch_id || 0,
        latestArrival: activeBatch?.creation_day || activeBatch?.created_at?.toISOString?.().slice(0, 10) || '',
        latestCreatedAt: activeBatch?.created_at?.toISOString?.() || '',
        activeBatchId: activeBatch?.batch_id || null,
        activeBatchNumber: activeBatch?.batch_number || '',
        activeBatchPrice: activeBatch ? Number(activeBatch.sale_price) : null,
        activeBatchQty: activeBatch ? Number(activeBatch.remaining_quantity) : 0,
        batches: batches.map(batch => ({ batchId: batch.batch_id, batchNumber: batch.batch_number, name: batch.product_title,
          purchasePrice: Number(batch.product_price), salePrice: Number(batch.sale_price),
          stockQty: Number(batch.remaining_quantity), arrivalDate: batch.creation_day,
          createdAt: batch.created_at, available: batch.available })),
        expiredStock: stock.expired_stock, // NEW: Expired stock count
        expiredBatchCount: stock.expired_batch_count, // NEW: Expired batch count
        requiresRx: product.product_requires_rx || false,
        description: product.product_description || '',
        discount: product.product_discount || 0,
        status: stock.available_stock > 0 && !product.manually_inactive ? 'active' : 'inactive',
        createdBy: product.created_by || ''
      };
    });

    res.json(req.query?.view === 'storefront' ? selectMarketProducts(formattedProducts) : formattedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { 
      title, genericName, salt, category, brandId, supplierId, price, packPrice, 
      packSize, packDescription, minThreshold,
      requiresRx, description, discount, status, createdBy, purchasePrice
    } = req.body;

    // Validations
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Product title is required' });
    }

    if (!category) {
      return res.status(400).json({ message: 'Category is required' });
    }

    if (!brandId) {
      return res.status(400).json({ message: 'Brand is required' });
    }

    if (!supplierId) {
      return res.status(400).json({ message: 'Supplier is required' });
    }

    if (!price || price <= 0) {
      return res.status(400).json({ message: 'Valid price is required' });
    }

    if (!Number.isFinite(Number(price)) || (purchasePrice != null &&
        (!Number.isFinite(Number(purchasePrice)) || Number(purchasePrice) <= 0 || Number(purchasePrice) > Number(price)))) {
      return res.status(400).json({ message: 'Enter valid unit prices; purchase price cannot exceed sale price.' });
    }

    // Stock quantity is managed in Stock Batches section (stock_history table), not here
    // Expiry date is managed per batch, not per product

    if (minThreshold === undefined || minThreshold === null || minThreshold < 0) {
      return res.status(400).json({ message: 'Valid minimum threshold is required' });
    }

    // Verify brand exists
    const brand = await Brand.findByPk(brandId);
    if (!brand) {
      return res.status(400).json({ message: 'Selected brand does not exist' });
    }

    // Verify supplier exists
    const supplier = await Supplier.findByPk(supplierId);
    if (!supplier) {
      return res.status(400).json({ message: 'Selected supplier does not exist' });
    }

    // ✅ Check if this exact medicine (title + genericName/salt) already exists from ANY supplier
    // Rule: Same medicine can only come from ONE supplier
    const existingProducts = await Product.findAll({
      where: {
        product_title: title.trim(),
        product_generic_name: genericName?.trim() || salt?.trim() || title.trim()
      }
    });

    for (const existingProduct of existingProducts) {
      if (Number(existingProduct.product_supplier) !== Number(supplierId)) {
        const existingSupplier = await Supplier.findByPk(existingProduct.product_supplier);
        return res.status(400).json({ 
          message: `Medicine "${title}" (${genericName || salt || title}) already exists from supplier "${existingSupplier?.supplier_name}". Same medicine cannot be supplied by multiple suppliers.` 
        });
      } else if (purchasePrice == null ||
          (existingProduct.product_purchase_price != null && money(existingProduct.product_purchase_price) === money(purchasePrice))) {
        return res.status(400).json({ 
          message: 'Medicine already exists. Use Add New Batch against the existing product to receive stock with its own purchase cost and sale price.'
        });
      }
    }

    let familyId = null;
    if (req.body.sourceProductId) {
      const source = await Product.findByPk(String(req.body.sourceProductId).replace('prod-', ''));
      if (!source || source.archived) return res.status(400).json({ message: 'Original medicine not found.' });
      if (Number(source.product_supplier) !== Number(supplierId)) return res.status(400).json({ message: 'A medicine and all its price versions must keep the same supplier.' });
      if (Number(source.product_brand) !== Number(brandId) || Number(source.product_pack_size || 1) !== Number(packSize || 1) || String(source.product_salt || '').trim().toLowerCase() !== String(salt || '').trim().toLowerCase())
        return res.status(400).json({ message: 'A price version must keep the same brand, strength and pack size.' });
      familyId = source.fifo_family_id || source.product_id;
      if (!source.fifo_family_id) await source.update({ fifo_family_id: familyId });
    }
    const product = await Product.create({
      fifo_family_id: familyId,
      product_title: title.trim(),
      product_generic_name: genericName?.trim() || salt?.trim() || title.trim(), // Use salt or title if genericName not provided
      product_salt: salt?.trim() || null,
      product_category: category,
      product_brand: brandId,
      product_supplier: supplierId,
      product_price: price,
      product_purchase_price: purchasePrice == null ? null : money(purchasePrice),
      product_pack_price: packPrice || null,
      product_pack_size: packSize || null,
      product_pack_description: packDescription?.trim() || null,
      product_min_threshold: minThreshold || 0,
      product_requires_rx: requiresRx || false,
      product_description: description?.trim() || null,
      product_discount: discount || 0,
      product_status: 0,
      created_by: createdBy?.trim() || null
    });

    // Get current stock from stock_history
    const [stockInfo] = await sequelize.query(
      `SELECT 
        SUM(CASE WHEN expiry_date >= CURRENT_DATE AND remaining_quantity > 0 THEN remaining_quantity ELSE 0 END) as available_stock,
        MIN(CASE WHEN expiry_date >= CURRENT_DATE AND remaining_quantity > 0 THEN expiry_date ELSE NULL END) as nearest_expiry
      FROM stock_history 
      WHERE product_id = :productId`,
      { replacements: { productId: product.product_id } }
    );
    const stock = stockInfo[0] || { available_stock: 0, nearest_expiry: null };

    const formattedProduct = {
      id: `prod-${product.product_id}`,
      title: product.product_title,
      genericName: product.product_generic_name || '',
      salt: product.product_salt || '',
      category: product.product_category || '',
      brandId: product.product_brand,
      brandName: brand.brand_name,
      supplierId: product.product_supplier,
      supplierName: supplier.supplier_name,
      price: product.product_price,
      purchasePrice: product.product_purchase_price == null ? null : Number(product.product_purchase_price),
      packPrice: product.product_pack_price || 0,
      packSize: product.product_pack_size || 0,
      packDescription: product.product_pack_description || '',
      stockQty: stock.available_stock || 0,
      minThreshold: product.product_min_threshold || 0,
      expiryDate: stock.nearest_expiry || '',
      requiresRx: product.product_requires_rx || false,
      description: product.product_description || '',
      discount: product.product_discount || 0,
      status: product.product_status === 1 ? 'active' : 'inactive',
      createdBy: product.created_by || ''
    };

    res.status(201).json(formattedProduct);
  } catch (error) {
    console.error('Error creating product:', error);
    if (error.parent?.code === '23514') return res.status(400).json({ message: error.parent.message });
    res.status(500).json({ message: 'Error creating product', error: error.message });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, genericName, salt, category, brandId, supplierId, price, packPrice, 
      packSize, packDescription, minThreshold,
      requiresRx, description, discount, status, purchasePrice
    } = req.body;

    const productId = id.replace('prod-', '');
    const product = await Product.findByPk(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (title !== undefined && title.trim() !== product.product_title) {
      return res.status(400).json({ message: 'Existing medicine names are preserved. Receive a new arrival name using Add New Batch.' });
    }

    if ((price !== undefined && Number(price) !== Number(product.product_price)) ||
        (purchasePrice !== undefined && Number(purchasePrice) !== Number(product.product_purchase_price))) {
      return res.status(400).json({ message: 'Product edits cannot change batch prices. Receive changed prices using Add New Batch in Inventory.' });
    }
    if (packPrice !== undefined && packSize !== undefined && Number(packSize) > 0 &&
        Math.abs(Number(packPrice) / Number(packSize) - Number(product.product_price)) > 0.011) {
      return res.status(400).json({ message: 'Pack defaults must match the product unit default. Use Inventory to manage batch sale prices.' });
    }

    // Validations
    if (brandId !== undefined) {
      if (!brandId) {
        return res.status(400).json({ message: 'Brand is required' });
      }
      const brand = await Brand.findByPk(brandId);
      if (!brand) {
        return res.status(400).json({ message: 'Selected brand does not exist' });
      }
    }

    if (supplierId !== undefined) {
      if (!supplierId) {
        return res.status(400).json({ message: 'Supplier is required' });
      }
      const supplier = await Supplier.findByPk(supplierId);
      if (!supplier) {
        return res.status(400).json({ message: 'Selected supplier does not exist' });
      }

      // Check if changing supplier for this product
      if (supplierId !== product.product_supplier) {
        // Check if this product title exists with another supplier
        const existingProduct = await Product.findOne({
          where: {
            product_title: title || product.product_title,
            product_supplier: supplierId
          }
        });

        if (existingProduct && existingProduct.product_id !== product.product_id) {
          return res.status(400).json({ 
            message: `This product already exists with the selected supplier. Changing supplier is allowed but it must not conflict with existing products.` 
          });
        }
      }
    }

    if (price !== undefined && price <= 0) {
      return res.status(400).json({ message: 'Valid price is required' });
    }

    await product.update({
      product_title: title !== undefined ? title.trim() : product.product_title,
      product_generic_name: genericName !== undefined ? (genericName?.trim() || null) : product.product_generic_name,
      product_salt: salt !== undefined ? (salt?.trim() || null) : product.product_salt,
      product_category: category !== undefined ? category : product.product_category,
      product_brand: brandId !== undefined ? brandId : product.product_brand,
      product_supplier: supplierId !== undefined ? supplierId : product.product_supplier,
      product_price: price !== undefined ? price : product.product_price,
      product_pack_price: packPrice !== undefined ? packPrice : product.product_pack_price,
      product_pack_size: packSize !== undefined ? packSize : product.product_pack_size,
      product_pack_description: packDescription !== undefined ? (packDescription?.trim() || null) : product.product_pack_description,
      product_min_threshold: minThreshold !== undefined ? minThreshold : product.product_min_threshold,
      product_requires_rx: requiresRx !== undefined ? requiresRx : product.product_requires_rx,
      product_description: description !== undefined ? (description?.trim() || null) : product.product_description,
      product_discount: discount !== undefined ? discount : product.product_discount,
      product_status: product.product_status
    });
    await synchronizeProductStatus([product.product_id]);
    await product.reload();

    // Get brand and supplier names
    const brand = await Brand.findByPk(product.product_brand);
    const supplier = await Supplier.findByPk(product.product_supplier);

    // Get current stock from stock_history
    const [stockInfo] = await sequelize.query(
      `SELECT 
        SUM(CASE WHEN expiry_date >= CURRENT_DATE AND remaining_quantity > 0 THEN remaining_quantity ELSE 0 END) as available_stock,
        MIN(CASE WHEN expiry_date >= CURRENT_DATE AND remaining_quantity > 0 THEN expiry_date ELSE NULL END) as nearest_expiry
      FROM stock_history 
      WHERE product_id = :productId`,
      { replacements: { productId: product.product_id } }
    );
    const stock = stockInfo[0] || { available_stock: 0, nearest_expiry: null };

    const formattedProduct = {
      id: `prod-${product.product_id}`,
      title: product.product_title,
      genericName: product.product_generic_name || '',
      salt: product.product_salt || '',
      category: product.product_category || '',
      brandId: product.product_brand,
      brandName: brand?.brand_name || '',
      supplierId: product.product_supplier,
      supplierName: supplier?.supplier_name || '',
      price: product.product_price,
      purchasePrice: product.product_purchase_price == null ? null : Number(product.product_purchase_price),
      packPrice: product.product_pack_price || 0,
      packSize: product.product_pack_size || 0,
      packDescription: product.product_pack_description || '',
      stockQty: stock.available_stock || 0,
      minThreshold: product.product_min_threshold || 0,
      expiryDate: stock.nearest_expiry || '',
      requiresRx: product.product_requires_rx || false,
      description: product.product_description || '',
      discount: product.product_discount || 0,
      status: product.product_status === 1 ? 'active' : 'inactive',
      createdBy: product.created_by || ''
    };

    res.json(formattedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    if (error.parent?.code === '23514') return res.status(400).json({ message: error.parent.message });
    res.status(500).json({ message: 'Error updating product', error: error.message });
  }
};

// Delete product
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const productId = id.replace('prod-', '');

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await sequelize.transaction(async transaction => {
      await sequelize.query('SELECT pg_advisory_xact_lock(44201, 17001)', { transaction });
      await product.update({ archived: true, product_status: 0 }, { transaction });
    });
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: 'Error deleting product', error: error.message });
  }
};

// Toggle product status
exports.toggleProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const productId = id.replace('prod-', '');

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await sequelize.transaction(async transaction => {
      await sequelize.query('SELECT pg_advisory_xact_lock(44201, 17001)', { transaction });
      await product.reload({ transaction, lock: transaction.LOCK.UPDATE });
      await product.update({ manually_inactive: product.product_status === 1 }, { transaction });
      await synchronizeProductStatus([product.product_id], transaction);
    });
    await product.reload();

    // Get brand and supplier names
    const brand = await Brand.findByPk(product.product_brand);
    const supplier = await Supplier.findByPk(product.product_supplier);

    const formattedProduct = {
      id: `prod-${product.product_id}`,
      title: product.product_title,
      genericName: product.product_generic_name || '',
      salt: product.product_salt || '',
      category: product.product_category || '',
      brandId: product.product_brand,
      brandName: brand?.brand_name || '',
      supplierId: product.product_supplier,
      supplierName: supplier?.supplier_name || '',
      price: product.product_price,
      packPrice: product.product_pack_price || 0,
      packSize: product.product_pack_size || 0,
      packDescription: product.product_pack_description || '',
      stockQty: product.product_stock_qty || 0,
      minThreshold: product.product_min_threshold || 0,
      expiryDate: product.product_expiry_date || '',
      requiresRx: product.product_requires_rx || false,
      description: product.product_description || '',
      discount: product.product_discount || 0,
      status: product.product_status === 1 ? 'active' : 'inactive',
      createdBy: product.created_by || ''
    };

    res.json(formattedProduct);
  } catch (error) {
    console.error('Error toggling product status:', error);
    res.status(500).json({ message: 'Error toggling product status', error: error.message });
  }
};


// Add/Update stock quantity for a product
exports.updateProductStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantityChange, operation = 'add' } = req.body;

    // Validate
    if (quantityChange === undefined || quantityChange === null) {
      return res.status(400).json({ message: 'Quantity change is required' });
    }

    const qty = Number(quantityChange);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({ message: 'Valid positive quantity is required' });
    }

    const productId = id.replace('prod-', '');
    const product = await Product.findByPk(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const currentStock = Number(product.product_stock_qty || 0);
    let newStock;

    if (operation === 'add') {
      // Add stock (for receiving/purchase)
      newStock = currentStock + qty;
    } else if (operation === 'subtract') {
      // Subtract stock (for sales/cart)
      newStock = Math.max(0, currentStock - qty); // Never go below 0
      
      if (currentStock < qty) {
        return res.status(400).json({ 
          message: `Insufficient stock. Available: ${currentStock}, Requested: ${qty}` 
        });
      }
    } else if (operation === 'set') {
      // Set exact stock
      newStock = qty;
    } else {
      return res.status(400).json({ message: 'Invalid operation. Use add, subtract, or set' });
    }

    await product.update({ product_stock_qty: newStock });

    // Get brand and supplier names
    const brand = await Brand.findByPk(product.product_brand);
    const supplier = await Supplier.findByPk(product.product_supplier);

    const formattedProduct = {
      id: `prod-${product.product_id}`,
      title: product.product_title,
      stockQty: newStock,
      previousStock: currentStock,
      brandName: brand?.brand_name || '',
      supplierName: supplier?.supplier_name || '',
      price: product.product_price
    };

    res.json({
      success: true,
      message: `Stock updated successfully. ${operation === 'add' ? 'Added' : operation === 'subtract' ? 'Subtracted' : 'Set'} ${qty} units.`,
      data: formattedProduct
    });
  } catch (error) {
    console.error('Error updating product stock:', error);
    res.status(500).json({ message: 'Error updating product stock', error: error.message });
  }
};

// Bulk update stock for multiple products (for stock receive)
exports.bulkUpdateStock = async (req, res) => {
  try {
    const { items } = req.body; // items: [{ productId, quantity, batchNumber, expiry, etc }]

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items array is required' });
    }

    const results = [];
    const errors = [];

    for (const item of items) {
      try {
        const productId = item.productId.toString().replace('prod-', '');
        const product = await Product.findByPk(productId);
        
        if (!product) {
          errors.push({ productId: item.productId, error: 'Product not found' });
          continue;
        }

        const qtyToAdd = Number(item.qty || item.quantity || 0) + Number(item.bonus || 0);
        const currentStock = Number(product.product_stock_qty || 0);
        const newStock = currentStock + qtyToAdd;

        await product.update({ product_stock_qty: newStock });

        results.push({
          productId: `prod-${product.product_id}`,
          title: product.product_title,
          previousStock: currentStock,
          addedQty: qtyToAdd,
          newStock: newStock
        });
      } catch (itemError) {
        errors.push({ productId: item.productId, error: itemError.message });
      }
    }

    res.json({
      success: true,
      message: `Stock updated for ${results.length} products`,
      data: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in bulk stock update:', error);
    res.status(500).json({ message: 'Error updating stock', error: error.message });
  }
};

// Get all available categories
exports.getCategories = async (req, res) => {
  try {
    const { MEDICINE_CATEGORIES, CATEGORY_DESCRIPTIONS } = require('../constants/categories');
    const [directory] = await sequelize.query(`SELECT category_name FROM medicine_categories
      WHERE status=1 ORDER BY display_order,category_name`);
    const allCategories = directory.map(row=>row.category_name);

    // Also get categories currently in use from database
    const [usedCategories] = await sequelize.query(`
      SELECT DISTINCT product_category 
      FROM product 
      WHERE product_category IS NOT NULL 
        AND product_category != ''
        AND archived = false
        AND product_category IN (SELECT category_name FROM medicine_categories WHERE status=1)
      ORDER BY product_category
    `);

    const usedCategoryNames = usedCategories.map(c => c.product_category);

    // Combine standard categories with used ones, remove duplicates

    res.json({
      success: true,
      data: {
        categories: allCategories,
        standardCategories: MEDICINE_CATEGORIES,
        usedCategories: usedCategoryNames,
        categoriesWithDescriptions: allCategories.map(cat => ({
          value: cat,
          label: cat,
          description: CATEGORY_DESCRIPTIONS[cat] || null
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching categories', 
      error: error.message 
    });
  }
};
