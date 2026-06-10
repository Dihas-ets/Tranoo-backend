const { authed, jsonBody, multipartBody, pathParam, OK, CREATED } = require('../helpers');

const TAG_USERS = 'Utilisateurs';
const TAG_SETTINGS = 'Paramètres';

module.exports = {
  '/api/users': {
    get: authed(TAG_USERS, 'Lister tous les utilisateurs', {
      description: 'Liste paginée (admin / dashboard).',
      responses: { 200: OK },
    }),
    post: authed(TAG_USERS, 'Créer un utilisateur (admin)', {
      description: 'Rôles admin requis : superAdmin, principal, gestionnaire.',
      requestBody: jsonBody(null),
      responses: { 201: CREATED },
    }),
  },
  '/api/users/vendeurs/all': {
    get: authed(TAG_USERS, 'Lister tous les vendeurs', { responses: { 200: OK } }),
  },
  '/api/users/acheteurs/all': {
    get: authed(TAG_USERS, 'Lister tous les acheteurs', { responses: { 200: OK } }),
  },
  '/api/users/acheteurs/achats': {
    get: authed(TAG_USERS, 'Acheteurs avec historique achats', { responses: { 200: OK } }),
  },
  '/api/users/transitaires/all': {
    get: authed(TAG_USERS, 'Lister tous les transitaires', { responses: { 200: OK } }),
  },
  '/api/users/chauffeurs/all': {
    get: authed(TAG_USERS, 'Lister tous les chauffeurs', { responses: { 200: OK } }),
  },
  '/api/users/admins/all': {
    get: authed(TAG_USERS, 'Lister tous les admins', { responses: { 200: OK } }),
  },
  '/api/users/me': {
    patch: authed(TAG_USERS, 'Mettre à jour mon profil', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    delete: authed(TAG_USERS, 'Supprimer mon compte', { responses: { 200: OK } }),
  },
  '/api/users/password': {
    patch: authed(TAG_USERS, 'Changer mon mot de passe', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/users/fcm-token': {
    post: authed(TAG_USERS, 'Enregistrer token FCM', {
      description: 'Associe le token push à l\'appareil courant.',
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/users/me/favoris': {
    get: authed(TAG_USERS, 'Mes favoris', { responses: { 200: OK } }),
    post: authed(TAG_USERS, 'Ajouter un favori', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    delete: authed(TAG_USERS, 'Retirer un favori', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/users/users/photo': {
    post: authed(TAG_USERS, 'Upload photo de profil', {
      requestBody: multipartBody('Champ multipart « photo »'),
      responses: { 200: OK },
    }),
  },
  '/api/users/{id}': {
    get: authed(TAG_USERS, 'Détail utilisateur par ID', {
      parameters: [pathParam('id', 'ID MongoDB utilisateur')],
      responses: { 200: OK },
    }),
    put: authed(TAG_USERS, 'Modifier un utilisateur (admin)', {
      parameters: [pathParam('id', 'ID MongoDB utilisateur')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    delete: authed(TAG_USERS, 'Supprimer un utilisateur (admin)', {
      parameters: [pathParam('id', 'ID MongoDB utilisateur')],
      responses: { 200: OK },
    }),
  },
  '/api/users/{id}/password': {
    put: authed(TAG_USERS, 'Réinitialiser mot de passe utilisateur (admin)', {
      parameters: [pathParam('id', 'ID MongoDB utilisateur')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/users/{id}/activites': {
    get: authed(TAG_USERS, 'Activités chauffeur', {
      parameters: [pathParam('id', 'ID chauffeur')],
      responses: { 200: OK },
    }),
  },
  '/api/users/{id}/block': {
    patch: authed(TAG_USERS, 'Bloquer un utilisateur', {
      parameters: [pathParam('id', 'ID utilisateur')],
      responses: { 200: OK },
    }),
  },
  '/api/users/{id}/unblock': {
    patch: authed(TAG_USERS, 'Débloquer un utilisateur', {
      parameters: [pathParam('id', 'ID utilisateur')],
      responses: { 200: OK },
    }),
  },
  '/api/users/{id}/reset-firebase-password': {
    post: authed(TAG_USERS, 'Reset mot de passe Firebase (admin)', {
      parameters: [pathParam('id', 'ID utilisateur')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/settings': {
    get: authed(TAG_SETTINGS, 'Récupérer mes paramètres', { responses: { 200: OK } }),
    patch: authed(TAG_SETTINGS, 'Mettre à jour mes paramètres', {
      requestBody: jsonBody('#/components/schemas/UserSettings'),
      responses: { 200: OK },
    }),
  },
  '/api/settings/language': {
    patch: authed(TAG_SETTINGS, 'Changer la langue', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/settings/currency': {
    patch: authed(TAG_SETTINGS, 'Changer la devise', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/settings/notifications': {
    patch: authed(TAG_SETTINGS, 'Préférences notifications', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
};
