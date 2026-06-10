const { authed, jsonBody, pathParam, OK, CREATED } = require('../helpers');

const TAG_PUB = 'Publicités';
const TAG_CHAUF = 'Certification Chauffeur';
const TAG_CHAT = 'Chat';

module.exports = {
  '/api/publicites': {
    get: authed(TAG_PUB, 'Lister les demandes de pub', { responses: { 200: OK } }),
    post: authed(TAG_PUB, 'Créer une demande de pub', {
      requestBody: jsonBody(null),
      responses: { 201: CREATED },
    }),
  },
  '/api/publicites/{id}': {
    get: authed(TAG_PUB, 'Détail demande pub', {
      parameters: [pathParam('id', 'ID publicité')],
      responses: { 200: OK },
    }),
    delete: authed(TAG_PUB, 'Supprimer une demande', {
      parameters: [pathParam('id', 'ID publicité')],
      responses: { 200: OK },
    }),
  },
  '/api/publicites/{id}/statut': {
    put: authed(TAG_PUB, 'Changer statut pub (admin)', {
      parameters: [pathParam('id', 'ID publicité')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    patch: authed(TAG_PUB, 'Changer statut pub (admin) — PATCH', {
      parameters: [pathParam('id', 'ID publicité')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/chauffeurs/demandes': {
    get: authed(TAG_CHAUF, 'Lister demandes certification', { responses: { 200: OK } }),
    post: authed(TAG_CHAUF, 'Créer demande certification', {
      requestBody: jsonBody(null),
      responses: { 201: CREATED },
    }),
  },
  '/api/chauffeurs/demandes/{id}': {
    get: authed(TAG_CHAUF, 'Détail demande certification', {
      parameters: [pathParam('id', 'ID demande')],
      responses: { 200: OK },
    }),
    delete: authed(TAG_CHAUF, 'Supprimer demande', {
      parameters: [pathParam('id', 'ID demande')],
      responses: { 200: OK },
    }),
  },
  '/api/chauffeurs/demandes/{id}/statut': {
    put: authed(TAG_CHAUF, 'Changer statut certification (admin)', {
      parameters: [pathParam('id', 'ID demande')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/chat/room': {
    post: authed(TAG_CHAT, 'Créer ou récupérer une salle', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/chat/rooms': {
    get: authed(TAG_CHAT, 'Mes salles de chat', { responses: { 200: OK } }),
  },
  '/api/chat/message': {
    post: authed(TAG_CHAT, 'Envoyer un message', {
      requestBody: jsonBody('#/components/schemas/ChatMessage'),
      responses: { 200: OK },
    }),
  },
  '/api/chat/messages/{roomId}': {
    get: authed(TAG_CHAT, 'Messages d\'une salle', {
      parameters: [pathParam('roomId', 'ID salle')],
      responses: { 200: OK },
    }),
  },
  '/api/chat/messages/{roomId}/read': {
    post: authed(TAG_CHAT, 'Marquer messages lus', {
      parameters: [pathParam('roomId', 'ID salle')],
      responses: { 200: OK },
    }),
  },
  '/api/chat/messages/{roomId}/search': {
    get: authed(TAG_CHAT, 'Rechercher dans une salle', {
      parameters: [pathParam('roomId', 'ID salle')],
      responses: { 200: OK },
    }),
  },
  '/api/chat/messages/{roomId}/history': {
    get: authed(TAG_CHAT, 'Historique paginé messages', {
      parameters: [pathParam('roomId', 'ID salle')],
      responses: { 200: OK },
    }),
  },
  '/api/chat/messages/{messageId}': {
    delete: authed(TAG_CHAT, 'Supprimer un message', {
      parameters: [pathParam('messageId', 'ID message')],
      responses: { 200: OK },
    }),
  },
  '/api/chat/unread-count': {
    get: authed(TAG_CHAT, 'Nombre messages non lus', { responses: { 200: OK } }),
  },
  '/api/chat/rooms/{roomId}/participants-status': {
    get: authed(TAG_CHAT, 'Statut participants salle', {
      parameters: [pathParam('roomId', 'ID salle')],
      responses: { 200: OK },
    }),
  },
};
