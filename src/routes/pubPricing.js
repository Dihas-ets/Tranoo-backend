const express = require('express');
const router = express.Router();
const pubPricingController = require('../controllers/pubPricingController');
const authMiddleware = require('../middlewares/auth');

// Route publique pour récupérer les prix
router.get('/pub-pricing', pubPricingController.getPubPricing);

// Route admin pour mettre à jour les prix (sans auth pour test)
router.put('/pub-pricing', pubPricingController.updatePubPricing);

module.exports = router;