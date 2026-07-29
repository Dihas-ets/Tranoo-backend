const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const verificationController = require('../controllers/verificationController');

// Mobile : demande de vérification après paiement
router.post('/request', auth, verificationController.requestVerification);

// Admin : liste des demandes de vérification
router.get('/admin/requests', auth, verificationController.listVerificationRequests);

// Admin : mise à jour du statut de vérification d'un article
router.patch('/admin/requests/:articleId/statut', auth, verificationController.updateVerificationStatut);

// Admin : statistiques pour badges/sidebar
router.get('/admin/stats', auth, verificationController.getVerificationStats);

module.exports = router;
