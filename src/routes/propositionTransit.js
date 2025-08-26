const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const ctrl = require('../controllers/propositionTransitController');

// Toutes ces routes nécessitent un transitaire connecté
router.use(auth);

router.get('/soumis', ctrl.listSoumis);
router.get('/soumettre', ctrl.listSoumettre);
router.get('/valides', ctrl.listValides);
router.post('/upsert', ctrl.upsertProposition);
router.post('/archive', ctrl.archiveProposition);
router.post('/valider', ctrl.validerProposition);
router.get('/archives', ctrl.listArchives);
router.get('/acceptes', ctrl.listAcceptes);
router.get('/propositions/:articleId', ctrl.getPropositionsForArticle);

module.exports = router;


