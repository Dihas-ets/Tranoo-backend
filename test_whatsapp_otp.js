/**
 * Test envoi OTP mot de passe oublié (template Meta).
 *
 * Prérequis .env :
 *   PHONE_NUMBER_ID=1019497624570675     ← numéro +229 (PAS le WABA)
 *   WHATSAPP_BUSINESS_ACCOUNT_ID=916217037413050  ← dossier business (optionnel envoi)
 *   ACCESS_TOKEN ou WHATSAPP_TOKEN
 *
 * Usage :
 *   node test_whatsapp_otp.js 22941839801
 *   node test_whatsapp_otp.js 22959399349 482901
 */
require('dotenv').config();

const {
  sendWhatsAppOtpCode,
  formatMetaError,
  resolveSenderPhoneNumber,
} = require('./src/utils/whatsappService');
const waConfig = require('./src/config/whatsappConfig');

async function main() {
  const phone = process.argv[2];
  const code = process.argv[3] || String(Math.floor(100000 + Math.random() * 900000));

  if (!phone) {
    console.error('Usage: node test_whatsapp_otp.js <telephone_sans_plus> [code_6_chiffres]');
    process.exit(1);
  }

  console.log('=== test_whatsapp_otp ===');
  console.log('PHONE_NUMBER_ID (.env)      :', waConfig.PHONE_NUMBER_ID);
  console.log('WHATSAPP_BUSINESS_ACCOUNT_ID:', waConfig.WABA_ID || '(vide)');
  console.log('Template                    :', waConfig.OTP_TEMPLATE_NAME, '/', waConfig.OTP_TEMPLATE_LANG);
  console.log('Destinataire test            :', phone, '| Code:', code);
  console.log('');

  if (waConfig.PHONE_NUMBER_ID === waConfig.WABA_ID) {
    console.error(
      'ERREUR: PHONE_NUMBER_ID et WHATSAPP_BUSINESS_ACCOUNT_ID sont identiques dans .env.'
    );
    console.error('PHONE_NUMBER_ID doit être 1019497624570675 (+229), pas le WABA 916217037413050.');
    process.exit(1);
  }

  try {
    const { sender } = await resolveSenderPhoneNumber();
    console.log('Preflight OK — expéditeur:', sender.display_phone_number, `(${sender.verified_name})`);
    console.log('');
    const result = await sendWhatsAppOtpCode({ phone, code });
    console.log('OK', JSON.stringify(result.meta, null, 2));
  } catch (err) {
    console.error('ÉCHEC', JSON.stringify(formatMetaError(err), null, 2));
    if (err.code === 'whatsapp_wrong_phone_number_id') {
      console.error(err.message);
    }
    process.exit(1);
  }
}

main();
