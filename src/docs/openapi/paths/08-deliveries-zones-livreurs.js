const { op, authed, jsonBody, pathParam, OK, CREATED } = require('../helpers');

const TAG_DEL = 'Livraisons';
const TAG_ZONE = 'Zones de Livraison';
const TAG_LIV = 'Livreurs';
const TAG_BAL = 'Balance Livreurs';
const TAG_DEL_ADMIN = 'Admin — Livraison';

module.exports = {
  '/api/deliveries': {
    post: authed(TAG_DEL, 'Créer une livraison', {
      requestBody: jsonBody('#/components/schemas/DeliveryInput'),
      responses: { 201: CREATED },
    }),
  },
  '/api/deliveries/pending': {
    get: authed(TAG_DEL, 'Livraisons en attente', { responses: { 200: OK } }),
  },
  '/api/deliveries/active': {
    get: authed(TAG_DEL, 'Livraisons actives', { responses: { 200: OK } }),
  },
  '/api/deliveries/history': {
    get: authed(TAG_DEL, 'Historique livraisons', { responses: { 200: OK } }),
  },
  '/api/deliveries/order/{orderId}': {
    get: authed(TAG_DEL, 'Livraison par commande', {
      parameters: [pathParam('orderId', 'ID commande')],
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/settings': {
    get: authed(TAG_DEL, 'Paramètres livraison', { responses: { 200: OK } }),
  },
  '/api/deliveries/calculate-delivery-fee': {
    post: op(TAG_DEL, 'Calculer frais livraison', {
      security: [],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/settings/price-per-km': {
    put: authed(TAG_DEL, 'Mettre à jour prix/km', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/settings/revenue-config': {
    put: authed(TAG_DEL, 'Config revenus livraison', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/{id}': {
    get: authed(TAG_DEL, 'Détail livraison', {
      parameters: [pathParam('id', 'ID livraison')],
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/{id}/accept': {
    post: authed(TAG_DEL, 'Accepter livraison (livreur)', {
      parameters: [pathParam('id', 'ID livraison')],
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/{id}/reject': {
    post: authed(TAG_DEL, 'Refuser livraison', {
      parameters: [pathParam('id', 'ID livraison')],
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/{id}/pickup': {
    post: authed(TAG_DEL, 'Notifier prise en charge', {
      parameters: [pathParam('id', 'ID livraison')],
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/{id}/arrived': {
    post: authed(TAG_DEL, 'Notifier arrivée', {
      parameters: [pathParam('id', 'ID livraison')],
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/{id}/deliver': {
    post: authed(TAG_DEL, 'Notifier livraison effectuée', {
      parameters: [pathParam('id', 'ID livraison')],
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/{id}/refuse': {
    post: authed(TAG_DEL, 'Notifier refus client', {
      parameters: [pathParam('id', 'ID livraison')],
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/{id}/return': {
    post: authed(TAG_DEL, 'Notifier retour colis', {
      parameters: [pathParam('id', 'ID livraison')],
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/{id}/location': {
    post: authed(TAG_DEL, 'Mettre à jour position livreur', {
      parameters: [pathParam('id', 'ID livraison')],
      requestBody: jsonBody('#/components/schemas/GeoPoint'),
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/{id}/confirm': {
    post: authed(TAG_DEL, 'Confirmer réception (acheteur)', {
      parameters: [pathParam('id', 'ID livraison')],
      responses: { 200: OK },
    }),
  },
  '/api/deliveries/{id}/request-return': {
    post: authed(TAG_DEL, 'Demander retour (acheteur)', {
      parameters: [pathParam('id', 'ID livraison')],
      responses: { 200: OK },
    }),
  },

  '/api/delivery-zones': {
    get: op(TAG_ZONE, 'Lister zones livraison', { security: [], responses: { 200: OK } }),
    post: authed(TAG_ZONE, 'Créer zone (admin)', {
      requestBody: jsonBody(null),
      responses: { 201: CREATED },
    }),
  },
  '/api/delivery-zones/point': {
    get: op(TAG_ZONE, 'Zone pour un point GPS', {
      security: [],
      responses: { 200: OK },
    }),
  },
  '/api/delivery-zones/calculate-fee': {
    post: op(TAG_ZONE, 'Calculer frais avec zones', {
      security: [],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/delivery-zones/{id}': {
    put: authed(TAG_ZONE, 'Modifier zone', {
      parameters: [pathParam('id', 'ID zone')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    delete: authed(TAG_ZONE, 'Supprimer zone', {
      parameters: [pathParam('id', 'ID zone')],
      responses: { 200: OK },
    }),
  },

  '/api/livreurs/toggle-status': {
    post: authed(TAG_LIV, 'Basculer en ligne / hors ligne', { responses: { 200: OK } }),
  },
  '/api/livreurs/status': {
    get: authed(TAG_LIV, 'Mon statut livreur', { responses: { 200: OK } }),
  },
  '/api/livreurs/location': {
    post: authed(TAG_LIV, 'Mettre à jour GPS', {
      requestBody: jsonBody('#/components/schemas/GeoPoint'),
      responses: { 200: OK },
    }),
  },
  '/api/livreurs/deliveries/pending': {
    get: authed(TAG_LIV, 'Livraisons en attente (livreur)', { responses: { 200: OK } }),
  },
  '/api/livreurs/deliveries/active': {
    get: authed(TAG_LIV, 'Livraisons actives (livreur)', { responses: { 200: OK } }),
  },
  '/api/livreurs/deliveries/history': {
    get: authed(TAG_LIV, 'Historique (livreur)', { responses: { 200: OK } }),
  },
  '/api/livreurs/deliveries/{id}/accept': {
    post: authed(TAG_LIV, 'Accepter livraison', {
      parameters: [pathParam('id', 'ID livraison')],
      responses: { 200: OK },
    }),
  },
  '/api/livreurs/deliveries/{id}/complete': {
    post: authed(TAG_LIV, 'Terminer livraison', {
      parameters: [pathParam('id', 'ID livraison')],
      responses: { 200: OK },
    }),
  },

  '/api/livreurs/balance/me': {
    get: authed(TAG_BAL, 'Ma balance livreur', { responses: { 200: OK } }),
  },
  '/api/livreurs/balance/me/transactions': {
    get: authed(TAG_BAL, 'Mes transactions livreur', { responses: { 200: OK } }),
  },
  '/api/livreurs/balance': {
    get: authed(TAG_BAL, 'Toutes balances (admin)', { responses: { 200: OK } }),
  },
  '/api/livreurs/balance/{id}': {
    get: authed(TAG_BAL, 'Balance livreur par ID (admin)', {
      parameters: [pathParam('id', 'ID livreur')],
      responses: { 200: OK },
    }),
  },

  '/api/admin/delivery-settings/calculate': {
    get: op(TAG_DEL_ADMIN, 'Calculer frais livraison (admin)', {
      security: [],
      responses: { 200: OK },
    }),
  },
  '/api/admin/delivery-settings': {
    get: authed(TAG_DEL_ADMIN, 'Paramètres livraison admin', { responses: { 200: OK } }),
    post: authed(TAG_DEL_ADMIN, 'Mettre à jour paramètres', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    put: authed(TAG_DEL_ADMIN, 'Mettre à jour paramètres (PUT)', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
};
