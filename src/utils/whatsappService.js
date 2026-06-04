const axios = require('axios');
const waConfig = require('../config/whatsappConfig');
const {
  digitsOnly,
  normalizeBeninDigits,
  canonicalPhoneDigits,
} = require('./phoneNormalize');
const { cloudinaryPdfDeliveryUrl, resolvePublicPdfUrl } = require('./cloudinaryPdf');
const {
  hasOpenSession,
  sessionAgeMinutes,
} = require('./whatsappSessionStore');

function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone).replace(/[^\d+]/g, '');
}

function isVerboseWaLog() {
  return (
    process.env.NODE_ENV !== 'production' ||
    String(process.env.LOG_OTP || '').toLowerCase() === 'true' ||
    String(process.env.LOG_WHATSAPP || '').toLowerCase() === 'true'
  );
}

function getWhatsAppCredentials() {
  const token = waConfig.TOKEN;
  const phoneId = waConfig.PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    const err = new Error('whatsapp_not_configured');
    err.code = 'whatsapp_not_configured';
    throw err;
  }
  return { token, phoneId };
}

/**
 * Vérifie que PHONE_NUMBER_ID est bien un numéro d'envoi (pas un WABA_ID).
 */
async function resolveSenderPhoneNumber() {
  const { token, phoneId } = getWhatsAppCredentials();
  const url = `https://graph.facebook.com/${waConfig.GRAPH_API_VERSION}/${phoneId}`;

  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        fields: 'id,display_phone_number,verified_name,account_mode,status,quality_rating',
      },
      timeout: 15000,
    });
    return { token, phoneId, sender: data };
  } catch (error) {
    const meta = error.response?.data?.error;
    const sub = meta?.error_subcode;
    const msg = meta?.message || error.message;
    console.error('[RESET][WA] PHONE_NUMBER_ID invalide', {
      phoneNumberId: phoneId,
      wabaIdInEnv: waConfig.WABA_ID || null,
      graphError: msg,
      subcode: sub,
    });
    if (sub === 33 || /does not exist|Unsupported post request/i.test(msg)) {
      const hint = new Error(
        'PHONE_NUMBER_ID incorrect : vous avez peut-être mis WHATSAPP_BUSINESS_ACCOUNT_ID ' +
          `(ex. ${waConfig.WABA_ID}) à la place de l'identifiant du numéro (1019497624570675 pour +229 94 06 28 93).`
      );
      hint.code = 'whatsapp_wrong_phone_number_id';
      throw hint;
    }
    throw error;
  }
}

function messagesUrl(phoneId) {
  return `https://graph.facebook.com/${waConfig.GRAPH_API_VERSION}/${phoneId}/messages`;
}

function assertValidRecipient(phone) {
  const to = digitsOnly(phone);
  if (!to || to.length < 8) {
    const err = new Error('invalid_phone');
    err.code = 'invalid_phone';
    throw err;
  }
  return to;
}

/** E.164 chiffres pour Meta (Bénin 229… normalisé). */
function normalizeWaRecipient(phone) {
  const canon = canonicalPhoneDigits({ telephone: phone });
  let d = canon || digitsOnly(phone);
  if (!d || d.length < 8) {
    const err = new Error('invalid_phone');
    err.code = 'invalid_phone';
    throw err;
  }
  if (d.startsWith('229')) {
    d = normalizeBeninDigits(d);
  }
  return d;
}

function maskWaPhone(to) {
  if (!to || to.length < 6) return '***';
  return isVerboseWaLog() ? to : `${to.slice(0, 4)}***${to.slice(-2)}`;
}

function formatMetaError(error) {
  return error.response?.data || error.message || 'unknown_error';
}

/**
 * OTP mot de passe oublié — template Authentication (ex. tranoo_reset_code).
 * Les templates Meta « Copier le code » exigent body + bouton URL (index 0) avec le code.
 */
