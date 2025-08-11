// Script Node.js pour corriger les articles TRANOO sans champ source
// Usage : node ajout_source_tranoo_script.js

require('dotenv').config();
const mongoose = require('mongoose');
const Article = require('./src/models/Article');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('Erreur : MONGO_URI non défini dans le .env');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGO_URI);
  const res = await Article.updateMany(
    { entreprise: 'TRANOO', source: { $exists: false } },
    { $set: { source: 'tranoo' } }
  );
  console.log(`Articles corrigés : ${res.modifiedCount}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Erreur script correction source:', err);
  process.exit(1);
}); 