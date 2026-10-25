const admin = require('firebase-admin');

module.exports = async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();

  if (!authHeader.startsWith('Bearer ')) {
    console.warn('[OPTIONAL_AUTH] En-tête Authorization invalide; clic compté anonymement.');
    return next();
  }

  const idToken = authHeader.slice('Bearer '.length);
  if (!idToken) {
    console.warn('[OPTIONAL_AUTH] Jeton vide; clic compté anonymement.');
    return next();
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.firebaseUid = decodedToken.uid;
    return next();
  } catch (error) {
    console.warn(
      '[OPTIONAL_AUTH] Vérification Firebase échouée; clic compté anonymement:',
      error.message,
    );
    return next();
  }
};
