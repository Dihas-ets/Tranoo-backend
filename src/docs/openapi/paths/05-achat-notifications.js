const { op, authed, jsonBody, multipartBody, pathParam, OK } = require('../helpers');

const TAG_ACHAT = 'Achats';
const TAG_NOTIF = 'Notifications';

module.exports = {
  '/api/achat': {
    post: authed(TAG_ACHAT, 'Enregistrer un achat', {
      description: 'Validation paiement / sélection article.',
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/achat/bulk': {
    post: authed(TAG_ACHAT, 'Achat en lot (panier)', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/notifications/test': {
    post: op(TAG_NOTIF, 'Test notification (dev)', {
      description: 'Sans auth — à désactiver en production.',
      security: [],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/notifications': {
    get: authed(TAG_NOTIF, 'Mes notifications', { responses: { 200: OK } }),
  },
  '/api/notifications/unread-count': {
    get: authed(TAG_NOTIF, 'Compteur non lues', { responses: { 200: OK } }),
  },
  '/api/notifications/mark-all-read': {
    put: authed(TAG_NOTIF, 'Tout marquer comme lu', { responses: { 200: OK } }),
  },
  '/api/notifications/{notificationId}/read': {
    put: authed(TAG_NOTIF, 'Marquer comme lue', {
      parameters: [pathParam('notificationId', 'ID notification')],
      responses: { 200: OK },
    }),
  },
  '/api/notifications/{notificationId}/unread': {
    put: authed(TAG_NOTIF, 'Marquer comme non lue', {
      parameters: [pathParam('notificationId', 'ID notification')],
      responses: { 200: OK },
    }),
  },
  '/api/notifications/{notificationId}': {
    delete: authed(TAG_NOTIF, 'Supprimer notification', {
      parameters: [pathParam('notificationId', 'ID notification')],
      responses: { 200: OK },
    }),
  },
  '/api/notifications/{notificationId}/verification-action': {
    post: authed(TAG_NOTIF, 'Action vérification (approve/reject)', {
      parameters: [pathParam('notificationId', 'ID notification')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/notifications/verification': {
    post: authed(TAG_NOTIF, 'Créer notification vérification (admin)', {
      description: 'Rôles : superAdmin, principal, gestionnaire.',
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/notifications/admin-message': {
    post: authed(TAG_NOTIF, 'Message admin générique', {
      description: 'Push message admin vers utilisateurs ciblés.',
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/notifications/verification-pdf': {
    post: authed(TAG_NOTIF, 'Upload PDF vérification', {
      requestBody: multipartBody('Champ multipart « pdf » (max 20 Mo)'),
      responses: { 200: OK },
    }),
  },
  '/api/notifications/search-request': {
    post: authed(TAG_NOTIF, 'Demande recherche véhicule', {
      description: 'Notifie les vendeurs correspondants.',
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/notifications/piece-search-request': {
    post: authed(TAG_NOTIF, 'Demande recherche pièce', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
};
