const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const transitMissionController = require('../controllers/transitMissionController');

router.post('/start', auth, transitMissionController.startParcours);
router.post('/select-transitaire', auth, transitMissionController.selectTransitaire);
router.post('/transferer', auth, transitMissionController.transfererMission);
router.get('/parcours/:articleId', auth, transitMissionController.getParcours);
router.get('/mes-missions', auth, transitMissionController.listMesMissions);
router.patch('/:id/marquer-traite', auth, transitMissionController.marquerTraite);
router.patch('/:id/rejeter-attribution', auth, transitMissionController.rejeterAttribution);
router.patch('/:id/details', auth, transitMissionController.updateDetails);

// Compatibilité ancienne route Flutter
router.get('/acceptes', auth, transitMissionController.listAcceptes);

module.exports = router;
