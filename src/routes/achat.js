const express = require('express');
const router = express.Router();
const achatController = require('../controllers/achatController');
const auth = require('../middlewares/auth');

// Enregistrer un achat (validation des infos de paiement/sélection)
router.post('/', auth, achatController.createAchat);
// Achat en lot depuis le panier
router.post('/bulk', auth, achatController.createBulkAchats);

module.exports = router;


