const admin = require('firebase-admin');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Contrôleur pour l'inscription d'un utilisateur (mobile ou admin)
exports.register = async (req, res) => {
  try {
    const {
      nom,
      prenoms,
      email,
      telephone,
      role,
      pays,
      maison,
      entreprise,
      registreCommerce,
      numeroIFU,
      entrepriseProvenance,
      adresse,
      ville,
      photo,
      typeAdmin,
      statutContrat,
      password
    } = req.body;

    // Cas spécial : création d'admin via dashboard (avec mot de passe)
    if (role === 'admin' && password) {
      // Vérifier si l'email existe déjà
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Un utilisateur avec cet email existe déjà' });
      }

      // Créer l'utilisateur dans Firebase Auth
      const firebaseUser = await admin.auth().createUser({
        email,
        password,
        displayName: `${prenoms} ${nom}`
      });

      // Hasher le mot de passe pour MongoDB
      const hashedPassword = await bcrypt.hash(password, 10);

      // Créer l'utilisateur dans MongoDB
      const user = new User({
        uid: firebaseUser.uid,
        nom,
        prenoms,
        email,
        telephone,
        role,
        adresse,
        ville,
        photo,
        typeAdmin,
        statutContrat,
        password: hashedPassword,
        statut: 'actif',
        dateInscription: new Date(),
      });

      await user.save();
      return res.status(201).json({ message: 'Administrateur créé avec succès', user, _id: user._id });
    }

    // Cas normal : utilisateurs mobiles avec token Firebase
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token manquant ou invalide' });
    }
    const idToken = authHeader.split('Bearer ')[1];

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const userEmail = decodedToken.email;

    let user = await User.findOne({ uid });
    if (user) {
      return res.status(200).json({ message: 'Utilisateur déjà enregistré', user });
    }

    user = new User({
      uid,
      nom,
      prenoms,
      email: userEmail,
      telephone,
      role,
      pays,
      maison,
      entreprise,
      registreCommerce,
      numeroIFU,
      entrepriseProvenance,
      adresse,
      ville,
      photo,
      typeAdmin,
      statutContrat,
      statut: 'actif',
      dateInscription: new Date(),
    });

    await user.save();
    return res.status(201).json({ message: 'Utilisateur enregistré', user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erreur lors de l\'inscription', error });
  }
}; 