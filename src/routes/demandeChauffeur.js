const express = require('express');
const router = express.Router();
const demandeChauffeurController = require('../controllers/demandeChauffeurController');
const authMiddleware = require('../middlewares/auth');

// Créer une demande de certification (authentifié)
router.post('/', authMiddleware, demandeChauffeurController.createDemande);
// Lister les demandes (admin ou chauffeur)
router.get('/', authMiddleware, demandeChauffeurController.getDemandes);
// Détail d'une demande
router.get('/:id', authMiddleware, demandeChauffeurController.getDemandeById);
// Changer le statut d'une demande (admin uniquement)
router.put('/:id/statut', authMiddleware, demandeChauffeurController.updateStatut);
// Supprimer une demande (admin ou chauffeur)
router.delete('/:id', authMiddleware, demandeChauffeurController.deleteDemande);

module.exports = router; 