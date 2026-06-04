/**
 * Configuration WhatsApp Cloud API (Meta).
 * Variables .env — voir whatsapp.env.example à la racine du projet.
 */
module.exports = {
  GRAPH_API_VERSION: process.env.WHATSAPP_GRAPH_API_VERSION || 'v22.0',
  TOKEN:
    process.env.WHATSAPP_TOKEN ||
    process.env.ACCESS_TOKEN ||
    process.env.WHATSAPP_API_TOKEN ||
    '',
  PHONE_NUMBER_ID:
    process.env.WHATSAPP_PHONE_ID ||
    process.env.PHONE_NUMBER_ID ||
    '',
  WABA_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',

  OTP_TEMPLATE_NAME: process.env.WHATSAPP_OTP_TEMPLATE_NAME || 'tranoo_reset_code',
  OTP_TEMPLATE_LANG: process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'fr',

  VERIFICATION_TEMPLATE_NAME:
    process.env.WHATSAPP_VERIFICATION_TEMPLATE_NAME || 'tranoo_verification_rapport',
  VERIFICATION_TEMPLATE_LANG:
    process.env.WHATSAPP_VERIFICATION_TEMPLATE_LANG || 'fr',
  VERIFICATION_PARAM_CUSTOMER_NAME:
    process.env.WHATSAPP_VERIFICATION_PARAM_CUSTOMER_NAME || 'customer_name',
  VERIFICATION_PARAM_VEHICLE_TITLE:
    process.env.WHATSAPP_VERIFICATION_PARAM_VEHICLE_TITLE || 'vehicle_title',
  VERIFICATION_PDF_FILENAME:
    process.env.WHATSAPP_VERIFICATION_PDF_FILENAME || 'rapport-verification-tranoo.pdf',
};
