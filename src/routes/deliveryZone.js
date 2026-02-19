const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const deliveryZoneController = require('../controllers/deliveryZoneController');

// Routes publiques
router.get('/', deliveryZoneController.getDeliveryZones);
router.get('/point', deliveryZoneController.getZoneForPoint);
router.post('/calculate-fee', deliveryZoneController.calculateDeliveryFeeWithZones);

// Routes admin uniquement
router.post('/', auth, deliveryZoneController.createDeliveryZone);
router.put('/:id', auth, deliveryZoneController.updateDeliveryZone);
router.delete('/:id', auth, deliveryZoneController.deleteDeliveryZone);

module.exports = router;
