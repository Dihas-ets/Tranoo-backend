const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const role = require('../middlewares/role');
const agentController = require('../controllers/agentController');

// Tableau de bord de l'agent commercial (vue agent)
router.get('/me/dashboard', auth, role('agentCommercial'), agentController.getMyDashboard);

// Leaderboard agents (auth requis, réservé aux agents pour l'instant)
router.get('/leaderboard', auth, role('agentCommercial'), agentController.getLeaderboard);

// Création d'un agent commercial (admin)
router.post('/', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.createAgent);

// Stats de parrainage d'un agent (vue admin)
router.get('/:id/referral-stats', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.getAgentReferralStatsForAdmin);

// Liste des parrainages d'un agent (vue admin)
router.get('/:id/referrals', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.getAgentReferralsForAdmin);

// Enregistrer un retrait manuel pour un agent (vue admin)
router.post('/:id/withdrawals', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.registerAgentWithdrawal);

// Historique global des retraits (vue admin)
router.get('/withdrawals', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.getAllWithdrawalsForAdmin);

module.exports = router;


