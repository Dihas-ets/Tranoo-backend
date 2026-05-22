const express = require('express');
const router = express.Router();
const pushOtpController = require('../controllers/pushOtpController');

/**
 * Mot de passe oublié — OTP WhatsApp uniquement (numéro du compte)
 * - request: telephone (+ indicatif) -> code WhatsApp
 * - verify-code: requestId + deviceId (clé téléphone) + code
 * - reset-password: requestId + deviceId + newPassword
 */
router.post('/request', pushOtpController.requestPasswordReset);
router.post('/verify-code', pushOtpController.verifyPasswordResetOtp);
router.post('/reset-password', pushOtpController.resetPasswordWithOtp);

// (Legacy) Endpoints historiques (dépréciés). Gardés pour compatibilité.
router.post('/send-otp', pushOtpController.sendOTP);
router.post('/verify-otp', pushOtpController.verifyOTPAndResetPassword);

module.exports = router;
