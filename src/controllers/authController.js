const admin = require('firebase-admin');
const User = require('../models/User');

// Contrôleur pour l'inscription d'un utilisateur (mobile ou admin)
exports.register = async (req, res) => {
  try {
    // 1. Récupérer le token envoyé par le front dans l'en-tête Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token manquant ou invalide' });
    }
    const idToken = authHeader.split('Bearer ')[1];

    // 2. Vérifier le token auprès de Firebase
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // 3. Vérifier si l'utilisateur existe déjà dans MongoDB
    let user = await User.findOne({ uid });
    if (user) {
      return res.status(200).json({ message: 'Utilisateur déjà enregistré', user });
    }

    // 4. Récupérer les infos du formulaire envoyées dans le body
    const {
      nom,
      prenoms,
      telephone,
      role,
      pays,
      maison,
      entreprise,
      adresse,
      ville,
      photo,
      typeAdmin
    } = req.body;

    // 5. Créer un nouvel utilisateur avec tous les champs pertinents
    user = new User({
      uid,
      nom,
      prenoms,
      email,
      telephone,
      role,
      pays,
      maison,
      entreprise,
      adresse,
      ville,
      photo,
      typeAdmin,
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