const express = require('express');
const router = express.Router();
const transitaireSubscriptionPricingController = require('../controllers/transitaireSubscriptionPricingController');

router.get('/', transitaireSubscriptionPricingController.getTransitaireSubscriptionPricing);
router.post('/', transitaireSubscriptionPricingController.updateTransitaireSubscriptionPricing);
router.put('/', transitaireSubscriptionPricingController.updateTransitaireSubscriptionPricing);

module.exports = router;
