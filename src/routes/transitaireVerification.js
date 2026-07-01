const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const controller = require('../controllers/transitaireVerificationController');

router.get('/status', auth, controller.getMyStatus);
router.post('/submit', auth, controller.submitVerification);

router.get('/admin/demandes', auth, controller.listDemandes);
router.get('/admin/demandes/:userId', auth, controller.getDemandeByUserId);
router.patch('/admin/demandes/:userId/approve', auth, controller.approveDemande);
router.patch('/admin/demandes/:userId/reject', auth, controller.rejectDemande);

module.exports = router;
