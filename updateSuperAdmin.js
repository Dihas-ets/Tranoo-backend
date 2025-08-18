// Script pour mettre à jour un super admin manuellement dans MongoDB
// À utiliser pour garantir que tous les champs sont bien renseignés

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');

dotenv.config();

const uid = 'Ms0g2FYxMeN7hJpglokoxbuDdcH2'; // Remplacer par le bon uid si besoin

async function updateSuperAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const user = await User.findOneAndUpdate(
      { uid },
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
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Erreur lors de la mise à jour du super admin :', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

updateSuperAdmin();
