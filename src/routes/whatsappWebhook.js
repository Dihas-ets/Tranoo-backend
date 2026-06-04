/**
 * Webhook Meta WhatsApp — logs livraison OTP (sent / delivered / failed / read).
 *
 * .env :
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN=tranoo_verify_secret
 *
 * Meta Developer → WhatsApp → Configuration → Webhook :
 *   URL callback : https://api.tranoo.store/api/whatsapp/webhook
 *   Verify token : même valeur que WHATSAPP_WEBHOOK_VERIFY_TOKEN
 *   Champs : messages + message_template_status_update (optionnel)
 */
const express = require('express');
const router = express.Router();
const { recordInbound } = require('../utils/whatsappSessionStore');

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';

/** Codes Meta fréquents quand accepted mais pas reçu sur le téléphone */
const WA_ERROR_HINTS = {
  131026: 'Numéro sans WhatsApp, bloqué, ou indisponible.',
  131047: 'Re-engagement requis : le client doit d’abord écrire au numéro Tranoo (+229 94 06 28 93).',
  131049: 'Limite Meta (qualité / volume) — réessayer plus tard.',
  132012: 'Paramètres du template incorrects (nom variable / format).',
  132015: 'Template en pause — vérifier dans le Gestionnaire WhatsApp.',
  132016: 'PDF / document inaccessible au moment de la livraison par Meta.',
  130472: 'Numéro dans une expérience Meta (livraison restreinte).',
};

function logWaStatus(st) {
  const hint = st.errors?.map((e) => {
    const code = e.code;
    return WA_ERROR_HINTS[code] || e.title || e.message;
  });
  const tag = st.status === 'failed' ? '[VERIFY][WA][webhook] ÉCHEC livraison' : '[VERIFY][WA][webhook] statut';
  console.log(tag, {
    status: st.status,
    messageId: st.id,
    recipient: st.recipient_id,
    timestamp: st.timestamp,
    errors: st.errors,
    hints: hint?.length ? hint : undefined,
  });
  if (st.status === 'failed' && st.errors?.length) {
    console.error('[VERIFY][WA][webhook] détail', JSON.stringify(st.errors, null, 2));
  }
  if (st.status === 'delivered') {
    console.log('[VERIFY][WA][webhook] ✓ Message livré sur le téléphone', st.recipient_id);
  }
}

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    console.log('[RESET][WA][webhook] vérification Meta OK');
    return res.status(200).send(challenge);
  }
  console.warn('[RESET][WA][webhook] vérification refusée', { mode, tokenPresent: Boolean(token) });
  return res.sendStatus(403);
});

router.post('/webhook', (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (!body || body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;

      const value = change.value || {};
      const metadata = value.metadata || {};

      for (const st of value.statuses || []) {
        logWaStatus(st);
      }

      for (const msg of value.messages || []) {
        recordInbound(msg.from);
        console.log('[VERIFY][WA][webhook] message entrant (fenêtre 24h ouverte)', {
          from: msg.from,
          type: msg.type,
          messageId: msg.id,
        });
      }
    }
  }
});

module.exports = router;
