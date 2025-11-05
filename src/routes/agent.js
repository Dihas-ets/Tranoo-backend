const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const role = require('../middlewares/role');
const agentController = require('../controllers/agentController');

// Tableau de bord de l'agent commercial
router.get('/me/dashboard', auth, role('agentCommercial'), agentController.getMyDashboard);

// Leaderboard agents (auth requis, réservé aux agents pour l'instant)
router.get('/leaderboard', auth, role('agentCommercial'), agentController.getLeaderboard);

// Création d'un agent commercial (admin)
router.post('/', auth, role('superAdmin', 'principal', 'gestionnaire', 'admin'), agentController.createAgent);

module.exports = router;


