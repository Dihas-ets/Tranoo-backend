/**
 * Vérifie que PHONE_NUMBER_ID et WHATSAPP_BUSINESS_ACCOUNT_ID (.env) vont ensemble.
 * Usage: node scripts/find_whatsapp_waba.js
 */
require('dotenv').config();
const axios = require('axios');

const token = process.env.WHATSAPP_TOKEN || process.env.ACCESS_TOKEN;
const version = process.env.WHATSAPP_GRAPH_API_VERSION || 'v22.0';
const phoneId = process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

async function get(path, params = {}) {
  const res = await axios.get(`https://graph.facebook.com/${version}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  return res.data;
}

async function detectNodeType(id) {
  try {
    await get(`/${id}/phone_numbers`, { fields: 'id', limit: 1 });
    return 'waba';
  } catch (e) {
    const msg = e.response?.data?.error?.message || '';
    if (msg.includes('phone_numbers')) {
      try {
        const node = await get(`/${id}`, { fields: 'id,name,category,link' });
        if (node.category || node.link?.includes('facebook.com')) {
          return 'facebook_page';
        }
        return 'other';
      } catch {
        return 'other';
      }
    }
    throw e;
  }
}

async function main() {
  console.log('=== Tranoo — IDs WhatsApp : lequel est lequel ? ===\n');

  if (!token || !phoneId) {
    console.error('Manque ACCESS_TOKEN et PHONE_NUMBER_ID dans .env');
    process.exit(1);
  }

  try {
    const phone = await get(`/${phoneId}`, {
      fields: 'id,display_phone_number,verified_name,account_mode,status',
    });
    console.log('✓ PHONE_NUMBER_ID (.env) = numéro qui ENVOIE les messages');
    console.log(`    Valeur .env : ${phoneId}`);
    console.log(`    Sur WhatsApp : ${phone.display_phone_number} (${phone.verified_name})`);
    console.log(`    Mode : ${phone.account_mode}`);
    console.log('    Interface Meta : « Identifiant du numéro de téléphone » / « Phone number ID »');
    console.log('');
  } catch (e) {
    console.error('✗ PHONE_NUMBER_ID invalide:', e.response?.data?.error?.message || e.message);
    process.exit(1);
  }

  if (!wabaId) {
    console.log('WHATSAPP_BUSINESS_ACCOUNT_ID manquant dans .env.\n');
  } else {
    console.log(`WHATSAPP_BUSINESS_ACCOUNT_ID (.env) : ${wabaId}`);
    const nodeType = await detectNodeType(wabaId);

    if (nodeType === 'facebook_page') {
      const page = await get(`/${wabaId}`, { fields: 'id,name,category' });
      console.log('✗ CE N\'EST PAS un compte WhatsApp Business (WABA).');
      console.log(`  C'est une Page Facebook : « ${page.name} » (catégorie : ${page.category || '—'})`);
      console.log('  Sur l\'interface ce n\'est PAS « Identifiant de l\'application » utile pour WhatsApp API.');
      console.log('  Ne mettez pas l\'ID de Page ni l\'ID d\'app ici.\n');
    } else if (nodeType === 'waba') {
      const waba = await get(`/${wabaId}`, { fields: 'id,name' });
      const nums = await get(`/${wabaId}/phone_numbers`, {
        fields: 'id,display_phone_number,verified_name',
      });
      console.log('✓ C\'est bien un compte WhatsApp Business (WABA).');
      console.log(`    Nom : ${waba.name || '—'}`);
      console.log('    Numéros sur ce WABA :');
      for (const n of nums.data || []) {
        const mark = n.id === phoneId ? '  ← votre +229 tranoo' : '';
        console.log(`      - ${n.display_phone_number} (id ${n.id})${mark}`);
      }
      const linked = (nums.data || []).some((n) => n.id === phoneId);
      console.log('');
      if (linked) {
        console.log('✓ PHONE_NUMBER_ID et WHATSAPP_BUSINESS_ACCOUNT_ID sont cohérents.');
      } else {
        console.log('✗ Ce WABA ne contient pas votre numéro +229 — mauvais compte WhatsApp.');
      }
    } else {
      console.log('✗ ID non reconnu comme WABA (impossible de lister phone_numbers).');
      console.log('  Erreur : peut-être ID d\'application Meta — voir ci-dessous.\n');
    }
  }

  console.log('--- Correspondance interface Meta ↔ .env ---');
  console.log('');
  console.log('| Libellé interface (API Setup)     | Variable .env                  |');
  console.log('|-----------------------------------|--------------------------------|');
  console.log('| Identifiant de l\'application      | (App ID — PAS dans .env OTP)   |');
  console.log('| Identifiant du numéro de téléphone| PHONE_NUMBER_ID                |');
  console.log('| Identifiant du compte WhatsApp    | WHATSAPP_BUSINESS_ACCOUNT_ID   |');
  console.log('|   Business / WABA                 |                                |');
  console.log('');
  console.log('Votre PHONE_NUMBER_ID 1019497624570675 (+229 94 06 28 93) est déjà correct.');
  console.log('');
  console.log('--- Où copier le VRAI WHATSAPP_BUSINESS_ACCOUNT_ID ---');
  console.log('developers.facebook.com → Votre app → WhatsApp → API Setup');
  console.log('  → Sélectionnez le numéro +229 94 06 28 93 dans la liste déroulante');
  console.log('  → Copiez la ligne « WhatsApp Business Account ID » (pas App ID, pas Page).');
  console.log('');
  console.log('OU business.facebook.com → Comptes WhatsApp → compte tranoo → ID à droite.');
  console.log('');
  console.log('Test après correction : node scripts/find_whatsapp_waba.js');
  console.log('  → doit afficher « C\'est bien un WABA » + votre +229 dans la liste.');
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
