const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brandController');
const { authenticateToken } = require('../middleware/auth');

// All brand routes require authentication
router.use(authenticateToken);
router.get('/', brandController.getAllBrands);
router.post('/', brandController.createBrand);
router.put('/:id', brandController.updateBrand);
router.delete('/:id', brandController.deleteBrand);
router.patch('/:id/toggle-status', brandController.toggleBrandStatus);

module.exports = router;
