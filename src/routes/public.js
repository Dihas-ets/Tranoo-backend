

const express = require('express');
const router = express.Router();

// Réutilisation des controllers existants
const articleController = require('../controllers/articleController');
const userController = require('../controllers/userController');
const publiciteController = require('../controllers/publiciteController');
const publicVerificationPdfController = require('../controllers/publicVerificationPdfController');

// Endpoint public (sans auth): liste des articles (même logique que privé)
router.get('/articles', articleController.getArticlesPublic);

// Détail article (sans auth) — contact vendeur, médias, etc.
router.get('/articles/:id', articleController.getArticleById);

// Endpoint public (sans auth): liste des publicités visibles (statut valide)
router.get('/publicites', publiciteController.getPublicitesPublic);

// Endpoint public pour récupérer le numéro de téléphone par email
router.post('/users/phone-by-email', userController.getPhoneByEmail);

// PDF rapport vérification — URL publique pour Meta/WhatsApp (proxy, pas Cloudinary CDN)
router.get(
  '/verification-reports/:token',
  publicVerificationPdfController.serveVerificationReportPdf
);

module.exports = router;

