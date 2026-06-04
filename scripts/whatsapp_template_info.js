/**
 * Détail des templates WhatsApp (catégorie, statut) — utile si accepted mais pas reçu.
 * Usage: node scripts/whatsapp_template_info.js
 */
require('dotenv').config();
const axios = require('axios');
const waConfig = require('../src/config/whatsappConfig');

const token = waConfig.TOKEN;
const wabaId = waConfig.WABA_ID;
const version = waConfig.GRAPH_API_VERSION;

async function main() {
  if (!token || !wabaId) {
    console.error('WHATSAPP_TOKEN et WHATSAPP_BUSINESS_ACCOUNT_ID requis');
    process.exit(1);
  }
  const url = `https://graph.facebook.com/${version}/${wabaId}/message_templates`;
  const res = await axios.get(url, {
    params: {
      fields: 'name,status,language,category,quality_score,rejected_reason,components',
      limit: 100,
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  const names = [
    waConfig.OTP_TEMPLATE_NAME,
    waConfig.VERIFICATION_TEMPLATE_NAME,
  ];
  for (const n of names) {
    const hits = (res.data.data || []).filter((t) => t.name === n);
    console.log('\n===', n, '===');
    if (!hits.length) {
      console.log('Introuvable sur ce WABA');
      continue;
    }
    hits.forEach((t) => {
      console.log(JSON.stringify(t, null, 2));
      if (t.category === 'MARKETING') {
        console.log(
          '⚠️ Catégorie MARKETING : le destinataire doit souvent avoir opt-in / fenêtre 24h.'
        );
      }
      if (t.status !== 'APPROVED') {
        console.log('⚠️ Statut template:', t.status);
      }
    });
  }
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
