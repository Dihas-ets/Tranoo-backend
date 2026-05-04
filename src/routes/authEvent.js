const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const authEventController = require('../controllers/authEventController');

// Mobile: journaliser les connexions / déconnexions (pour KPI "démonstrations")
router.post('/login', auth, authEventController.recordLogin);
router.post('/logout', auth, authEventController.recordLogout);

module.exports = router;

