const express = require('express');
const router = express.Router();
const viewsController = require('../controllers/viewsController');
const authMiddleware = require('../middlewares/auth');

// Enregistrer une vue pour un article (authentifié ou non)
router.post('/articles/:articleId/view', viewsController.recordView);

// Obtenir les statistiques de vues pour un article
router.get('/articles/:articleId/views', viewsController.getArticleViews);

// Obtenir les articles les plus vus
router.get('/articles/most-viewed', viewsController.getMostViewedArticles);

// Mettre à jour les vues en lot (admin seulement)
router.post('/batch-update', authMiddleware, viewsController.batchUpdateViews);

module.exports = router;
