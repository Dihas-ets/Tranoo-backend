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
const AuthEvent = require('../models/AuthEvent');
const { ErrorCodes, sendError } = require('../utils/apiResponse');

const DASHBOARD_ADMIN_KEYS = new Set([
  'admin',
  'superAdmin',
  'principal',
  'gestionnaire',
  'moderateur',
  'marketing',
  'responsableService',
  'responsablePaiement',
]);

function isDashboardPaymentsAdmin(user) {
  if (!user) return false;
  if (String(user.role) === 'admin') return true;
  const key = user.typeAdmin || user.role;
  return DASHBOARD_ADMIN_KEYS.has(String(key || ''));
}

/** GET liste ou détail paiement (dashboard historique). */
function isAdminPaymentsReadRoute(originalUrl, method) {
  if (method !== 'GET') return false;
  const path = String(originalUrl || '').split('?')[0];
  if (path === '/api/payments') return true;
  return /^\/api\/payments\/[^/]+\/details$/.test(path);
}

module.exports = async function (req, res, next) {
  console.log('[AUTH] ===== DÉBUT AUTHENTIFICATION =====');
  console.log('[AUTH] Route:', req.method, req.path);

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('[AUTH] ❌ Token manquant ou invalide');
    console.log(
      '[AUTH] Header authorization:',
      authHeader ? 'Présent mais invalide' : 'Absent',
    );
    return sendError(res, 401, ErrorCodes.TOKEN_MISSING);
  }

  const idToken = authHeader.split('Bearer ')[1];
  console.log('[AUTH] Token extrait, longueur:', idToken.length);

  try {
    console.log('[AUTH] Vérification token Firebase...');
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log('[AUTH] ✅ Token Firebase vérifié');
    console.log('[AUTH] Firebase UID:', decodedToken.uid);
    console.log('[AUTH] Firebase Email:', decodedToken.email);

    const uid = decodedToken.uid;
    const email = decodedToken.email;
    const authTimeSec = typeof decodedToken.auth_time === 'number' ? decodedToken.auth_time : null;

    // On récupère d'abord l'utilisateur MongoDB correspondant au uid Firebase
    console.log('[AUTH] Recherche utilisateur MongoDB avec UID:', uid);
    let user = await User.findOne({ uid });

    // Fallback SANS création auto: si uid introuvable, essayer par email
    if (!user && email) {
      console.warn('[AUTH] UID introuvable, tentative de récupération par email:', email);
      const userByEmail = await User.findOne({ email });
      if (userByEmail) {
        console.warn('[AUTH] ✅ Utilisateur retrouvé par email. Synchronisation du UID...');
        userByEmail.uid = uid;
        await userByEmail.save();
        user = userByEmail;
        console.log('[AUTH] ✅ UID synchronisé pour user _id:', user._id);
      } else {
        console.warn('[AUTH] Aucun utilisateur trouvé par email non plus');
      }
    }

    // Si l'utilisateur n'existe toujours pas en base, on refuse l'accès.
    if (!user) {
      console.error('[AUTH] ❌ Utilisateur introuvable dans MongoDB pour uid:', uid);
      return sendError(res, 401, ErrorCodes.USER_NOT_FOUND);
    } else {
      console.log('[AUTH] ✅ Utilisateur trouvé dans MongoDB');
      console.log('[AUTH] MongoDB _id:', user._id);
      console.log('[AUTH] Email MongoDB:', user.email);
      console.log('[AUTH] Role:', user.role);

      // Vérifier si l'utilisateur est bloqué
      if (user.isBlocked) {
        console.error('[AUTH] ❌ Utilisateur bloqué');
        console.error('[AUTH] Date blocage:', user.blockedAt);
        return sendError(res, 403, ErrorCodes.ACCOUNT_BLOCKED, {
          blocked: true,
          blockedAt: user.blockedAt,
        });
      }
    }

    req.user = user; // On met l'objet complet (avec _id) dans req.user

    // Tracking automatique des logins (mobile): basé sur auth_time (évite de dépendre d’un endpoint mobile)
    // - Si l'utilisateur est vendeur (mobile) et auth_time change => on log un "login"
    // - Déduplique naturellement (auth_time ne change pas sur refresh token)
    try {
      const clientPlatform = String(req.headers['x-client-platform'] || '').toLowerCase();
      if (clientPlatform !== 'web' && user.role === 'vendeur' && authTimeSec) {
        const lastAuthTime = user.authMeta?.lastAuthTime || null;
        if (!lastAuthTime || authTimeSec > lastAuthTime) {
          const linkedAgent = await User.findOne({
            role: 'agentCommercial',
            typeAgent: 'Tranoo_pro',
            $or: [
              { 'proVendorAccount.uid': user.uid },
              { 'proVendorAccount.email': user.email },
              { 'mobileCredentials.login': user.email },
            ],
          })
            .select('_id')
            .lean();

          await AuthEvent.create({
            user: user._id,
            uid: user.uid,
            role: user.role,
            agent: linkedAgent?._id || null,
            eventType: 'login',
            deviceId: null,
            client: 'mobile',
            ip: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
          });

          user.authMeta = {
            ...(user.authMeta || {}),
            lastAuthTime: authTimeSec,
            lastAuthEventAt: new Date(),
          };
          await user.save();
        }
      }
    } catch (e) {
      // ne bloque jamais l'auth si le tracking échoue
      console.warn('[AUTH] Tracking login auto échoué:', e?.message || e);
    }

    // Politique session web: 1 seule session à la fois + expiration par inactivité
    const clientPlatform = String(req.headers['x-client-platform'] || '').toLowerCase();
    const skipWebSessionCheck =
      clientPlatform === 'web' &&
      isDashboardPaymentsAdmin(user) &&
      isAdminPaymentsReadRoute(req.originalUrl, req.method);

    if (skipWebSessionCheck) {
      console.log('[AUTH] Lecture paiements admin — session web non exigée:', req.originalUrl);
    }

    if (clientPlatform === 'web' && !skipWebSessionCheck) {
      const webSessionId = String(req.headers['x-web-session-id'] || '');
      const currentSessionId = user?.webSession?.sessionId || null;
      const lastActivityAt = user?.webSession?.lastActivityAt ? new Date(user.webSession.lastActivityAt).getTime() : null;
      const authConfig = require('../config/authConfig');
      const idleMs = authConfig.WEB_SESSION_IDLE_MS;
      const now = Date.now();
      const isSessionBootstrapRoute =
        req.originalUrl.includes('/api/protected/me') ||
        req.originalUrl.includes('/api/auth/web-session/start');

      if (!webSessionId || !currentSessionId) {
        if (isSessionBootstrapRoute) {
          req.user = user;
          console.log('[AUTH] Bootstrap session web autorisé');
          console.log('[AUTH] ✅ Authentification réussie');
          console.log('[AUTH] ===== FIN AUTHENTIFICATION =====');
          return next();
        }
        return sendError(res, 401, ErrorCodes.SESSION_REQUIRED);
      }

      if (webSessionId !== currentSessionId) {
        return sendError(res, 401, ErrorCodes.SESSION_REVOKED);
      }

      if (!lastActivityAt || now - lastActivityAt > idleMs) {
        user.webSession = {
          sessionId: null,
          lastActivityAt: null,
          expiresAt: null,
          clientInfo: null,
        };
        await user.save();
        return sendError(res, 401, ErrorCodes.SESSION_INACTIVE);
      }

      // Throttle de mise à jour pour éviter trop d'écritures
      if (now - lastActivityAt > 30000) {
        user.webSession.lastActivityAt = new Date(now);
        user.webSession.expiresAt = new Date(now + idleMs);
        await user.save();
      }
    }

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
    return sendError(res, 401, ErrorCodes.TOKEN_INVALID, {
      error: error.message,
    });
  }
};