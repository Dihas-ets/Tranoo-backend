/**
 * Remplit telephoneCanonical, authApp et normalise telephone pour les comptes existants.
 *
 * Usage: node scripts/backfill_phone_auth_app.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const {
  canonicalPhoneDigits,
  internationalPhoneFromDigits,
} = require('../src/utils/phoneNormalize');
const { authAppFromRole } = require('../src/utils/authAppRoles');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI manquant');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('[backfill] connecté à MongoDB');

  const users = await User.find({
    telephone: { $exists: true, $nin: [null, '', '0000000000', '+0000000000'] },
  });

  let updated = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const user of users) {
    const canon = canonicalPhoneDigits({ telephone: user.telephone });
    if (!canon || canon.length < 8 || /^0+$/.test(canon)) {
      skipped++;
      continue;
    }

    const authApp = user.authApp || authAppFromRole(user.role);
    if (!authApp) {
      skipped++;
      continue;
    }

    const duplicate = await User.findOne({
      _id: { $ne: user._id },
      telephoneCanonical: canon,
      authApp,
    });
    if (duplicate) {
      conflicts++;
      console.warn('[backfill] conflit', {
        userId: String(user._id),
        role: user.role,
        email: user.email,
        telephone: user.telephone,
        authApp,
        duplicateId: String(duplicate._id),
        duplicateRole: duplicate.role,
      });
      continue;
    }

    user.telephoneCanonical = canon;
    user.telephone = internationalPhoneFromDigits(canon);
    user.authApp = authApp;
    await user.save();
    updated++;
  }

  console.log('[backfill] terminé', { updated, skipped, conflicts, total: users.length });
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
