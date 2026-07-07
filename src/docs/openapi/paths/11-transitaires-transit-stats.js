const { op, authed, jsonBody, pathParam, queryParam, OK } = require('../helpers');

const TAG_PUBLIC = 'Public (Landing)';
const TAG_GEO = 'Géographie';
const TAG_PROFILE = 'Profil & Session';
const TAG_USERS = 'Utilisateurs';
const TAG_LIV = 'Livraisons';
const TAG_TRANS = 'Transitaires';
const TAG_ADMIN_PRICE = 'Admin — Tarifs';
const TAG_ADMIN_DOC = 'Admin — Documents';

module.exports = {
  '/api/public/articles/{id}': {
    get: op(TAG_PUBLIC, 'Détail article public', {
      description:
        'Détail d’un article sans authentification, utilisé notamment pour le partage externe.',
      security: [],
      parameters: [pathParam('id', 'ID article')],
      responses: { 200: OK },
    }),
  },

  '/api/geo/countries': {
    get: op(TAG_GEO, 'Suggérer des pays', {
      security: [],
      parameters: [queryParam('q', 'Texte recherché')],
      responses: { 200: OK },
    }),
  },
  '/api/geo/normalize': {
    post: op(TAG_GEO, 'Normaliser une localisation', {
      security: [],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/protected/stats/nav-badges': {
    get: authed(TAG_PROFILE, 'Compteurs badges navigation admin', {
      responses: { 200: OK },
    }),
  },
  '/api/protected/stats/nav-badges/mark-seen': {
    post: authed(TAG_PROFILE, 'Marquer les badges admin comme vus', {
      requestBody: jsonBody(null, { required: false }),
      responses: { 200: OK },
    }),
  },
  '/api/protected/stats/livreurs': {
    get: authed(TAG_PROFILE, 'Statistiques livreurs', {
      responses: { 200: OK },
    }),
  },

  '/api/users/livreurs/all': {
    get: authed(TAG_USERS, 'Lister tous les livreurs', {
      responses: { 200: OK },
    }),
  },

  '/api/admin/transitaire-subscription-pricing': {
    get: authed(TAG_ADMIN_PRICE, 'Tarifs abonnement transitaire', {
      responses: { 200: OK },
    }),
    post: authed(TAG_ADMIN_PRICE, 'Mettre à jour tarifs abonnement transitaire', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    put: authed(
      TAG_ADMIN_PRICE,
      'Mettre à jour tarifs abonnement transitaire (PUT)',
      {
        requestBody: jsonBody(null),
        responses: { 200: OK },
      }
    ),
  },

  '/api/admin/documents/bulk-delete': {
    post: authed(TAG_ADMIN_DOC, 'Supprimer plusieurs documents admin', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/transit-missions/start': {
    post: authed(TAG_LIV, 'Démarrer un parcours transitaire', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/transit-missions/select-transitaire': {
    post: authed(TAG_LIV, 'Sélectionner un transitaire', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/transit-missions/transferer': {
    post: authed(TAG_LIV, 'Transférer une mission transitaire', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/transit-missions/mes-parcours': {
    get: authed(TAG_LIV, 'Mes parcours transitaire', {
      responses: { 200: OK },
    }),
  },
  '/api/transit-missions/parcours/{articleId}': {
    get: authed(TAG_LIV, 'Parcours d’un article', {
      parameters: [pathParam('articleId', 'ID article')],
      responses: { 200: OK },
    }),
  },
  '/api/transit-missions/mes-missions': {
    get: authed(TAG_LIV, 'Mes missions transitaires', {
      responses: { 200: OK },
    }),
  },
  '/api/transit-missions/acceptes': {
    get: authed(TAG_LIV, 'Missions acceptées', {
      description: 'Route de compatibilité historique Flutter.',
      responses: { 200: OK },
    }),
  },
  '/api/transit-missions/{id}/marquer-traite': {
    patch: authed(TAG_LIV, 'Marquer mission traitée', {
      parameters: [pathParam('id', 'ID mission')],
      requestBody: jsonBody(null, { required: false }),
      responses: { 200: OK },
    }),
  },
  '/api/transit-missions/{id}/rejeter-attribution': {
    patch: authed(TAG_LIV, 'Rejeter attribution mission', {
      parameters: [pathParam('id', 'ID mission')],
      requestBody: jsonBody(null, { required: false }),
      responses: { 200: OK },
    }),
  },
  '/api/transit-missions/{id}/details': {
    patch: authed(TAG_LIV, 'Mettre à jour détails mission', {
      parameters: [pathParam('id', 'ID mission')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/transit/start': {
    post: authed(TAG_LIV, 'Démarrer un parcours transitaire (alias)', {
      description: 'Alias historique de `/api/transit-missions/start`.',
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/transit/select-transitaire': {
    post: authed(TAG_LIV, 'Sélectionner un transitaire (alias)', {
      description: 'Alias historique de `/api/transit-missions/select-transitaire`.',
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/transit/transferer': {
    post: authed(TAG_LIV, 'Transférer une mission (alias)', {
      description: 'Alias historique de `/api/transit-missions/transferer`.',
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/transit/mes-parcours': {
    get: authed(TAG_LIV, 'Mes parcours transitaire (alias)', {
      description: 'Alias historique de `/api/transit-missions/mes-parcours`.',
      responses: { 200: OK },
    }),
  },
  '/api/transit/parcours/{articleId}': {
    get: authed(TAG_LIV, 'Parcours d’un article (alias)', {
      description: 'Alias historique de `/api/transit-missions/parcours/{articleId}`.',
      parameters: [pathParam('articleId', 'ID article')],
      responses: { 200: OK },
    }),
  },
  '/api/transit/mes-missions': {
    get: authed(TAG_LIV, 'Mes missions transitaires (alias)', {
      description: 'Alias historique de `/api/transit-missions/mes-missions`.',
      responses: { 200: OK },
    }),
  },
  '/api/transit/acceptes': {
    get: authed(TAG_LIV, 'Missions acceptées (alias)', {
      description: 'Alias historique de `/api/transit-missions/acceptes`.',
      responses: { 200: OK },
    }),
  },
  '/api/transit/{id}/marquer-traite': {
    patch: authed(TAG_LIV, 'Marquer mission traitée (alias)', {
      description: 'Alias historique de `/api/transit-missions/{id}/marquer-traite`.',
      parameters: [pathParam('id', 'ID mission')],
      requestBody: jsonBody(null, { required: false }),
      responses: { 200: OK },
    }),
  },
  '/api/transit/{id}/rejeter-attribution': {
    patch: authed(TAG_LIV, 'Rejeter attribution mission (alias)', {
      description:
        'Alias historique de `/api/transit-missions/{id}/rejeter-attribution`.',
      parameters: [pathParam('id', 'ID mission')],
      requestBody: jsonBody(null, { required: false }),
      responses: { 200: OK },
    }),
  },
  '/api/transit/{id}/details': {
    patch: authed(TAG_LIV, 'Mettre à jour détails mission (alias)', {
      description: 'Alias historique de `/api/transit-missions/{id}/details`.',
      parameters: [pathParam('id', 'ID mission')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/transitaire-reviews/transitaire/{transitaireId}': {
    get: authed(TAG_TRANS, 'Avis d’un transitaire', {
      parameters: [pathParam('transitaireId', 'ID transitaire')],
      responses: { 200: OK },
    }),
  },
  '/api/transitaire-reviews/received': {
    get: authed(TAG_TRANS, 'Avis reçus par le transitaire connecté', {
      responses: { 200: OK },
    }),
  },
  '/api/transitaire-reviews': {
    post: authed(TAG_TRANS, 'Créer ou mettre à jour un avis transitaire', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/transitaire-reviews/{id}': {
    put: authed(TAG_TRANS, 'Modifier un avis transitaire', {
      parameters: [pathParam('id', 'ID avis')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    delete: authed(TAG_TRANS, 'Supprimer un avis transitaire', {
      parameters: [pathParam('id', 'ID avis')],
      responses: { 200: OK },
    }),
  },

  '/api/transitaires/verification/status': {
    get: authed(TAG_TRANS, 'Statut de ma vérification transitaire', {
      responses: { 200: OK },
    }),
  },
  '/api/transitaires/verification/submit': {
    post: authed(TAG_TRANS, 'Soumettre un dossier de vérification transitaire', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/transitaires/verification/admin/demandes': {
    get: authed(TAG_TRANS, 'Lister les demandes de vérification transitaire', {
      responses: { 200: OK },
    }),
  },
  '/api/transitaires/verification/admin/demandes/{userId}': {
    get: authed(TAG_TRANS, 'Détail d’une demande de vérification transitaire', {
      parameters: [pathParam('userId', 'ID utilisateur')],
      responses: { 200: OK },
    }),
  },
  '/api/transitaires/verification/admin/demandes/{userId}/approve': {
    patch: authed(TAG_TRANS, 'Approuver une demande de vérification transitaire', {
      parameters: [pathParam('userId', 'ID utilisateur')],
      requestBody: jsonBody(null, { required: false }),
      responses: { 200: OK },
    }),
  },
  '/api/transitaires/verification/admin/demandes/{userId}/reject': {
    patch: authed(TAG_TRANS, 'Rejeter une demande de vérification transitaire', {
      parameters: [pathParam('userId', 'ID utilisateur')],
      requestBody: jsonBody(null, { required: false }),
      responses: { 200: OK },
    }),
  },
};
