const { op, authed, jsonBody, pathParam, OK } = require('../helpers');

const TAG_PAY = 'Paiements';
const TAG_WALLET = 'Portefeuille';

module.exports = {
  '/api/payments/feexpay/init': {
    post: authed(TAG_PAY, 'Initier paiement FeexPay', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/payments/feexpay/requesttopay/{network}': {
    post: authed(TAG_PAY, 'Request-to-pay mobile money', {
      parameters: [pathParam('network', 'Réseau (MTN, MOOV, etc.)')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/payments/feexpay/initcard': {
    post: authed(TAG_PAY, 'Paiement carte FeexPay', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/payments/feexpay/webhook': {
    post: op(TAG_PAY, 'Webhook FeexPay', {
      description: 'Callback serveur FeexPay (sans auth Bearer).',
      security: [],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/payments/feexpay/trace': {
    post: op(TAG_PAY, 'Trace client FeexPay', {
      security: [],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/payments/feexpay/public/status/{id}': {
    get: op(TAG_PAY, 'Statut public transaction', {
      security: [],
      parameters: [pathParam('id', 'ID transaction FeexPay')],
      responses: { 200: OK },
    }),
  },
  '/api/payments/feexpay/flutter/record': {
    post: authed(TAG_PAY, 'Enregistrer paiement Flutter FeexPay', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/payments': {
    get: authed(TAG_PAY, 'Historique paiements', { responses: { 200: OK } }),
  },
  '/api/payments/{id}': {
    get: authed(TAG_PAY, 'Statut paiement', {
      parameters: [pathParam('id', 'ID paiement')],
      responses: { 200: OK },
    }),
  },
  '/api/payments/{id}/details': {
    get: authed(TAG_PAY, 'Détail transaction', {
      parameters: [pathParam('id', 'ID paiement')],
      responses: { 200: OK },
    }),
  },
  '/api/payments/admin/{id}/status': {
    post: authed(TAG_PAY, 'Forcer statut paiement (admin)', {
      parameters: [pathParam('id', 'ID paiement')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/wallet/me': {
    get: authed(TAG_WALLET, 'Mon portefeuille', { responses: { 200: OK } }),
  },
  '/api/wallet/me/transactions': {
    get: authed(TAG_WALLET, 'Mes transactions wallet', { responses: { 200: OK } }),
  },
  '/api/wallet/me/stats': {
    get: authed(TAG_WALLET, 'Statistiques wallet', { responses: { 200: OK } }),
  },
};
