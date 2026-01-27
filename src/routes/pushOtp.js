const express = require('express');
const router = express.Router();
const pushOtpController = require('../controllers/pushOtpController');

/**
 * Nouveau flux "forgot password" sécurisé (deviceId-first)
 * - request: email + deviceId + fcmToken -> push OTP uniquement au device demandeur
 * - verify-code: requestId + deviceId + code -> vérifie OTP (3 essais max, 5 min)
 * - reset-password: requestId + deviceId + newPassword -> reset après vérif OTP
 */
router.post('/request', pushOtpController.requestPasswordReset);
router.post('/verify-code', pushOtpController.verifyPasswordResetOtp);
router.post('/reset-password', pushOtpController.resetPasswordWithOtp);

// (Legacy) Endpoints historiques (dépréciés). Gardés pour compatibilité.
router.post('/send-otp', pushOtpController.sendOTP);
router.post('/verify-otp', pushOtpController.verifyOTPAndResetPassword);

module.exports = router;
