const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const authMiddleware = require('../middlewares/auth');

// Routes protégées pour les utilisateurs
router.get('/stats', authMiddleware, referralController.getUserReferralStats);
router.get('/my-referrals', authMiddleware, referralController.getUserReferrals);
router.post('/create', authMiddleware, referralController.createReferral);
router.put('/complete/:referralId', authMiddleware, referralController.completeReferral);

// Routes pour l'admin
router.get('/all', authMiddleware, referralController.getAllReferrals);
router.get('/settings', authMiddleware, referralController.getReferralSettings);
router.put('/settings', authMiddleware, referralController.updateReferralSettings);

module.exports = router;
