/**
 * Firebase App Check — activation optionnelle (phase 3 avancée).
 *
 * Prérequis :
 * 1. Activer App Check dans Firebase Console
 * 2. Configurer le fournisseur (reCAPTCHA Enterprise / Play Integrity / App Attest)
 * 3. Mettre FIREBASE_APP_CHECK_ENFORCED=true dans .env backend
 *
 * @see docs/CAPTCHA.md
 */
function isAppCheckEnforced() {
  return process.env.FIREBASE_APP_CHECK_ENFORCED === 'true';
}

/**
 * Middleware Express optionnel — à brancher sur les routes sensibles
 * une fois les apps Flutter configurées avec firebase_app_check.
 */
async function verifyAppCheck(req, res, next) {
  if (!isAppCheckEnforced()) return next();

  const token =
    req.headers['x-firebase-appcheck'] ||
    req.headers['x-firebase-app-check'];

  if (!token) {
    return res.status(403).json({
      code: 'APP_CHECK_REQUIRED',
      message: 'App Check requis pour cette action.',
    });
  }

  try {
    const admin = require('firebase-admin');
    await admin.appCheck().verifyToken(String(token));
    return next();
  } catch (error) {
    console.warn('[APP_CHECK] verify failed:', error?.message || error);
    return res.status(403).json({
      code: 'APP_CHECK_INVALID',
      message: 'Jeton App Check invalide.',
    });
  }
}

module.exports = { verifyAppCheck, isAppCheckEnforced };
