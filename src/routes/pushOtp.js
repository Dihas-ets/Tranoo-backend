const express = require('express');
const router = express.Router();
const pushOtpController = require('../controllers/pushOtpController');

// Route pour envoyer OTP via FCM
router.post('/send-otp', pushOtpController.sendOTP);

// Route pour vérifier seulement le code OTP
router.post('/verify-code', pushOtpController.verifyOTPCode);

// Route pour vérifier OTP et réinitialiser mot de passe
router.post('/verify-otp', pushOtpController.verifyOTPAndResetPassword);

module.exports = router;
