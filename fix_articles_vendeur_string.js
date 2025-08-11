// Script Node.js pour convertir tous les champs 'vendeur' des articles en string
const mongoose = require('mongoose');
const Article = require('./src/models/Article');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connecté à MongoDB');
  const articles = await Article.find({ vendeur: { $type: 'objectId' } });
  let count = 0;
  for (const article of articles) {
    if (article.vendeur) {
      article.vendeur = article.vendeur.toString();
      await article.save();
      count++;
      console.log(`Article ${article._id} corrigé`);
    } else {
      console.warn(`Article ${article._id} ignoré : pas de vendeur`);
    }
  }
  console.log(`Migration terminée. ${count} articles corrigés.`);
  // Supprimer les articles sans vendeur ou dont le vendeur n'est pas une string
  const res = await Article.deleteMany({
    $or: [
      { vendeur: { $exists: false } },
      { vendeur: null },
      { vendeur: '' },
      { vendeur: { $not: { $type: 'string' } } }
    ]
  });
  console.log(`Articles supprimés (sans vendeur ou vendeur non string): ${res.deletedCount}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Erreur de migration:', err);
  process.exit(1);
}); 