const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const role = require('../middlewares/role');
const optionalAuth = require('../middlewares/optionalAuth');
const prospectController = require('../controllers/prospectController');

router.get(
  '/installment-payment-stats',
  auth,
  role('admin', 'superAdmin', 'principal', 'gestionnaire'),
  prospectController.getInstallmentPaymentStats,
);
router.post(
  '/installment-payment-click',
  optionalAuth,
  prospectController.trackInstallmentPaymentClick,
);
router.post(
  '/installment-payment-interest',
  auth,
  prospectController.markInstallmentPaymentProspect,
);

module.exports = router;
