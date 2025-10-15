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
  console.log('[AUTH] headers.authorization:', authHeader);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('[AUTH] Token manquant ou invalide');
    return res.status(401).json({ message: 'Token manquant ou invalide' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log('[AUTH] DECODED TOKEN:', decodedToken);
    // On récupère l'utilisateur MongoDB correspondant au uid Firebase
    const user = await User.findOne({ uid: decodedToken.uid });
    console.log('[AUTH] USER FOUND:', user);
    if (!user) {
      console.error('[AUTH] Utilisateur non trouvé dans la base');
      return res.status(401).json({ message: 'Utilisateur non trouvé dans la base' });
    }
    
    // Vérifier si l'utilisateur est bloqué
    if (user.isBlocked) {
      console.error('[AUTH] Utilisateur bloqué');
      return res.status(403).json({ 
        message: 'Votre compte a été bloqué. Contactez l\'administration.',
        blocked: true,
        blockedAt: user.blockedAt
      });
    }
    
    req.user = user; // On met l'objet complet (avec _id) dans req.user
    next();
  } catch (error) {
    console.error('[AUTH] Token invalide', error);
    return res.status(401).json({ message: 'Token invalide', error });
  }
};