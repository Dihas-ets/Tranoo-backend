const express = require('express');
const router = express.Router();
const sellerGainPricingController = require('../controllers/sellerGainPricingController');

router.get('/', sellerGainPricingController.getSellerGainPricing);
router.put('/', sellerGainPricingController.updateSellerGainPricing);
router.post('/', sellerGainPricingController.updateSellerGainPricing);

module.exports = router;
