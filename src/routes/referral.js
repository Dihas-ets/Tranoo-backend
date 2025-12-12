const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const authMiddleware = require('../middlewares/auth');
const role = require('../middlewares/role');

// Routes protégées pour les utilisateurs 
router.get('/stats', authMiddleware, referralController.getUserReferralStats);
router.get('/my-referrals', authMiddleware, referralController.getUserReferrals);
router.get('/monthly-stats', authMiddleware, referralController.getMonthlyReferralStats);
router.post('/create', authMiddleware, referralController.createReferral);
router.put('/complete/:referralId', authMiddleware, referralController.completeReferral);

// Routes pour l'admin (restreint aux rôles admin)
const ADMIN_ROLES = ['admin', 'superAdmin', 'principal', 'moderateur', 'gestionnaire'];
router.get('/all', authMiddleware, role(...ADMIN_ROLES), referralController.getAllReferrals);
router.get('/settings', authMiddleware, role(...ADMIN_ROLES), referralController.getReferralSettings);
router.put('/settings', authMiddleware, role(...ADMIN_ROLES), referralController.updateReferralSettings);

module.exports = router;
