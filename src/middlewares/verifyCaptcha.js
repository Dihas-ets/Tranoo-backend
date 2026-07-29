const admin = require('firebase-admin');
const User = require('../models/User');
const { verifyTurnstileToken, isCaptchaEnabled } = require('../utils/turnstile');
const { ErrorCodes, sendError } = require('../utils/apiResponse');

const ADMIN_ROLES = new Set([
  'admin',
  'superAdmin',
  'principal',
  'gestionnaire',
]);

const MOBILE_REGISTER_ROLES = new Set([
  'acheteur',
  'vendeur',
  'livreur',
  'chauffeur',
  'transitaire',
]);

async function shouldSkipCaptcha(req) {
  if (!isCaptchaEnabled()) return true;

  // Inscription mobile (tranoo / tranoo_pro) : pas de CAPTCHA sur les apps.
  const authApp = String(req.body?.authApp || '').toLowerCase();
  if (authApp === 'tranoo' || authApp === 'tranoo_pro') {
    return true;
  }

  const role = String(req.body?.role || '').toLowerCase();
  if (MOBILE_REGISTER_ROLES.has(role)) {
    return true;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;

  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    const user = await User.findOne({ uid: decoded.uid }).select('role typeAdmin');
    if (!user) return false;
    return ADMIN_ROLES.has(user.role) || ADMIN_ROLES.has(user.typeAdmin);
  } catch {
    return false;
  }
}

/**
 * Exige un captchaToken valide sur les inscriptions web publiques.
 * Exempté :
 * - CAPTCHA_ENABLED=false
 * - authApp = tranoo | tranoo_pro (apps mobiles — pas de CAPTCHA pour l'instant)
 * - rôles mobiles (acheteur, vendeur, livreur, chauffeur, transitaire)
 * - admins dashboard (Bearer + rôle admin)
 */
async function verifyCaptcha(req, res, next) {
  try {
    if (await shouldSkipCaptcha(req)) return next();

    const token =
      req.body?.captchaToken ||
      req.headers['x-captcha-token'] ||
      req.headers['x-turnstile-token'];

    const remoteIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

    const result = await verifyTurnstileToken(token, remoteIp);
    if (result.skipped) return next();

    if (!result.success) {
      return sendError(res, 403, ErrorCodes.CAPTCHA_INVALID, {}, req);
    }

    return next();
  } catch (error) {
    console.error('[CAPTCHA] verifyCaptcha:', error);
    return sendError(res, 500, ErrorCodes.CAPTCHA_ERROR, {}, req);
  }
}

module.exports = verifyCaptcha;
