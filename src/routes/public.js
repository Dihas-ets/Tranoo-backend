



const express = require('express');
const router = express.Router();

// Réutilisation du controller existant
const articleController = require('../controllers/articleController');

// Endpoint public (sans auth): liste des articles (même logique que privé)
router.get('/articles', articleController.getArticlesPublic);

module.exports = router;

