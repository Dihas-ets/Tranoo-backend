const { authed, jsonBody, pathParam, OK, CREATED } = require('../helpers');

const TAG_VERIF = 'Vérification Véhicule';
const TAG_SUB = 'Abonnements';
const TAG_ORDER = 'Commandes';
const TAG_INV = 'Factures';

module.exports = {
  '/api/verification/request': {
    post: authed(TAG_VERIF, 'Demander vérification véhicule', {
      description: 'Après paiement FeexPay sur Tranoo.',
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/subscription/me': {
    get: authed(TAG_SUB, 'Mon abonnement', { responses: { 200: OK } }),
  },
  '/api/subscription/subscribe': {
    post: authed(TAG_SUB, 'Souscrire un abonnement', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/subscription/status/{userId}': {
    get: authed(TAG_SUB, 'Statut abonnement utilisateur', {
      parameters: [pathParam('userId', 'ID utilisateur')],
      responses: { 200: OK },
    }),
  },

  '/api/orders': {
    post: authed(TAG_ORDER, 'Créer une commande', {
      requestBody: jsonBody('#/components/schemas/OrderInput'),
      responses: { 201: CREATED },
    }),
  },
  '/api/orders/my-orders': {
    get: authed(TAG_ORDER, 'Mes commandes', { responses: { 200: OK } }),
  },
  '/api/orders/{id}': {
    get: authed(TAG_ORDER, 'Détail commande', {
      parameters: [pathParam('id', 'ID commande')],
      responses: { 200: OK },
    }),
  },
  '/api/orders/admin/all': {
    get: authed(TAG_ORDER, 'Toutes les commandes (admin)', { responses: { 200: OK } }),
  },
  '/api/orders/admin/{id}/status': {
    put: authed(TAG_ORDER, 'Changer statut commande (admin)', {
      parameters: [pathParam('id', 'ID commande')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/invoices/my': {
    get: authed(TAG_INV, 'Mes factures', {
      description: 'Alias identiques : /api/invoice/my et /api/factures/my',
      responses: { 200: OK },
    }),
  },
  '/api/invoices/my/read-all': {
    patch: authed(TAG_INV, 'Tout marquer comme lu', { responses: { 200: OK } }),
  },
  '/api/invoices/{id}/read': {
    patch: authed(TAG_INV, 'Marquer facture lue', {
      parameters: [pathParam('id', 'ID facture')],
      responses: { 200: OK },
    }),
  },

  // Alias montés dans app.js (même router invoice.js)
  '/api/invoice/my': {
    get: authed(TAG_INV, 'Mes factures (alias /api/invoices)', { responses: { 200: OK } }),
  },
  '/api/factures/my': {
    get: authed(TAG_INV, 'Mes factures (alias /api/invoices)', { responses: { 200: OK } }),
  },
  '/api/invoice/my/read-all': {
    patch: authed(TAG_INV, 'Tout marquer lu (alias)', { responses: { 200: OK } }),
  },
  '/api/factures/my/read-all': {
    patch: authed(TAG_INV, 'Tout marquer lu (alias)', { responses: { 200: OK } }),
  },
  '/api/invoice/{id}/read': {
    patch: authed(TAG_INV, 'Marquer lue (alias)', {
      parameters: [pathParam('id', 'ID facture')],
      responses: { 200: OK },
    }),
  },
  '/api/factures/{id}/read': {
    patch: authed(TAG_INV, 'Marquer lue (alias)', {
      parameters: [pathParam('id', 'ID facture')],
      responses: { 200: OK },
    }),
  },
};
