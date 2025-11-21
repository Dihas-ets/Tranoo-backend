const assert = require('assert');
const mongoose = require('mongoose');
const Referral = require('../src/models/Referral');
const User = require('../src/models/User');

async function run() {
  try {
    const referralCodePath = Referral.schema.path('referralCode');
    assert(referralCodePath, 'Champ referralCode introuvable sur Referral');
    assert.strictEqual(
      referralCodePath.options.unique,
      undefined,
      'referralCode ne doit plus être unique'
    );
    assert.strictEqual(
      referralCodePath._index,
      true,
      'referralCode doit être indexé'
    );

    const userStatsTotalPath = User.schema.path('referralStats.totalReferred');
    assert(
      userStatsTotalPath,
      'Champ referralStats.totalReferred introuvable sur User'
    );
    assert.strictEqual(
      userStatsTotalPath.instance,
      'Number',
      'totalReferred doit être numérique'
    );

    const userStatsIdsPath = User.schema.path('referralStats.referredUserIds');
    assert(
      userStatsIdsPath,
      'Champ referralStats.referredUserIds introuvable sur User'
    );
    assert.strictEqual(
      userStatsIdsPath.instance,
      'Array',
      'referredUserIds doit être un tableau'
    );

    console.log('Referral schema tests passed ✅');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Referral schema tests failed ❌');
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();

