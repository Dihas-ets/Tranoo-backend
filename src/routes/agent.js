const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const role = require('../middlewares/role');
const agentController = require('../controllers/agentController');

const ADMIN_DASHBOARD_ROLES = [
  'superAdmin',
  'principal',
  'gestionnaire',
  'admin',
  'responsablePaiement',
  'moderateur',
  'marketing',
  'responsableService',
];

// Tableau de bord de l'agent commercial (vue agent)
router.get('/me/dashboard', auth, role('agentCommercial'), agentController.getMyDashboard);
router.post('/me/daily', auth, role('agentCommercial'), agentController.upsertMyDailyLog);
router.post('/me/daily/prospects/increment', auth, role('agentCommercial'), agentController.incrementMyProspects);
router.get('/me-tranoo/dashboard', auth, role('agentCommercial'), agentController.getMyDashboardTranoo);
router.post('/me-tranoo/daily', auth, role('agentCommercial'), agentController.upsertMyDailyLogTranoo);
router.post('/me-tranoo/daily/prospects/increment', auth, role('agentCommercial'), agentController.incrementMyProspectsTranoo);
router.get('/me-tranoo/leaderboard', auth, role('agentCommercial'), agentController.getLeaderboardTranoo);
router.get('/me-pro/dashboard', auth, role('agentCommercial'), agentController.getMyDashboardPro);
router.post('/me-pro/daily', auth, role('agentCommercial'), agentController.upsertMyDailyLogPro);
router.post('/me-pro/daily/prospects/increment', auth, role('agentCommercial'), agentController.incrementMyProspectsPro);
router.get('/me-pro/leaderboard', auth, role('agentCommercial'), agentController.getLeaderboardPro);

// Leaderboard agents (auth requis, réservé aux agents pour l'instant)
router.get('/leaderboard', auth, role('agentCommercial'), agentController.getLeaderboard);

// Création d'un agent commercial (admin)
router.post('/', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.createAgent);

// Routes admin statiques (AVANT /:id pour éviter que "withdrawals" soit pris pour un id)
router.get('/withdrawals', auth, role(...ADMIN_DASHBOARD_ROLES), agentController.getAllWithdrawalsForAdmin);
router.post('/admin/backfill-daily-presence', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.backfillDailyPresenceBonuses);
router.get('/admin/consolidated', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.getConsolidatedAdminStats);

// Stats de parrainage d'un agent (vue admin)
router.get('/:id/referral-stats', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.getAgentReferralStatsForAdmin);
router.get('/:id/pro-monitor', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.getAgentProDailyMonitorForAdmin);

// Liste des parrainages d'un agent (vue admin)
router.get('/:id/referrals', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.getAgentReferralsForAdmin);

// Enregistrer un retrait manuel pour un agent (vue admin)
router.post('/:id/withdrawals', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.registerAgentWithdrawal);
router.post('/:id/daily/observation', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.updateDailyObservationByAdmin);

module.exports = router;


