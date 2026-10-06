const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticateToken } = require('../middleware/auth');
const { findCurrentMarketProduct } = require('../services/marketProductService');
router.get('/:id/active-batch', async (req, res) => {
  try {
    const batch = await findCurrentMarketProduct(req.params.id.replace(/^prod-/, ''));
    res.json({ success: true, batch });
  } catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Failed to load active batch.' }); }
});

// Public routes for storefront (no authentication required)
// GET /api/products - Get all products (public for customer browsing)
router.get('/', productController.getAllProducts);

// GET /api/products/categories - Get all medicine categories (public)
router.get('/categories', productController.getCategories);

// GET /api/products/stock-check/:id - Live stock check for storefront (public)
router.get('/stock-check/:id', async (req, res) => {
  try {
    const productId = req.params.id.replace(/^prod-/, '');
    const batch = await findCurrentMarketProduct(productId);
    res.json({ success: true, productId, activeProductId: batch?.product_id || null, batchId: batch?.batch_id || null,
      price: batch ? Number(batch.product_price) : null,
      name: batch?.product_title || null, fifoBatches: batch?.fifoBatches || [],
      stockQty: batch ? Number(batch.available) : 0 });
  } catch(e) {
    res.status(e.status || 500).json({ success: false, stockQty: 0 });
  }
});

// Protected routes (require authentication)
router.use(authenticateToken);
router.patch('/:id/sale-price', productController.setSalePrice);

// POST /api/products - Create new product
router.post('/', productController.createProduct);

// PUT /api/products/:id - Update product
router.put('/:id', productController.updateProduct);

// DELETE /api/products/:id - Delete product
router.delete('/:id', productController.deleteProduct);

// PATCH /api/products/:id/toggle-status - Toggle product status
router.patch('/:id/toggle-status', productController.toggleProductStatus);

// PATCH /api/products/:id/stock - Update product stock
router.patch('/:id/stock', productController.updateProductStock);

// POST /api/products/bulk-stock-update - Bulk update stock for multiple products
router.post('/bulk-stock-update', productController.bulkUpdateStock);

module.exports = router;
