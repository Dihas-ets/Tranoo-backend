const express = require('express');
const router = express.Router();
const deliverySettingsController = require('../controllers/deliverySettingsController');
const auth = require('../middlewares/auth');
const role = require('../middlewares/role');

// Routes publiques (pour calcul des frais)
router.get('/calculate', deliverySettingsController.calculateDeliveryFees);

// Routes admin
router.get('/', auth, role('admin'), deliverySettingsController.getDeliverySettings);
router.post('/', auth, role('admin'), deliverySettingsController.updateDeliverySettings);

module.exports = router;
