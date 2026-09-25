const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticateToken } = require('../middleware/auth');

// Public routes for storefront (no authentication required)
// GET /api/products - Get all products (public for customer browsing)
router.get('/', productController.getAllProducts);

// GET /api/products/categories - Get all medicine categories (public)
router.get('/categories', productController.getCategories);

// GET /api/products/stock-check/:id - Live stock check for storefront (public)
router.get('/stock-check/:id', async (req, res) => {
  try {
    const { sequelize } = require('../config/database');
    const productId = req.params.id.replace(/^prod-/, '');
    const [row] = await sequelize.query(
      `SELECT COALESCE(SUM(remaining_quantity),0) AS stock_qty
       FROM stock_history WHERE product_id = :pid AND status = 1`,
      { replacements: { pid: productId }, type: sequelize.QueryTypes.SELECT }
    );
    res.json({ success: true, productId, stockQty: Number(row?.stock_qty || 0) });
  } catch(e) {
    res.status(500).json({ success: false, stockQty: 0 });
  }
});

// Protected routes (require authentication)
router.use(authenticateToken);

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
