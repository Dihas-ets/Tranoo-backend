const express = require('express');
const router = express.Router();
const livreurController = require('../controllers/livreurController');
const auth = require('../middlewares/auth');

// Toggle statut en ligne/hors ligne
router.post('/toggle-status', auth, livreurController.toggleStatus);

// Récupérer le statut actuel
router.get('/status', auth, livreurController.getStatus);

// Mettre à jour la localisation GPS
router.post('/location', auth, livreurController.updateLocation);

// Récupérer les livraisons en attente
router.get('/deliveries/pending', auth, livreurController.getPendingDeliveries);

// Récupérer les livraisons actives
router.get('/deliveries/active', auth, livreurController.getActiveDeliveries);

// Accepter une livraison
router.post('/deliveries/:id/accept', auth, livreurController.acceptDelivery);

// Compléter une livraison
router.post('/deliveries/:id/complete', auth, livreurController.completeDelivery);

// Récupérer l'historique des livraisons
router.get('/deliveries/history', auth, livreurController.getDeliveryHistory);

module.exports = router;