async function sendWhatsAppOtpCode({ phone, code }) {
  const { token, phoneId, sender } = await resolveSenderPhoneNumber();
  const rawDigits = digitsOnly(phone);
  const to = assertValidRecipient(
    rawDigits.startsWith('229') ? normalizeBeninDigits(rawDigits) : rawDigits
  );
  const otp = String(code);
  const verbose = isVerboseWaLog();
  const postUrl = messagesUrl(phoneId);

  console.log('[RESET][WA] ─── début envoi OTP ───');
  console.log('[RESET][WA] config', {
    phoneNumberId: phoneId,
    wabaIdEnv: waConfig.WABA_ID || '(vide)',
    wabaNote: 'WABA_ID non utilisé dans l\'URL POST /messages',
    template: waConfig.OTP_TEMPLATE_NAME,
    lang: waConfig.OTP_TEMPLATE_LANG,
    graphVersion: waConfig.GRAPH_API_VERSION,
  });
  console.log('[RESET][WA] expéditeur (PHONE_NUMBER_ID)', {
    display: sender.display_phone_number,
    verified_name: sender.verified_name,
    account_mode: sender.account_mode,
    status: sender.status,
    quality_rating: sender.quality_rating,
  });
  console.log('[RESET][WA] destinataire', {
    to: verbose ? to : `${to.slice(0, 4)}***${to.slice(-2)}`,
    wa_id_attendu: 'doit correspondre au WhatsApp du client',
  });
  if (verbose) {
    console.log('[RESET][WA] POST', postUrl);
    console.log('[RESET][WA] code OTP (dev):', otp);
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: waConfig.OTP_TEMPLATE_NAME,
      language: { code: waConfig.OTP_TEMPLATE_LANG },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: otp }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: otp }],
        },
      ],
    },
  };

  try {
    const response = await axios.post(messagesUrl(phoneId), payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    });

    const msg0 = response.data?.messages?.[0];
    const contact0 = response.data?.contacts?.[0];
    console.log('[RESET][WA] réponse Meta (acceptation API)', {
      messageId: msg0?.id,
      message_status: msg0?.message_status,
      contact_input: contact0?.input,
      contact_wa_id: contact0?.wa_id,
    });
    if (msg0?.message_status === 'accepted') {
      console.log(
        '[RESET][WA] ⚠ accepted = Meta a file le message. La livraison réelle se voit via webhook ' +
          '(status: sent/delivered/failed) ou WhatsApp Manager > Historique. ' +
          'Ouvrez la conversation avec',
        sender.display_phone_number,
        `(${sender.verified_name}), pas un autre chat.`
      );
    }
    if (verbose) {
      console.log('[RESET][WA] meta brute:', JSON.stringify(response.data, null, 2));
    }
    console.log('[RESET][WA] ─── fin envoi OTP ───');
    return {
      sent: true,
      meta: response.data,
      senderDisplay: sender.display_phone_number,
      messageId: msg0?.id,
      messageStatus: msg0?.message_status,
      recipientWaId: contact0?.wa_id,
    };
  } catch (error) {
    console.error('[RESET][WA] échec envoi OTP', {
      status: error.response?.status,
      code: error.code,
      data: formatMetaError(error),
    });
    throw error;
  }
}

/**
 * Rapport de vérification acheteur — template Utility avec en-tête DOCUMENT dynamique.
 * pdfUrl : URL HTTPS publique (ex. Cloudinary), accessible par les serveurs Meta.
 */
