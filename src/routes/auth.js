const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Route d'inscription (mobile et web)
router.post('/register', authController.register);

// Ancien système WhatsApp OTP supprimé - Remplacé par Push Notifications

module.exports = router; 