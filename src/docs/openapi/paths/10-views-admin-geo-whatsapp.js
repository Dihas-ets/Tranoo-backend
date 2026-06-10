const { op, authed, jsonBody, pathParam, queryParam, OK } = require('../helpers');

const TAG_VIEWS = 'Vues & Statistiques';
const TAG_ADMIN_PRICE = 'Admin — Tarifs';
const TAG_ADMIN_DOC = 'Admin — Documents';
const TAG_GEO = 'Géographie Bénin';
const TAG_WA = 'WhatsApp';

module.exports = {
  '/api/views/articles/{articleId}/view': {
    post: op(TAG_VIEWS, 'Enregistrer une vue article', {
      security: [],
      parameters: [pathParam('articleId', 'ID article')],
      responses: { 200: OK },
    }),
  },
  '/api/views/articles/{articleId}/views': {
    get: op(TAG_VIEWS, 'Compteur vues article', {
      security: [],
      parameters: [pathParam('articleId', 'ID article')],
      responses: { 200: OK },
    }),
  },
  '/api/views/articles/most-viewed': {
    get: op(TAG_VIEWS, 'Articles les plus vus', {
      security: [],
      responses: { 200: OK },
    }),
  },
  '/api/views/batch-update': {
    post: authed(TAG_VIEWS, 'Mise à jour batch vues', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/admin/pub-pricing': {
    get: authed(TAG_ADMIN_PRICE, 'Tarifs publicité', { responses: { 200: OK } }),
    post: authed(TAG_ADMIN_PRICE, 'Mettre à jour tarifs pub', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    put: authed(TAG_ADMIN_PRICE, 'Mettre à jour tarifs pub (PUT)', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/admin/subscription-pricing': {
    get: authed(TAG_ADMIN_PRICE, 'Tarifs abonnement', { responses: { 200: OK } }),
    post: authed(TAG_ADMIN_PRICE, 'Mettre à jour tarifs abonnement', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    put: authed(TAG_ADMIN_PRICE, 'Mettre à jour tarifs abonnement (PUT)', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/admin/verification-pricing': {
    get: authed(TAG_ADMIN_PRICE, 'Tarifs vérification véhicule', { responses: { 200: OK } }),
    post: authed(TAG_ADMIN_PRICE, 'Mettre à jour tarifs vérification', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    put: authed(TAG_ADMIN_PRICE, 'Mettre à jour tarifs vérification (PUT)', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/admin/documents': {
    get: authed(TAG_ADMIN_DOC, 'Lister documents admin', { responses: { 200: OK } }),
  },

  '/api/geo/benin/departements': {
    get: op(TAG_GEO, 'Liste départements', {
      security: [],
      responses: { 200: OK },
    }),
  },
  '/api/geo/benin/communes': {
    get: op(TAG_GEO, 'Liste communes', {
      security: [],
      parameters: [queryParam('departement', 'Filtrer par département')],
      responses: { 200: OK },
    }),
  },
  '/api/geo/benin/villes': {
    get: op(TAG_GEO, 'Liste villes', {
      security: [],
      parameters: [queryParam('commune', 'Filtrer par commune')],
      responses: { 200: OK },
    }),
  },
  '/api/geo/benin/quartiers': {
    get: op(TAG_GEO, 'Liste quartiers', {
      security: [],
      parameters: [queryParam('ville', 'Filtrer par ville')],
      responses: { 200: OK },
    }),
  },

  '/api/whatsapp/webhook': {
    get: op(TAG_WA, 'Vérification webhook Meta', {
      description: 'Challenge hub.verify_token pour configuration Meta.',
      security: [],
      parameters: [
        queryParam('hub.mode', 'Mode vérification'),
        queryParam('hub.verify_token', 'Token configuré'),
        queryParam('hub.challenge', 'Challenge à retourner'),
      ],
      responses: { 200: OK },
    }),
    post: op(TAG_WA, 'Événements webhook Meta', {
      description: 'Statuts livraison messages WhatsApp (OTP reset).',
      security: [],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
};
