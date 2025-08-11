const express = require('express');
const router = express.Router();
const publiciteController = require('../controllers/publiciteController');
const authMiddleware = require('../middlewares/auth');

// Créer une demande de pub (authentifié)
router.post('/', authMiddleware, publiciteController.createPublicite);
// Lister les demandes (admin ou vendeur)
router.get('/', authMiddleware, publiciteController.getPublicites);
// Détail d'une demande
router.get('/:id', authMiddleware, publiciteController.getPubliciteById);
// Changer le statut d'une demande (admin uniquement)
router.put('/:id/statut', authMiddleware, publiciteController.updateStatut);
router.patch('/:id/statut', authMiddleware, publiciteController.updateStatut);
// Supprimer une demande (vendeur ou admin)
router.delete('/:id', authMiddleware, publiciteController.deletePublicite);

// 

module.exports = router; 