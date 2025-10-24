const express = require('express');
const router = express.Router();
const pubPricingController = require('../controllers/pubPricingController');

router.get('/', pubPricingController.getPubPricing);
router.post('/', pubPricingController.updatePubPricing);

module.exports = router;