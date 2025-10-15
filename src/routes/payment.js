const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middlewares/auth');

// Initier un paiement FeexPay (nécessite auth pour associer user)
router.post('/feexpay/init', auth, paymentController.initPayment);

// RequestToPay par réseau (mtn, moov, celtiis_bj, coris, orange_sn, etc.)
router.post('/feexpay/requesttopay/:network', auth, paymentController.initRequestToPay);

// Paiement par carte
router.post('/feexpay/initcard', auth, paymentController.initCardPayment);

// Webhook FeexPay (publique, FeexPay doit pouvoir appeler)
router.post('/feexpay/webhook', express.json({ type: '*/*' }), paymentController.webhook);

// Récupérer une transaction spécifique par ID
router.get('/:id/details', auth, paymentController.getTransaction);

// Récupérer le statut d'un paiement par id ou transaction
router.get('/:id', auth, paymentController.getStatus);

// Statut public FeexPay (id_transaction de la redirection)
router.get('/feexpay/public/status/:id', paymentController.getPublicStatus);

// Tracer depuis le client (logs/hints) pour lier id_transaction
router.post('/feexpay/trace', paymentController.traceFromClient);

// Liste des paiements (historique)
router.get('/', auth, paymentController.list);

// Admin: forcer un statut (test uniquement)
router.post('/admin/:id/status', paymentController.adminSetStatus);

// Enregistrer un paiement FeexPay Flutter
router.post('/feexpay/flutter/record', auth, paymentController.recordFeexPayFlutter);

module.exports = router;


