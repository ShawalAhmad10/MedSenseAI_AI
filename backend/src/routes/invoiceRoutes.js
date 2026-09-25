const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { authenticateToken } = require('../middleware/auth');
const { verifyCustomerToken } = require('../middleware/customerAuth');

// ── Customer-facing routes (no pharmacist auth needed) ──────────────────────
// POST /api/invoice/customer-return  — storefront customer submits a return (14-day rule)
router.post('/customer-return', verifyCustomerToken, invoiceController.createCustomerReturn);
// GET  /api/invoice/customer-returns — storefront customer views their own returns
router.get('/customer-returns',  verifyCustomerToken, invoiceController.listCustomerReturns);

// All pharmacist routes below require pharmacist authentication
router.use(authenticateToken);

// GET /api/invoice/stats - Get invoice statistics
router.get('/stats', invoiceController.getInvoiceStats);

// GET /api/invoice/report - Invoice Report (invoice_report with profit)
router.get('/report', invoiceController.listInvoiceReport);

// GET /api/invoice/return-report - Invoice Return Report (invoice_return_report)
router.get('/return-report', invoiceController.listInvoiceReturnReport);

// Invoice Return Routes (MUST come before /:id routes)
// POST /api/invoice/returns - Create invoice return
router.post('/returns', invoiceController.createInvoiceReturn);

// GET /api/invoice/returns - Get all invoice returns
router.get('/returns', invoiceController.listInvoiceReturns);

// GET /api/invoice/returns/:id - Get single invoice return
router.get('/returns/:id', invoiceController.getInvoiceReturn);

// PATCH /api/invoice/returns/:id/status - Update refund status (pharmacist marks as refunded)
router.patch('/returns/:id/status', invoiceController.updateReturnStatus);

// GET /api/invoice - Get all invoice
router.get('/', invoiceController.listInvoices);

// GET /api/invoice/:id - Get single invoice
router.get('/:id', invoiceController.getInvoice);

// POST /api/invoice - Create new invoice
router.post('/', invoiceController.createInvoice);

// PATCH /api/invoice/:id/status - Update invoice status
router.patch('/:id/status', invoiceController.updateInvoiceStatus);

// DELETE /api/invoice/:id - Delete invoice
router.delete('/:id', invoiceController.deleteInvoice);

module.exports = router;
