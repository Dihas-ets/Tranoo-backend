const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middlewares/auth');

// Route d'inscription (mobile et web)
router.post('/register', authController.register);
router.post('/web-session/start', auth, authController.startWebSession);
router.post('/web-session/end', auth, authController.endWebSession);

// Ancien système WhatsApp OTP supprimé - Remplacé par Push Notifications

module.exports = router; 