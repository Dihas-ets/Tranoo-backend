



const express = require('express');
const router = express.Router();

// Réutilisation du controller existant
const articleController = require('../controllers/articleController');
const userController = require('../controllers/userController');

// Endpoint public (sans auth): liste des articles (même logique que privé)
router.get('/articles', articleController.getArticlesPublic);

// Endpoint public pour récupérer le numéro de téléphone par email
router.post('/users/phone-by-email', userController.getPhoneByEmail);

module.exports = router;

