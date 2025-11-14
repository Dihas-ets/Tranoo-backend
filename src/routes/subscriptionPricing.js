const express = require('express');
const router = express.Router();
const subscriptionPricingController = require('../controllers/subscriptionPricingController');

router.get('/', subscriptionPricingController.getSubscriptionPricing);
router.post('/', subscriptionPricingController.updateSubscriptionPricing);
router.put('/', subscriptionPricingController.updateSubscriptionPricing);

module.exports = router;

