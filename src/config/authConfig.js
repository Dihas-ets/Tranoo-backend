/**
 * Règles auth centralisées (OTP WhatsApp, mot de passe, session web).
 * Variables .env optionnelles pour surcharger.
 */
module.exports = {
  OTP_LENGTH: Number(process.env.OTP_LENGTH || 6),
  OTP_TTL_MS: Number(process.env.OTP_TTL_MS || 5 * 60 * 1000),
  OTP_MAX_ATTEMPTS: Number(process.env.OTP_MAX_ATTEMPTS || 3),
  PASSWORD_MIN_LENGTH: Number(process.env.PASSWORD_MIN_LENGTH || 8),
  WEB_SESSION_IDLE_MS: Number(process.env.WEB_SESSION_IDLE_MS || 30 * 60 * 1000),
  WHATSAPP_OTP_TEMPLATE_NAME: process.env.WHATSAPP_OTP_TEMPLATE_NAME || 'otp_code',
  WHATSAPP_OTP_TEMPLATE_LANG: process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'fr',
};
