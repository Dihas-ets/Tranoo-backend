const { op, authed, jsonBody, OK, CREATED } = require('../helpers');

const TAG_AUTH = 'Authentification';
const TAG_OTP = 'OTP & Mot de passe';
const TAG_PROTECTED = 'Profil & Session';
const TAG_AUTH_EVT = 'Événements Auth';
const TAG_DEMO = 'Événements Démo';

module.exports = {
  '/': {
    get: op('Santé', 'Statut API', {
      description: 'Vérifie que le serveur répond.',
      security: [],
      responses: { 200: { description: 'API opérationnelle', content: { 'text/plain': { schema: { type: 'string' } } } } },
    }),
  },

  '/api/auth/register': {
    post: op(TAG_AUTH, 'Inscription utilisateur', {
      description: 'Crée un compte Firebase + document MongoDB (mobile ou web).',
      security: [],
      requestBody: jsonBody('#/components/schemas/RegisterRequest'),
      responses: { 201: CREATED, 400: OK },
    }),
  },
  '/api/auth/web-session/start': {
    post: authed(TAG_AUTH, 'Démarrer session web', {
      description: 'Enregistre une session unique pour le dashboard web (header X-Web-Session-Id).',
      requestBody: jsonBody('#/components/schemas/WebSessionStart', { required: false }),
      responses: { 200: OK },
    }),
  },
  '/api/auth/web-session/end': {
    post: authed(TAG_AUTH, 'Terminer session web', {
      description: 'Révoque la session web courante.',
      responses: { 200: OK },
    }),
  },

  '/api/auth-events/login': {
    post: authed(TAG_AUTH_EVT, 'Enregistrer un login', {
      description: 'Traçage explicite connexion mobile (complète le tracking auto auth).',
      responses: { 200: OK },
    }),
  },
  '/api/auth-events/logout': {
    post: authed(TAG_AUTH_EVT, 'Enregistrer un logout', {
      responses: { 200: OK },
    }),
  },

  '/api/demo-events/track': {
    post: authed(TAG_DEMO, 'Tracker un événement démo', {
      description: 'Enregistre un clic ou action preuve démo.',
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/protected/me': {
    get: authed(TAG_PROTECTED, 'Profil utilisateur connecté', {
      description: 'Retourne l\'objet user MongoDB (sans mot de passe). Bootstrap session web autorisé.',
      responses: { 200: OK },
    }),
  },
  '/api/protected/stats': {
    get: authed(TAG_PROTECTED, 'Statistiques générales', { responses: { 200: OK } }),
  },
  '/api/protected/stats/acheteurs': {
    get: authed(TAG_PROTECTED, 'Statistiques acheteurs', { responses: { 200: OK } }),
  },
  '/api/protected/stats/dashboard-finance': {
    get: authed(TAG_PROTECTED, 'Dashboard finance', { responses: { 200: OK } }),
  },
  '/api/protected/stats/seller-marque': {
    get: authed(TAG_PROTECTED, 'Stats vendeur par marque', { responses: { 200: OK } }),
  },

  '/api/push-otp/request': {
    post: op(TAG_OTP, 'Demander un code OTP reset', {
      description: 'Envoie OTP WhatsApp + fallback notification FCM.',
      security: [],
      requestBody: jsonBody('#/components/schemas/PasswordResetRequest'),
      responses: { 200: OK, 400: OK, 404: OK, 409: OK, 503: OK },
    }),
  },
  '/api/push-otp/verify-code': {
    post: op(TAG_OTP, 'Vérifier le code OTP', {
      security: [],
      requestBody: jsonBody('#/components/schemas/VerifyResetCode'),
      responses: { 200: OK, 400: OK, 403: OK, 429: OK },
    }),
  },
  '/api/push-otp/reset-password': {
    post: op(TAG_OTP, 'Réinitialiser le mot de passe', {
      security: [],
      requestBody: jsonBody('#/components/schemas/ResetPassword'),
      responses: { 200: OK, 400: OK, 403: OK, 404: OK },
    }),
  },
  '/api/push-otp/send-otp': {
    post: op(TAG_OTP, '[Legacy] Envoyer OTP push seul', {
      description: 'Ancien flux OTP lié au FCM token enregistré. Préférer /request.',
      security: [],
      deprecated: true,
      requestBody: jsonBody(null),
      responses: { 200: OK, 400: OK, 403: OK, 404: OK },
    }),
  },
  '/api/push-otp/verify-otp': {
    post: op(TAG_OTP, '[Legacy] Vérifier OTP et reset', {
      description: 'Ancien flux combiné verify + reset. Préférer verify-code puis reset-password.',
      security: [],
      deprecated: true,
      requestBody: jsonBody(null),
      responses: { 200: OK, 400: OK, 404: OK },
    }),
  },
};
