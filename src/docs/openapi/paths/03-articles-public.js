const { op, authed, jsonBody, pathParam, OK, CREATED } = require('../helpers');

const TAG_ART = 'Articles';
const TAG_UPLOAD = 'Upload';
const TAG_PUBLIC = 'Public (Landing)';

module.exports = {
  '/api/articles': {
    get: authed(TAG_ART, 'Lister les articles', {
      description: 'Filtres query selon rôle (vendeur, acheteur, admin).',
      responses: { 200: OK },
    }),
    post: authed(TAG_ART, 'Créer un article', {
      requestBody: jsonBody('#/components/schemas/ArticleInput'),
      responses: { 201: CREATED },
    }),
  },
  '/api/articles/{id}': {
    get: authed(TAG_ART, 'Détail article', {
      parameters: [pathParam('id', 'ID article')],
      responses: { 200: OK },
    }),
    put: authed(TAG_ART, 'Modifier un article', {
      parameters: [pathParam('id', 'ID article')],
      requestBody: jsonBody('#/components/schemas/ArticleInput'),
      responses: { 200: OK },
    }),
    delete: authed(TAG_ART, 'Supprimer un article', {
      parameters: [pathParam('id', 'ID article')],
      responses: { 200: OK },
    }),
  },
  '/api/articles/{id}/verification-buyer': {
    get: authed(TAG_ART, 'Infos vérification côté acheteur', {
      parameters: [pathParam('id', 'ID article')],
      responses: { 200: OK },
    }),
  },
  '/api/articles/{id}/statut': {
    put: authed(TAG_ART, 'Changer le statut article', {
      parameters: [pathParam('id', 'ID article')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/articles/{id}/stock': {
    patch: authed(TAG_ART, 'Mettre à jour le stock', {
      parameters: [pathParam('id', 'ID article')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/articles/{id}/vendu': {
    put: authed(TAG_ART, 'Marquer comme vendu', {
      parameters: [pathParam('id', 'ID article')],
      responses: { 200: OK },
    }),
  },
  '/api/articles/{id}/livraison': {
    patch: authed(TAG_ART, 'Mettre à jour date livraison', {
      parameters: [pathParam('id', 'ID article')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/articles/achats/{acheteurId}': {
    get: authed(TAG_ART, 'Achats par acheteur', {
      parameters: [pathParam('acheteurId', 'ID acheteur')],
      responses: { 200: OK },
    }),
  },

  '/api/upload/video': {
    post: authed(TAG_UPLOAD, 'Upload et transcodage vidéo', {
      description: 'Upload multipart vidéo, transcodage FFmpeg côté serveur.',
      requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { video: { type: 'string', format: 'binary' } } } } } },
      responses: { 200: OK },
    }),
  },

  '/api/public/articles': {
    get: op(TAG_PUBLIC, 'Articles publics (landing)', {
      description: 'Sans authentification — catalogue vitrine.',
      security: [],
      responses: { 200: OK },
    }),
  },
  '/api/public/publicites': {
    get: op(TAG_PUBLIC, 'Publicités publiques (landing)', {
      security: [],
      responses: { 200: OK },
    }),
  },
  '/api/public/users/phone-by-email': {
    post: op(TAG_PUBLIC, 'Téléphone par email', {
      security: [],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/public/verification-reports/{token}': {
    get: op(TAG_PUBLIC, 'PDF rapport vérification', {
      description: 'URL publique proxy pour Meta/WhatsApp (token signé).',
      security: [],
      parameters: [pathParam('token', 'Token rapport vérification')],
      responses: { 200: { description: 'Fichier PDF' } },
    }),
  },
};
