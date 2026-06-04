/**
 * Test envoi rapport de vérification PDF (template Meta + en-tête document).
 *
 * Prérequis :
 * - .env : WHATSAPP_TOKEN + PHONE_NUMBER_ID
 * - Template approuvé : WHATSAPP_VERIFICATION_TEMPLATE_NAME (défaut tranoo_verification_rapport)
 * - pdfUrl : lien HTTPS public (Cloudinary), accessible sans login
 *
 * Usage :
 *   node test_whatsapp_verification_pdf.js 22959399349 https://res.cloudinary.com/.../rapport.pdf
 */
require('dotenv').config();

const {
  sendWhatsAppVerificationDocument,
  formatMetaError,
} = require('./src/utils/whatsappService');
const waConfig = require('./src/config/whatsappConfig');

async function main() {
  const phone = process.argv[2];
  const pdfUrl = process.argv[3];

  if (!phone || !pdfUrl) {
    console.error(
      'Usage: node test_whatsapp_verification_pdf.js <telephone> <url_pdf_https>'
    );
    process.exit(1);
  }

  console.log(
    'Template vérification:',
    waConfig.VERIFICATION_TEMPLATE_NAME,
    '/',
    waConfig.VERIFICATION_TEMPLATE_LANG
  );
  console.log('Destinataire:', phone);
  console.log('PDF:', pdfUrl);

  try {
    const result = await sendWhatsAppVerificationDocument({
      phone,
      pdfUrl,
      recipientName: 'Test Acheteur',
      vehicleTitle: 'Toyota Corolla 2020 — test',
    });
    console.log('OK', JSON.stringify(result.meta, null, 2));
  } catch (err) {
    console.error('ÉCHEC', JSON.stringify(formatMetaError(err), null, 2));
    process.exit(1);
  }
}

main();
