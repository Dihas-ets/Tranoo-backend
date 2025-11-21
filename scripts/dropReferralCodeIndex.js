require('dotenv').config();
const mongoose = require('mongoose');

const uri =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  'mongodb://localhost:27017/tranoo';

async function dropUniqueIndex() {
  try {
    console.log(`Connexion à MongoDB: ${uri}`);
    await mongoose.connect(uri);

    const collection = mongoose.connection.collection('referrals');
    let indexes;
    try {
      indexes = await collection.indexes();
    } catch (error) {
      if (error?.code === 26) {
        console.log('Collection referrals inexistante, rien à faire ✅');
        return;
      }
      throw error;
    }

    const uniqueIndex = indexes.find(
      (idx) => idx.key.referralCode === 1 && idx.unique
    );

    if (!uniqueIndex) {
      console.log('Aucun index unique referralCode_1 à supprimer.');
    } else {
      await collection.dropIndex(uniqueIndex.name);
      console.log(`Index ${uniqueIndex.name} supprimé ✅`);
    }
  } catch (error) {
    if (error?.code === 26) {
      console.log('Collection referrals inexistante, rien à faire ✅');
      return;
    }
    console.error('Erreur suppression index unique:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

dropUniqueIndex();

