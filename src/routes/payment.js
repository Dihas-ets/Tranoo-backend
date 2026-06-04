const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middlewares/auth');

// Trace toute requête sur ce routeur (confirme que le mobile atteint bien /api/payments/...)
router.use((req, _res, next) => {
  console.log('[PAYMENTS_HTTP]', req.method, req.originalUrl || req.url);
  next();
});

// Initier un paiement FeexPay (nécessite auth pour associer user)
router.post('/feexpay/init', auth, paymentController.initPayment);

// RequestToPay par réseau (mtn, moov, celtiis_bj, coris, orange_sn, etc.)
router.post('/feexpay/requesttopay/:network', auth, paymentController.initRequestToPay);

// Paiement par carte
router.post('/feexpay/initcard', auth, paymentController.initCardPayment);

// Webhook FeexPay (publique, FeexPay doit pouvoir appeler)
router.post('/feexpay/webhook', express.json({ type: '*/*' }), paymentController.webhook);

// Tracer depuis le client (logs/hints) pour lier id_transaction
router.post('/feexpay/trace', paymentController.traceFromClient);

// Statut public FeexPay (id_transaction) — AVANT les routes /:id pour ne pas matcher "feexpay"
router.get('/feexpay/public/status/:id', paymentController.getPublicStatus);

// Enregistrer un paiement FeexPay Flutter (auth + avant GET / pour éviter tout conflit)
router.post('/feexpay/flutter/record', auth, paymentController.recordFeexPayFlutter);

// Liste des paiements (historique) — AVANT /:id sinon jamais atteinte
router.get('/', auth, paymentController.list);

// Récupérer une transaction spécifique par ID
router.get('/:id/details', auth, paymentController.getTransaction);

// Récupérer le statut d'un paiement par id ou transaction
router.get('/:id', auth, paymentController.getStatus);

// Admin: forcer un statut (test uniquement)
router.post('/admin/:id/status', paymentController.adminSetStatus);

module.exports = router;
