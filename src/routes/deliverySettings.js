const express = require('express');
const router = express.Router();
const deliverySettingsController = require('../controllers/deliverySettingsController');
const auth = require('../middlewares/auth');
const role = require('../middlewares/role');
const ADMIN_ROLES = ['admin', 'superAdmin', 'principal', 'gestionnaire', 'responsablePaiement'];

// Routes publiques (pour calcul des frais)
router.get('/calculate', deliverySettingsController.calculateDeliveryFees);

// Routes admin
router.get('/', auth, role(...ADMIN_ROLES), deliverySettingsController.getDeliverySettings);
router.post('/', auth, role(...ADMIN_ROLES), deliverySettingsController.updateDeliverySettings);
router.put('/', auth, role(...ADMIN_ROLES), deliverySettingsController.updateDeliverySettings);

module.exports = router;
