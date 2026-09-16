const express = require('express');
const router  = express.Router();
const sc      = require('../controllers/supplierController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// ── Master ──────────────────────────────────────
router.get('/',    sc.getAllSuppliers);
router.post('/',   sc.createSupplier);
router.get('/with-accounts', sc.listSuppliersWithAccounts);   // list + balances
router.get('/:id', sc.getSupplierById);
router.put('/:id', sc.updateSupplier);
router.delete('/:id', sc.deleteSupplier);
router.patch('/:id/toggle-status', sc.toggleSupplierStatus);

// ── Accounts + Ledger ────────────────────────────
router.get('/:supplierId/detail',  sc.getSupplierDetail);     // full detail + ledger
router.get('/:supplierId/ledger',  sc.getSupplierLedger);     // ledger only
router.post('/:supplierId/payment', sc.recordSupplierPayment); // record payment (credit)
router.post('/:supplierId/refund',  sc.recordSupplierRefund);  // record refund (supplier pays us back)

module.exports = router;
