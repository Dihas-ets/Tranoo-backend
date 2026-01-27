const express = require('express');
const router = express.Router();
const articleController = require('../controllers/articleController');
const authMiddleware = require('../middlewares/auth');
const { getAchatsByAcheteur, updateDateLivraison } = require('../controllers/articleController');

// Créer un article (authentifié)
router.post('/', authMiddleware, articleController.createArticle);
// Lister les articles (public ou authentifié)
router.get('/', articleController.getArticles);
// Détail d'un article
router.get('/:id', articleController.getArticleById);
// Mettre à jour un article (authentifié)
router.put('/:id', authMiddleware, articleController.updateArticle);
// Supprimer un article (authentifié)
router.delete('/:id', authMiddleware, articleController.deleteArticle);
// Changer le statut d'un article (admin uniquement)
router.put('/:id/statut', authMiddleware, articleController.updateStatut);
// Rupture / disponible (vendeur ou admin)
router.patch('/:id/stock', authMiddleware, articleController.updateStockStatus);
// Marquer un article comme vendu
router.put('/:id/vendu', articleController.markAsSold);
router.get('/achats/:acheteurId', getAchatsByAcheteur);
router.patch('/:id/livraison', authMiddleware, updateDateLivraison);


module.exports = router; 