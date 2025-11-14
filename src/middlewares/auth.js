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
  console.log('[AUTH] ===== DÉBUT AUTHENTIFICATION =====');
  console.log('[AUTH] Route:', req.method, req.path);
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('[AUTH] ❌ Token manquant ou invalide');
    console.log('[AUTH] Header authorization:', authHeader ? 'Présent mais invalide' : 'Absent');
    return res.status(401).json({ message: 'Token manquant ou invalide' });
  }
  
  const idToken = authHeader.split('Bearer ')[1];
  console.log('[AUTH] Token extrait, longueur:', idToken.length);
  
  try {
    console.log('[AUTH] Vérification token Firebase...');
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log('[AUTH] ✅ Token Firebase vérifié');
    console.log('[AUTH] Firebase UID:', decodedToken.uid);
    console.log('[AUTH] Firebase Email:', decodedToken.email);
    
    // On récupère l'utilisateur MongoDB correspondant au uid Firebase
    console.log('[AUTH] Recherche utilisateur MongoDB avec UID:', decodedToken.uid);
    const user = await User.findOne({ uid: decodedToken.uid });
    
    if (!user) {
      console.error('[AUTH] ❌ Utilisateur non trouvé dans MongoDB');
      console.error('[AUTH] UID recherché:', decodedToken.uid);
      console.error('[AUTH] Email Firebase:', decodedToken.email);
      return res.status(401).json({ 
        message: 'Utilisateur non trouvé dans la base',
        uid: decodedToken.uid,
        email: decodedToken.email
      });
    }
    
    console.log('[AUTH] ✅ Utilisateur trouvé dans MongoDB');
    console.log('[AUTH] MongoDB _id:', user._id);
    console.log('[AUTH] Email MongoDB:', user.email);
    console.log('[AUTH] Role:', user.role);
    
    // Vérifier si l'utilisateur est bloqué
    if (user.isBlocked) {
      console.error('[AUTH] ❌ Utilisateur bloqué');
      console.error('[AUTH] Date blocage:', user.blockedAt);
      return res.status(403).json({ 
        message: 'Votre compte a été bloqué. Contactez l\'administration.',
        blocked: true,
        blockedAt: user.blockedAt
      });
    }
    
    req.user = user; // On met l'objet complet (avec _id) dans req.user
    console.log('[AUTH] ✅ Authentification réussie');
    console.log('[AUTH] ===== FIN AUTHENTIFICATION =====');
    next();
  } catch (error) {
    console.error('[AUTH] ===== ERREUR AUTHENTIFICATION =====');
    console.error('[AUTH] Type erreur:', error.name);
    console.error('[AUTH] Message erreur:', error.message);
    console.error('[AUTH] Code erreur:', error.code);
    if (error.stack) {
      console.error('[AUTH] Stack trace:', error.stack);
    }
    return res.status(401).json({ 
      message: 'Token invalide', 
      error: error.message,
      code: error.code
    });
  }
};