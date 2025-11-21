require('dotenv').config();
const mongoose = require('mongoose');
const Referral = require('../src/models/Referral');
const User = require('../src/models/User');

const uri =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  'mongodb://localhost:27017/tranoo';

async function backfill() {
  try {
    console.log(`Connexion à MongoDB: ${uri}`);
    await mongoose.connect(uri);

    const aggregates = await Referral.aggregate([
      {
        $group: {
          _id: '$referrerId',
          total: { $sum: 1 },
          referredIds: { $addToSet: '$referredId' },
        },
      },
    ]);

    if (!aggregates.length) {
      console.log('Aucun parrainage à migrer.');
      return;
    }

    let updated = 0;
    for (const item of aggregates) {
      await User.findByIdAndUpdate(item._id, {
        $set: {
          'referralStats.totalReferred': item.total,
          'referralStats.referredUserIds': item.referredIds,
        },
      });
      updated += 1;
    }

    console.log(`Migration terminée ✅ Utilisateurs mis à jour: ${updated}`);
  } catch (error) {
    console.error('Erreur migration referral stats:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

backfill();

