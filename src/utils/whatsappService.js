const axios = require('axios');

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone).replace(/[^\d+]/g, '');
}

/**
 * Envoie un message facture (API générique configurée).
 */
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

/**
 * OTP mot de passe oublié via WhatsApp Cloud API (Meta).
 * Variables .env : ACCESS_TOKEN ou WHATSAPP_TOKEN, PHONE_NUMBER_ID ou WHATSAPP_PHONE_ID,
 * WHATSAPP_OTP_TEMPLATE_NAME (défaut otp_code).
 */
async function sendWhatsAppOtpCode({ phone, code }) {
  const token =
    process.env.WHATSAPP_TOKEN ||
    process.env.ACCESS_TOKEN ||
    process.env.WHATSAPP_API_TOKEN ||
    '';
  const phoneId =
    process.env.WHATSAPP_PHONE_ID ||
    process.env.PHONE_NUMBER_ID ||
    '';
  const templateName =
    process.env.WHATSAPP_OTP_TEMPLATE_NAME || 'otp_code';
  const lang = process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'fr';

  if (!token || !phoneId) {
    const err = new Error('whatsapp_not_configured');
    err.code = 'whatsapp_not_configured';
    throw err;
  }

  const to = digitsOnly(phone);
  if (!to || to.length < 8) {
    const err = new Error('invalid_phone');
    err.code = 'invalid_phone';
    throw err;
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: String(code) }],
        },
      ],
    },
  };

  const response = await axios.post(
    `https://graph.facebook.com/v22.0/${phoneId}/messages`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );

  return { sent: true, meta: response.data };
}

module.exports = {
  normalizePhone,
  digitsOnly,
  sendWhatsAppInvoiceMessage,
  sendWhatsAppOtpCode,
};
