const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const deliveryController = require('../controllers/deliveryController');

// Création et récupération
router.post('/', auth, deliveryController.createDelivery);
router.get('/pending', auth, deliveryController.getPendingDeliveries);
router.get('/active', auth, deliveryController.getActiveDeliveries);
router.get('/history', auth, deliveryController.getDeliveryHistory);
router.get('/:id', auth, deliveryController.getDeliveryDetails);

// Actions livreur
router.post('/:id/accept', auth, deliveryController.acceptDelivery);
router.post('/:id/reject', auth, deliveryController.rejectDelivery);
router.post('/:id/pickup', auth, deliveryController.notifyPickup);
router.post('/:id/deliver', auth, deliveryController.notifyDelivery);
router.post('/:id/refuse', auth, deliveryController.notifyRefusal);
router.post('/:id/return', auth, deliveryController.notifyReturn);
router.post('/:id/location', auth, deliveryController.updateLocation);

// Confirmation acheteur
router.post('/:id/confirm', auth, deliveryController.confirmDelivery);

module.exports = router;
