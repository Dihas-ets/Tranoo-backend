const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const invoiceController = require('../controllers/invoiceController');

router.get('/my', auth, invoiceController.getMyInvoices);
router.patch('/my/read-all', auth, invoiceController.markAllInvoicesAsRead);
router.patch('/:id/read', auth, invoiceController.markInvoiceAsRead);

module.exports = router;
