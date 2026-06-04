/**
 * Règles auth centralisées (OTP WhatsApp, mot de passe, session web).
 * Variables .env optionnelles pour surcharger.
 */
module.exports = {
  OTP_LENGTH: Number(process.env.OTP_LENGTH || 6),
  OTP_TTL_MS: Number(process.env.OTP_TTL_MS || 10 * 60 * 1000),
  /** Délai après vérification OTP pour saisir le nouveau mot de passe */
  PASSWORD_RESET_AFTER_VERIFY_MS: Number(
    process.env.PASSWORD_RESET_AFTER_VERIFY_MS || 15 * 60 * 1000
  ),
  OTP_MAX_ATTEMPTS: Number(process.env.OTP_MAX_ATTEMPTS || 3),
  PASSWORD_MIN_LENGTH: Number(process.env.PASSWORD_MIN_LENGTH || 8),
  WEB_SESSION_IDLE_MS: Number(process.env.WEB_SESSION_IDLE_MS || 30 * 60 * 1000),
  WHATSAPP_OTP_TEMPLATE_NAME:
    process.env.WHATSAPP_OTP_TEMPLATE_NAME || 'tranoo_reset_code',
  WHATSAPP_OTP_TEMPLATE_LANG: process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'fr',
  /** Reset MDP : envoyer aussi le code par notification push (FCM) en plus de WhatsApp */
  RESET_FCM_FALLBACK: String(process.env.RESET_FCM_FALLBACK || 'true').toLowerCase() !== 'false',
};
