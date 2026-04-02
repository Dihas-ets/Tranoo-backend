const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const tricycleController = require('../controllers/tricycleController');

// Toutes les routes tricycle sont authentifiées
router.use(auth);

// Position / statut chauffeur
router.post('/location', tricycleController.updateMyLocation);
router.post('/chauffeur/status', tricycleController.setChauffeurAvailability);
router.get('/chauffeur/status', tricycleController.getMyChauffeurAvailability);

// Côté utilisateur (Tranoo): liste chauffeurs proches + init contact
router.get('/nearby', tricycleController.getNearbyChauffeurs);
router.post('/:chauffeurId/contact', tricycleController.createContact);

// Contacts
router.get('/contacts/incoming', tricycleController.getIncomingContacts); // chauffeur
router.get('/contacts/my', tricycleController.getMyContacts); // acheteur
router.get('/contacts/:id', tricycleController.getContactDetails);
router.post('/contacts/:id/accept', tricycleController.acceptContact);
router.post('/contacts/:id/read', tricycleController.markContactAsRead);
router.post('/contacts/:id/close', tricycleController.closeContact);

module.exports = router;

