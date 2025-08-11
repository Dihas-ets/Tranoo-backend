// const admin = require('firebase-admin');

// module.exports = async function (req, res, next) {
//   const authHeader = req.headers.authorization;
//   if (!authHeader || !authHeader.startsWith('Bearer ')) {
//     return res.status(401).json({ message: 'Token manquant ou invalide' });
//   }
//   const idToken = authHeader.split('Bearer ')[1];
//   try {
//     const decodedToken = await admin.auth().verifyIdToken(idToken);
//     req.user = decodedToken;
//     next();
//   } catch (error) {
//     return res.status(401).json({ message: 'Token invalide', error });
//   }
// }; 


// src/middlewares/auth.js
const admin = require('firebase-admin');
const User = require('../models/User');

module.exports = async function (req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant ou invalide' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log('DECODED TOKEN:', decodedToken);
    // On récupère l'utilisateur MongoDB correspondant au uid Firebase
    const user = await User.findOne({ uid: decodedToken.uid });
    console.log('USER FOUND:', user);
    if (!user) {
      return res.status(401).json({ message: 'Utilisateur non trouvé dans la base' });
    }
    req.user = user; // On met l'objet complet (avec _id) dans req.user
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide', error });
  }
};