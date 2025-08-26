const express = require('express');
const router = express.Router();

// Reuse existing article controller logic
const articleController = require('../controllers/articleController');

// Public endpoint: list articles without auth
// Controller already restricts unauthenticated requests to statut='en_ligne'
router.get('/articles', articleController.getArticles);

module.exports = router;

