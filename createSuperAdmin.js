
// Script pour créer un super admin manuellement dans MongoDB
// 1. À utiliser après avoir créé le compte dans Firebase Auth (console Firebase)
// 2. Récupère le uid et l'email du super admin depuis Firebase Auth

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');

dotenv.config();

// Remplis ces infos avec celles du super admin créé dans Firebase Auth
const superAdminData = {
  uid: 'Ms0g2FYxMeN7hJpglokoxbuDdcH2', // Ex: 'abc123...'
  nom: 'GNACADJA',
  prenoms: 'Laurinda',
  email: 'gnacadjalaurinda@gmail.com',
  telephone: '0159393949',
  role: 'admin',
  typeAdmin: 'superAdmin',
  adresse: 'Abomey_Calavi',
  ville: 'Abomey_Calavi',
  photo: 'https://ui-avatars.com/api/?name=Laurinda+GNACADJA', // Avatar par défaut
  statut: 'actif',
  langue: 'fr',
  devise: 'XOF',
  dateInscription: new Date(),
};

async function createSuperAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    // Vérifie si le super admin existe déjà
    const exists = await User.findOne({ uid: superAdminData.uid });
    if (exists) {
      console.log('Super admin déjà existant :', exists.email);
      await mongoose.disconnect();
      process.exit(0);
    }
    const user = new User(superAdminData);
    await user.save();
    console.log('Super admin créé avec succès !');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Erreur lors de la création du super admin :', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createSuperAdmin();