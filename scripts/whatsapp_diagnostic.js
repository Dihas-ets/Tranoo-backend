/**
 * Diagnostic WhatsApp Cloud API (Meta) — ne log pas le token complet.
 * Usage: node scripts/whatsapp_diagnostic.js
 */
require('dotenv').config();
const axios = require('axios');
// axios déjà utilisé pour tests templates en fin de script
const waConfig = require('../src/config/whatsappConfig');

const token = waConfig.TOKEN;
const phoneId = waConfig.PHONE_NUMBER_ID;
const wabaId = waConfig.WABA_ID;
const version = waConfig.GRAPH_API_VERSION;

function mask(s) {
  if (!s || s.length < 8) return '(manquant)';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function get(path) {
  const url = `https://graph.facebook.com/${version}${path}`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000,
  });
  return res.data;
}

async function main() {
  console.log('=== Diagnostic WhatsApp Tranoo ===\n');
  console.log('Config lue depuis .env:');
  console.log('  TOKEN:', token ? `présent (${token.length} car.) ${mask(token)}` : 'MANQUANT');
  console.log('  PHONE_NUMBER_ID:', phoneId || 'MANQUANT');
  console.log('  WABA_ID:', wabaId || '(optionnel, non utilisé à l\'envoi)');
  console.log('  Template OTP:', waConfig.OTP_TEMPLATE_NAME, '/', waConfig.OTP_TEMPLATE_LANG);
  console.log('  Graph API:', version);

  if (!token || !phoneId) {
    console.error('\n❌ TOKEN ou PHONE_NUMBER_ID manquant — envoi impossible.');
    process.exit(1);
  }

  try {
    const phone = await get(
      `/${phoneId}?fields=display_phone_number,verified_name,quality_rating,status,code_verification_status,platform_type,account_mode,name_status`
    );
    console.log('\n--- Numéro expéditeur (PHONE_NUMBER_ID) ---');
    console.log(JSON.stringify(phone, null, 2));
    if (phone.account_mode === 'LIVE') {
      console.log('  ✓ Compte en mode LIVE (pas sandbox).');
    }
  } catch (e) {
    console.error('\n❌ PHONE_NUMBER_ID invalide ou token sans accès:', e.response?.data || e.message);
  }

  let linkedWaba = wabaId;
  try {
    const phoneExtra = await get(
      `/${phoneId}?fields=whatsapp_business_account,messaging_limit_tier,throughput`
    );
    linkedWaba = phoneExtra.whatsapp_business_account?.id || wabaId;
    console.log('\n--- Lien Phone ID → WABA ---');
    console.log('  WABA lié au numéro:', linkedWaba || '(non récupéré)');
    console.log('  WABA dans .env:', wabaId || '(vide)');
    if (linkedWaba && wabaId && linkedWaba !== wabaId) {
      console.log('  ⚠️ WHATSAPP_BUSINESS_ACCOUNT_ID (.env) ≠ WABA réel du PHONE_NUMBER_ID');
      console.log('     → Corrigez .env (optionnel pour envoi, utile pour debug templates).');
    }
    console.log('  messaging_limit_tier:', phoneExtra.messaging_limit_tier);
    console.log('  throughput:', JSON.stringify(phoneExtra.throughput));
  } catch (e) {
    console.warn('\n⚠️ Champs phone extra:', e.response?.data?.error?.message || e.message);
  }

  const wabaToQuery = linkedWaba || wabaId;
  if (wabaToQuery) {
    try {
      const templates = await get(
        `/${wabaToQuery}/message_templates?fields=name,status,language,category&limit=100`
      );
      const all = templates.data || [];
      const otp = all.filter((t) => t.name === waConfig.OTP_TEMPLATE_NAME);
      console.log('\n--- Template', waConfig.OTP_TEMPLATE_NAME, `(WABA ${wabaToQuery}) ---`);
      if (otp.length === 0) {
        console.log('❌ Modèle introuvable. Noms proches:');
        all
          .filter((t) => /reset|otp|tranoo|code/i.test(t.name))
          .forEach((t) => console.log(`   - ${t.name} | ${t.status} | ${t.language}`));
      } else {
        otp.forEach((t) => console.log(JSON.stringify(t, null, 2)));
      }
    } catch (e) {
      console.error('\n⚠️ Templates WABA:', e.response?.data?.error?.message || e.message);
    }
  }

  try {
    const me = await get(`/me?fields=id,name`);
    console.log('\n--- Token / app (me) ---');
    console.log(JSON.stringify(me, null, 2));
  } catch (e) {
    console.warn('\n⚠️ /me:', e.response?.data?.error?.message || e.message);
  }

  console.log('\n--- Test existence templates (envoi sec) ---');
  const pid = phoneId;
  const testTo = process.env.WHATSAPP_DIAG_TEST_PHONE || '22959399349';
  for (const [name, lang] of [
    [waConfig.OTP_TEMPLATE_NAME, waConfig.OTP_TEMPLATE_LANG],
    [waConfig.VERIFICATION_TEMPLATE_NAME, waConfig.VERIFICATION_TEMPLATE_LANG],
  ]) {
    try {
      await axios.post(
        `https://graph.facebook.com/${version}/${pid}/messages`,
        {
          messaging_product: 'whatsapp',
          to: testTo,
          type: 'template',
          template: { name, language: { code: lang } },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`  ${name} (${lang}): existe (params requis si erreur 132000)`);
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message;
      const code = e.response?.data?.error?.code;
      if (code === 132000) {
        console.log(`  ${name} (${lang}): ✓ existe sur le numéro (paramètres manquants = normal)`);
      } else if (code === 132001) {
        console.log(`  ${name} (${lang}): ✗ traduction absente`);
      } else {
        console.log(`  ${name} (${lang}): ? ${msg}`);
      }
    }
  }

  console.log('\n=== Rappels livraison ===');
  console.log('• OTP mot de passe = tranoo_reset_code (AUTH), pas tranoo_verification_rapport (PDF).');
  console.log('• message_status "accepted" ≠ reçu sur le téléphone (doc Meta).');
  console.log('• Messages partent de +229 94 06 28 93 (tranoo) — ouvrir ce chat.');
  console.log('• WHATSAPP_BUSINESS_ACCOUNT_ID sert au debug ; l\'envoi utilise PHONE_NUMBER_ID.');
  console.log('• Vérifier dans le Manager le modèle tranoo_reset_code (qualité / actif).');
  console.log('• Livraison réelle : webhooks delivered/failed ou Insights Manager.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
