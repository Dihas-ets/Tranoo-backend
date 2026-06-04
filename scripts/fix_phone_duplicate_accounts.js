/**
 * Audit / correction des comptes partageant le même numéro (conflit reset OTP).
 *
 * Le reset mot de passe Tranoo Pro refuse l'envoi si plusieurs comptes Pro
 * (vendeur, livreur, chauffeur, transitaire) partagent le même téléphone → HTTP 409.
 *
 * Usage :
 *   node scripts/fix_phone_duplicate_accounts.js 59399349
 *   node scripts/fix_phone_duplicate_accounts.js 22959399349 --app pro
 *   node scripts/fix_phone_duplicate_accounts.js 59399349 --keep-uid FirebaseUidIci
 *   node scripts/fix_phone_duplicate_accounts.js 59399349 --keep-role vendeur
 *   node scripts/fix_phone_duplicate_accounts.js 59399349 --keep-email gm@gmail.com
 *   node scripts/fix_phone_duplicate_accounts.js 59399349 --apply --keep-email gm@gmail.com
 *
 * Sans --apply : simulation (dry-run). Avec --apply : écrit en base.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const {
  findUsersByPhoneDigits,
  findUserByPhoneAndApp,
} = require('../src/utils/authAppPhone');
const { authAppFromRole } = require('../src/utils/authAppRoles');
const {
  canonicalPhoneDigits,
  internationalPhoneFromDigits,
} = require('../src/utils/phoneNormalize');

function parseArgs(argv) {
  const positional = [];
  const flags = {
    apply: false,
    keepUid: null,
    keepRole: null,
    keepEmail: null,
    app: 'pro',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') flags.apply = true;
    else if (a === '--keep-uid') flags.keepUid = argv[++i];
    else if (a === '--keep-role') flags.keepRole = String(argv[++i] || '').toLowerCase();
    else if (a === '--keep-email') flags.keepEmail = String(argv[++i] || '').trim().toLowerCase();
    else if (a === '--app') flags.app = String(argv[++i] || 'pro').toLowerCase();
    else if (!a.startsWith('--')) positional.push(a);
  }
  return { phoneRaw: positional[0], flags };
}

function placeholderPhoneForDetached(index) {
  // Numéros réservés support / comptes détachés (non utilisables pour OTP)
  const suffix = String(9000000 + index).padStart(7, '0');
  return `+229${suffix}`;
}

function pickAccountToKeep(matched, { keepUid, keepRole, keepEmail }) {
  if (keepEmail) {
    const email = keepEmail.toLowerCase();
    const found = matched.find((u) => String(u.email || '').trim().toLowerCase() === email);
    if (!found) {
      throw new Error(
        `Aucun compte avec email=${keepEmail}. Emails présents: ${matched.map((u) => u.email).join(', ')}`
      );
    }
    return found;
  }
  if (keepUid) {
    const found = matched.find((u) => u.uid === keepUid);
    if (!found) {
      throw new Error(`Aucun compte avec uid=${keepUid} parmi les ${matched.length} trouvés.`);
    }
    return found;
  }
  if (keepRole) {
    const sameRole = matched.filter((u) => u.role === keepRole);
    if (sameRole.length === 0) {
      throw new Error(`Aucun compte avec role=${keepRole}. Rôles présents: ${[...new Set(matched.map((u) => u.role))].join(', ')}`);
    }
    sameRole.sort((a, b) => new Date(b.updatedAt || b.dateInscription || 0) - new Date(a.updatedAt || a.dateInscription || 0));
    return sameRole[0];
  }
  return null;
}

function summarizeUser(u) {
  return {
    _id: String(u._id),
    uid: u.uid,
    role: u.role,
    authApp: u.authApp || authAppFromRole(u.role),
    nom: u.nom,
    prenoms: u.prenoms,
    email: u.email,
    telephone: u.telephone,
    telephoneCanonical: u.telephoneCanonical,
    dateInscription: u.dateInscription,
    updatedAt: u.updatedAt,
  };
}

async function main() {
  const { phoneRaw, flags } = parseArgs(process.argv);
  if (!phoneRaw) {
    console.error('Usage: node scripts/fix_phone_duplicate_accounts.js <telephone> [--app pro|buyer] [--keep-email EMAIL] [--keep-uid UID] [--keep-role vendeur] [--apply]');
    process.exit(1);
  }

  const phoneDigits = canonicalPhoneDigits({ telephone: phoneRaw });
  if (!phoneDigits) {
    console.error('Numéro invalide:', phoneRaw);
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI manquant dans .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('=== Audit téléphone', phoneDigits, '===\n');

  const all = await findUsersByPhoneDigits(phoneDigits);
  if (all.length === 0) {
    console.log('Aucun compte trouvé pour ce numéro.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Comptes liés (${all.length}) :`);
  all.forEach((u, i) => {
    console.log(`  [${i + 1}]`, JSON.stringify(summarizeUser(u), null, 2));
  });
  console.log('');

  const appParam = flags.app === 'buyer' || flags.app === 'tranoo' ? 'buyer' : 'pro';
  const lookup = await findUserByPhoneAndApp(phoneDigits, appParam);
  console.log('Simulation reset OTP (app', lookup.authApp || flags.app, '):');
  if (lookup.error === 'ambiguous') {
    console.log('  ❌ HTTP 409 — plusieurs comptes Pro sur ce numéro');
    console.log('  Rôles en conflit:', (lookup.candidates || []).map((u) => u.role));
  } else if (lookup.error === 'not_found') {
    console.log('  ❌ HTTP 404 — aucun compte pour cette app');
  } else {
    console.log('  ✓ Un seul compte → OTP WhatsApp possible');
    console.log(' ', summarizeUser(lookup.user));
  }
  console.log('');

  if (lookup.error !== 'ambiguous') {
    console.log('Rien à corriger pour le conflit Pro (pas de doublon bloquant).');
    await mongoose.disconnect();
    return;
  }

  const matched = lookup.candidates || [];
  let keeper = pickAccountToKeep(matched, flags);
  if (!keeper) {
    console.log('--- Choix du compte à conserver ---');
    console.log('Plusieurs comptes Pro partagent ce numéro. Indiquez lequel garder :');
    console.log('  --keep-email gm@gmail.com');
    console.log('  --keep-uid <firebase uid>');
    console.log('  --keep-role vendeur|livreur|chauffeur|transitaire  (garde le plus récent de ce rôle)');
    console.log('');
    matched.forEach((u, i) => {
      console.log(`  ${i + 1}. ${u.role} | ${u.prenoms} ${u.nom} | uid=${u.uid} | email=${u.email}`);
    });
    await mongoose.disconnect();
    process.exit(0);
  }

  const toDetach = matched.filter((u) => String(u._id) !== String(keeper._id));
  console.log('Compte conservé sur', phoneDigits, ':', summarizeUser(keeper));
  console.log('');
  console.log(`Comptes à détacher (${toDetach.length}) — placeholder téléphone :`);
  toDetach.forEach((u, i) => {
    console.log(`  - ${u.role} uid=${u.uid} → ${placeholderPhoneForDetached(i + 1)}`);
  });
  console.log('');

  if (!flags.apply) {
    console.log('DRY-RUN (aucune modification). Relancez avec --apply pour appliquer.');
    await mongoose.disconnect();
    return;
  }

  let idx = 1;
  for (const u of toDetach) {
    const newPhone = placeholderPhoneForDetached(idx++);
    const newCanon = canonicalPhoneDigits({ telephone: newPhone });
    u.telephone = internationalPhoneFromDigits(newCanon);
    u.telephoneCanonical = newCanon;
    u.authApp = u.authApp || authAppFromRole(u.role);
    await u.save();
    console.log('[APPLY] détaché', u.uid, u.role, '→', u.telephone);
  }

  keeper.telephone = internationalPhoneFromDigits(phoneDigits);
  keeper.telephoneCanonical = phoneDigits;
  keeper.authApp = keeper.authApp || authAppFromRole(keeper.role);
  await keeper.save();
  console.log('[APPLY] conservé', keeper.uid, keeper.role, '→', keeper.telephone);

  const after = await findUserByPhoneAndApp(phoneDigits, appParam);
  console.log('');
  console.log('Après correction:', after.error || 'ok', after.user ? after.user.uid : '');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
