const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middlewares/auth');
const verifyCaptcha = require('../middlewares/verifyCaptcha');
const authRateLimit = require('../middlewares/authRateLimit');

router.use(authRateLimit);

// Doc OpenAPI : src/docs/openapi/paths/01-health-auth.js
router.post('/register', verifyCaptcha, authController.register);
router.post('/web-session/start', auth, authController.startWebSession);
router.post('/web-session/end', auth, authController.endWebSession);

// Ancien système WhatsApp OTP supprimé - Remplacé par Push Notifications

module.exports = router; 