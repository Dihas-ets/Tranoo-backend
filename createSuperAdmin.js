const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');

dotenv.config();

const previousSuperAdminUid = 'Ms0g2FYxMeN7hJpglokoxbuDdcH2';
const newSuperAdminUid = 'u6SPnAlSVQYcIIX2Fv9ezFBRLRt2';

const superAdminData = {
  uid: newSuperAdminUid,
  nom: 'TRANO',
  prenoms: 'AUTO',
  email: 'tranoauto0@gmail.com',
  telephone: '0141839801',
  role: 'admin',
  typeAdmin: 'superAdmin',
  adresse: 'Abomey-Calavi',
  ville: 'Abomey-Calavi',
  photo: 'https://ui-avatars.com/api/?name=Trano+Auto',
  statut: 'actif',
  langue: 'fr',
  devise: 'XOF',
  dateInscription: new Date(),
};

async function createSuperAdmin() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI est absent du fichier .env.');
  }
  if (!newSuperAdminUid || newSuperAdminUid === 'COLLE_ICI_LE_NOUVEL_UID_FIREBASE') {
    throw new Error('Remplace newSuperAdminUid par le nouvel UID Firebase.');
  }
  if (newSuperAdminUid === previousSuperAdminUid) {
    throw new Error('Le nouvel UID doit être différent de celui du compte à remplacer.');
  }
  if (!process.argv.includes('--confirm-replace')) {
    throw new Error('Relance le script avec --confirm-replace pour confirmer le remplacement.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Base MongoDB cible : ${mongoose.connection.name}`);

  const [uidOwner, emailOwner] = await Promise.all([
    User.findOne({ uid: newSuperAdminUid }).select('uid email'),
    User.findOne({ email: superAdminData.email }).select('uid email'),
  ]);

  if (uidOwner && uidOwner.email.toLowerCase() !== superAdminData.email.toLowerCase()) {
    throw new Error('Cet UID Firebase est déjà lié à un autre compte MongoDB.');
  }
  if (emailOwner && emailOwner.uid !== newSuperAdminUid) {
    throw new Error('Cette adresse e-mail est déjà liée à un autre UID MongoDB.');
  }

  const newAdmin = await User.findOneAndUpdate(
    { uid: newSuperAdminUid },
    { $set: superAdminData },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  if (
    newAdmin.uid !== newSuperAdminUid ||
    newAdmin.email.toLowerCase() !== superAdminData.email.toLowerCase() ||
    newAdmin.role !== 'admin' ||
    newAdmin.typeAdmin !== 'superAdmin'
  ) {
    throw new Error('La vérification du nouveau compte super admin a échoué.');
  }

  const deletion = await User.deleteOne({ uid: previousSuperAdminUid });
  if (deletion.deletedCount === 1) {
    console.log('Ancien compte MongoDB supprimé.');
  } else {
    console.log('Ancien compte MongoDB introuvable ; aucune suppression effectuée.');
  }
  console.log(`Nouveau super admin prêt : ${newAdmin.email}`);
}

createSuperAdmin()
  .catch((err) => {
    console.error('Erreur lors du remplacement du super admin :', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
