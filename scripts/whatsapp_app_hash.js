/**
 * Affiche le hash de signature WhatsApp (11 caractères) pour Meta.
 * Usage : node scripts/whatsapp_app_hash.js [chemin_keystore] [alias]
 */
const { execSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const os = require('os');

function computeHash(certDer) {
  const hash = crypto
    .createHash('sha256')
    .update(certDer)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return hash.slice(0, 11);
}

const keystore =
  process.argv[2] || path.join(os.homedir(), '.android', 'debug.keystore');
const alias = process.argv[3] || 'androiddebugkey';
const storepass = process.argv[4] || 'android';

const cert = execSync(
  `keytool -exportcert -alias ${alias} -keystore "${keystore}" -storepass ${storepass}`,
  { encoding: 'buffer' }
);

console.log('Keystore:', keystore);
console.log('Hash Meta (11 car.):', computeHash(cert));
