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
      process.exit(0);
    }
    const user = new User(superAdminData);
    await user.save();
    console.log('Super admin créé avec succès !');
    process.exit(0);
  } catch (err) {
    console.error('Erreur lors de la création du super admin :', err);
    process.exit(1);
  }
}

createSuperAdmin(); 

// Remplis le script
// Ouvre createSuperAdmin.js.
// Remplace les valeurs dans superAdminData :
// uid : le uid copié depuis Firebase Auth
// nom, prenoms, email, telephone, etc. : les infos de ton super admin

// Lance le script
// Dans le terminal, à la racine du projet :
// Apply to createSuperA...
// Run
// Si tout va bien, tu verras :
// Super admin créé avec succès !
// Si le super admin existe déjà, tu verras un message d'info.

// Script de mise à jour du super admin pour garantir que tous les champs sont bien renseignés
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ton-nom-bdd');

(async () => {
  try {
    const user = await User.findOneAndUpdate(
      { uid: 'Ms0g2FYxMeN7hJpglokoxbuDdcH2' },
      {
        nom: 'GNACADJA',
        prenoms: 'Laurinda',
        photo: 'https://ui-avatars.com/api/?name=Laurinda+GNACADJA',
        email: 'gnacadjalaurinda@gmail.com',
        statut: 'actif',
        typeAdmin: 'superAdmin',
        role: 'admin',
        adresse: 'Abomey_Calavi',
        ville: 'Abomey_Calavi',
        langue: 'fr',
        devise: 'XOF',
        dateInscription: new Date(),
      },
      { new: true }
    );
    console.log('Super admin mis à jour:', user);
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
})();