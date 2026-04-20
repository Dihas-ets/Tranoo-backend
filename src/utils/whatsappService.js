const axios = require('axios');

function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone).replace(/[^\d+]/g, '');
}

async function sendWhatsAppInvoiceMessage({ phone, invoiceNumber, total, reference }) {
  const apiUrl = process.env.WHATSAPP_API_URL || '';
  const token = process.env.WHATSAPP_API_TOKEN || '';
  const enabled = String(process.env.WHATSAPP_ENABLED || 'false').toLowerCase() === 'true';

  if (!enabled || !apiUrl || !token) {
    return { skipped: true, reason: 'whatsapp_not_configured' };
  }

  const target = normalizePhone(phone);
  if (!target) return { skipped: true, reason: 'missing_phone' };

  const message = `Tranoo: votre facture ${invoiceNumber} est disponible. Montant ${total} FCFA. Ref ${reference}.`;
  await axios.post(
    apiUrl,
    { to: target, message },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
  return { sent: true };
}

module.exports = { sendWhatsAppInvoiceMessage };
