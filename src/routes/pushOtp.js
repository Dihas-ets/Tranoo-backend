const express = require('express');
const router = express.Router();
const pushOtpController = require('../controllers/pushOtpController');

router.use((req, res, next) => {
  console.log(`[RESET] >>> ${req.method} ${req.originalUrl}`);
  next();
});

/**
 * Mot de passe oublié — OTP WhatsApp + fallback notification push (FCM)
 * - request: telephone (+ indicatif, fcmToken optionnel) -> code WhatsApp et/ou push
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