async function sendWhatsAppVerificationDocument({
  phone,
  pdfUrl,
  recipientName,
  vehicleTitle,
  filename,
}) {
  const verbose = isVerboseWaLog();
  const rawPhone = String(phone || '');
  const to = normalizeWaRecipient(phone);

  console.log('[VERIFY][WA] ─── début envoi rapport PDF (dashboard compose) ───');
  console.log('[VERIFY][WA] entrée', {
    telephoneBrut: rawPhone,
    telephoneNormalise: maskWaPhone(to),
    template: waConfig.VERIFICATION_TEMPLATE_NAME,
    lang: waConfig.VERIFICATION_TEMPLATE_LANG,
    graphVersion: waConfig.GRAPH_API_VERSION,
    paramCustomer: waConfig.VERIFICATION_PARAM_CUSTOMER_NAME,
    paramVehicle: waConfig.VERIFICATION_PARAM_VEHICLE_TITLE,
  });

  let token;
  let phoneId;
  let sender;
  try {
    const resolved = await resolveSenderPhoneNumber();
    token = resolved.token;
    phoneId = resolved.phoneId;
    sender = resolved.sender;
    console.log('[VERIFY][WA] expéditeur', {
      display: sender.display_phone_number,
      verified_name: sender.verified_name,
      account_mode: sender.account_mode,
      status: sender.status,
      phoneNumberId: phoneId,
    });
  } catch (e) {
    console.error('[VERIFY][WA] preflight expéditeur échoué', formatMetaError(e));
    throw e;
  }

  const link = String(pdfUrl || '').trim();
  if (!link) {
    console.error('[VERIFY][WA] pdfUrl vide');
    const err = new Error('invalid_pdf_url');
    err.code = 'invalid_pdf_url';
    throw err;
  }

  const pdfResolved = await resolvePublicPdfUrl(link);
  const deliveryLink = pdfResolved.ok ? pdfResolved.url : link;
  if (!/^https:\/\//i.test(deliveryLink)) {
    console.error('[VERIFY][WA] pdfUrl invalide après résolution (HTTPS requis)', {
      pdfUrl: `${link.slice(0, 48)}…`,
      deliveryLink: `${String(deliveryLink).slice(0, 48)}…`,
    });
    const err = new Error('invalid_pdf_url');
    err.code = 'invalid_pdf_url';
    throw err;
  }
  console.log('[VERIFY][WA] sonde PDF', {
    ok: pdfResolved.ok,
    signedUrl: pdfResolved.signed === true,
    urlOriginale: verbose ? link : `${link.slice(0, 48)}…`,
    urlEnvoiMeta: verbose ? deliveryLink : `${deliveryLink.slice(0, 48)}…`,
    attempts: pdfResolved.attempts,
    hint: pdfResolved.ok
      ? pdfResolved.proxy
        ? 'Meta télécharge via proxy Tranoo (Cloudinary CDN ignoré)'
        : 'Meta peut télécharger ce PDF'
      : 'PDF inaccessible — ré-uploadez via le compose (POST /notifications/verification-pdf) ou PUBLIC_API_BASE_URL en prod',
  });

  if (!pdfResolved.ok) {
    const err = new Error('pdf_not_public');
    err.code = 'pdf_not_public';
    err.probe = pdfResolved;
    console.error('[VERIFY][WA] envoi annulé — PDF inaccessible', pdfResolved);
    throw err;
  }

  const safeName = String(recipientName || 'Client').slice(0, 60);
  const safeTitle = String(vehicleTitle || 'Véhicule').slice(0, 120);
  const pdfFilename =
    filename || waConfig.VERIFICATION_PDF_FILENAME || 'rapport-verification-tranoo.pdf';

  const sessionOpen = hasOpenSession(to);
  const sessionMins = sessionAgeMinutes(to);
  console.log('[VERIFY][WA] fenêtre 24h', {
    open: sessionOpen,
    dernierMessageClientIlYaMinutes: sessionMins,
    hint: sessionOpen
      ? 'Envoi document en mode session (sans template) — plus fiable si le client a écrit récemment'
      : 'Pas de message client récent enregistré par le webhook → template UTILITY',
  });

  if (sessionOpen) {
    const sessionPayload = {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: {
        link: deliveryLink,
        filename: pdfFilename,
        caption: `Bonjour ${safeName}, rapport de vérification Tranoo — ${safeTitle}`,
      },
    };
    try {
      const sessionRes = await axios.post(messagesUrl(phoneId), sessionPayload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 45000,
      });
      const msg0 = sessionRes.data?.messages?.[0];
      console.log('[VERIFY][WA] envoi session document OK', {
        messageId: msg0?.id,
        message_status: msg0?.message_status,
        mode: 'session_24h',
      });
      return {
        sent: true,
        deliveryMode: 'session_24h',
        meta: sessionRes.data,
        messageId: msg0?.id,
        messageStatus: msg0?.message_status,
        recipientWaId: to,
        senderDisplay: sender.display_phone_number,
        pdfProbeOk: pdfResolved.ok,
      };
    } catch (sessionErr) {
      const metaCode = sessionErr.response?.data?.error?.code;
      console.warn('[VERIFY][WA] session document échoué, repli template', {
        code: metaCode,
        data: formatMetaError(sessionErr),
      });
    }
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: waConfig.VERIFICATION_TEMPLATE_NAME,
      language: { code: waConfig.VERIFICATION_TEMPLATE_LANG },
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'document',
              document: {
                link: deliveryLink,
                filename: pdfFilename,
              },
            },
          ],
        },
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              parameter_name: waConfig.VERIFICATION_PARAM_CUSTOMER_NAME,
              text: safeName,
            },
            {
              type: 'text',
              parameter_name: waConfig.VERIFICATION_PARAM_VEHICLE_TITLE,
              text: safeTitle,
            },
          ],
        },
      ],
    },
  };

  if (verbose) {
    console.log('[VERIFY][WA] POST', messagesUrl(phoneId));
    console.log('[VERIFY][WA] payload (sans token)', JSON.stringify(payload, null, 2));
  }

  try {
    const response = await axios.post(messagesUrl(phoneId), payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 45000,
    });

    const msg0 = response.data?.messages?.[0];
    const contact0 = response.data?.contacts?.[0];
    console.log('[VERIFY][WA] réponse Meta (acceptation API)', {
      messageId: msg0?.id,
      message_status: msg0?.message_status,
      contact_input: contact0?.input,
      contact_wa_id: contact0?.wa_id,
      destinataireNormalise: maskWaPhone(to),
    });
    console.log(
      '[VERIFY][WA] ⚠ accepted = file d\'attente Meta, pas « reçu sur le téléphone ». ' +
        'Vérifier : 1) Chat avec',
      sender.display_phone_number,
      `(${sender.verified_name}) 2) Onglet « Mises à jour » WhatsApp 3) Webhook delivered/failed (messageId=${msg0?.id})`
    );
    console.log(
      '[VERIFY][WA] Si failed webhook 131047 : demander au client d\'envoyer un message à',
      sender.display_phone_number,
      'puis renvoyer le rapport.'
    );
    if (verbose) {
      console.log('[VERIFY][WA] meta brute:', JSON.stringify(response.data, null, 2));
    }
    console.log('[VERIFY][WA] ─── fin envoi rapport PDF ───');

    return {
      sent: true,
      deliveryMode: 'template_utility',
      meta: response.data,
      messageId: msg0?.id,
      messageStatus: msg0?.message_status,
      recipientWaId: contact0?.wa_id,
      senderDisplay: sender.display_phone_number,
      pdfProbeOk: pdfResolved.ok,
      pdfSigned: pdfResolved.signed,
    };
  } catch (error) {
    console.error('[VERIFY][WA] échec envoi rapport', {
      status: error.response?.status,
      code: error.code,
      to: maskWaPhone(to),
      data: formatMetaError(error),
    });
    console.log('[VERIFY][WA] ─── fin envoi rapport PDF (échec) ───');
    throw error;
  }
}

/**
 * Envoie un message facture (API générique configurée — legacy).
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

module.exports = {
  normalizePhone,
  normalizeWaRecipient,
  digitsOnly,
  getWhatsAppCredentials,
  resolveSenderPhoneNumber,
  isVerboseWaLog,
  formatMetaError,
  cloudinaryPdfDeliveryUrl,
  sendWhatsAppInvoiceMessage,
  sendWhatsAppOtpCode,
  sendWhatsAppVerificationDocument,
};
