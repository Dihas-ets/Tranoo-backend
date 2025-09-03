const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middlewares/auth');

// Initier un paiement FeexPay (nécessite auth pour associer user)
router.post('/feexpay/init', auth, paymentController.initPayment);

// Webhook FeexPay (publique, FeexPay doit pouvoir appeler)
router.post('/feexpay/webhook', express.json({ type: '*/*' }), paymentController.webhook);

// Récupérer le statut d'un paiement par id ou transaction
router.get('/:id', auth, paymentController.getStatus);

// Statut public FeexPay (id_transaction de la redirection)
router.get('/feexpay/public/status/:id', paymentController.getPublicStatus);

module.exports = router;


