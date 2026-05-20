const express = require('express');
const router = express.Router();
const verificationPricingController = require('../controllers/verificationPricingController');

router.get('/', verificationPricingController.getVerificationPricing);
router.put('/', verificationPricingController.updateVerificationPricing);
router.post('/', verificationPricingController.updateVerificationPricing);

module.exports = router;
