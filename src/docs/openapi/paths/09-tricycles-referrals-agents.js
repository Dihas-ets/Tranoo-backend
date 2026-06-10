const { authed, jsonBody, pathParam, OK, CREATED } = require('../helpers');

const TAG_TRI = 'Tricycles';
const TAG_REF = 'Parrainage';
const TAG_TAR = 'Tarifs Parrainage';
const TAG_AGENT = 'Agents Commerciaux';

module.exports = {
  '/api/tricycles/location': {
    post: authed(TAG_TRI, 'Mettre à jour ma position (chauffeur)', {
      requestBody: jsonBody('#/components/schemas/GeoPoint'),
      responses: { 200: OK },
    }),
  },
  '/api/tricycles/chauffeur/status': {
    post: authed(TAG_TRI, 'Définir disponibilité chauffeur', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    get: authed(TAG_TRI, 'Ma disponibilité chauffeur', { responses: { 200: OK } }),
  },
  '/api/tricycles/nearby': {
    get: authed(TAG_TRI, 'Chauffeurs à proximité', { responses: { 200: OK } }),
  },
  '/api/tricycles/{chauffeurId}/contact': {
    post: authed(TAG_TRI, 'Contacter un chauffeur', {
      parameters: [pathParam('chauffeurId', 'ID chauffeur')],
      requestBody: jsonBody(null),
      responses: { 201: CREATED },
    }),
  },
  '/api/tricycles/contacts/incoming': {
    get: authed(TAG_TRI, 'Demandes entrantes (chauffeur)', { responses: { 200: OK } }),
  },
  '/api/tricycles/contacts/my': {
    get: authed(TAG_TRI, 'Mes contacts (acheteur)', { responses: { 200: OK } }),
  },
  '/api/tricycles/contacts/{id}': {
    get: authed(TAG_TRI, 'Détail contact', {
      parameters: [pathParam('id', 'ID contact')],
      responses: { 200: OK },
    }),
  },
  '/api/tricycles/contacts/{id}/accept': {
    post: authed(TAG_TRI, 'Accepter contact', {
      parameters: [pathParam('id', 'ID contact')],
      responses: { 200: OK },
    }),
  },
  '/api/tricycles/contacts/{id}/read': {
    post: authed(TAG_TRI, 'Marquer contact lu', {
      parameters: [pathParam('id', 'ID contact')],
      responses: { 200: OK },
    }),
  },
  '/api/tricycles/contacts/{id}/close': {
    post: authed(TAG_TRI, 'Clôturer contact', {
      parameters: [pathParam('id', 'ID contact')],
      responses: { 200: OK },
    }),
  },

  '/api/referrals/stats': {
    get: authed(TAG_REF, 'Mes stats parrainage', { responses: { 200: OK } }),
  },
  '/api/referrals/my-referrals': {
    get: authed(TAG_REF, 'Mes filleuls', { responses: { 200: OK } }),
  },
  '/api/referrals/monthly-stats': {
    get: authed(TAG_REF, 'Stats mensuelles', { responses: { 200: OK } }),
  },
  '/api/referrals/create': {
    post: authed(TAG_REF, 'Créer un parrainage', {
      requestBody: jsonBody(null),
      responses: { 201: CREATED },
    }),
  },
  '/api/referrals/complete/{referralId}': {
    put: authed(TAG_REF, 'Compléter un parrainage', {
      parameters: [pathParam('referralId', 'ID parrainage')],
      responses: { 200: OK },
    }),
  },
  '/api/referrals/all': {
    get: authed(TAG_REF, 'Tous les parrainages (admin)', { responses: { 200: OK } }),
  },
  '/api/referrals/settings': {
    get: authed(TAG_REF, 'Réglages parrainage (admin)', { responses: { 200: OK } }),
    put: authed(TAG_REF, 'Modifier réglages (admin)', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },

  '/api/referral-tariffs': {
    get: authed(TAG_TAR, 'Lister tarifs parrainage', { responses: { 200: OK } }),
    post: authed(TAG_TAR, 'Créer tarif (admin)', {
      requestBody: jsonBody(null),
      responses: { 201: CREATED },
    }),
  },
  '/api/referral-tariffs/{id}': {
    put: authed(TAG_TAR, 'Modifier tarif', {
      parameters: [pathParam('id', 'ID tarif')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
    delete: authed(TAG_TAR, 'Supprimer tarif', {
      parameters: [pathParam('id', 'ID tarif')],
      responses: { 200: OK },
    }),
  },

  '/api/agents/me/dashboard': {
    get: authed(TAG_AGENT, 'Dashboard agent (legacy)', { responses: { 200: OK } }),
  },
  '/api/agents/me/daily': {
    post: authed(TAG_AGENT, 'Journal quotidien agent', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/agents/me/daily/prospects/increment': {
    post: authed(TAG_AGENT, 'Incrémenter prospects', { responses: { 200: OK } }),
  },
  '/api/agents/me-tranoo/dashboard': {
    get: authed(TAG_AGENT, 'Dashboard agent Tranoo', { responses: { 200: OK } }),
  },
  '/api/agents/me-tranoo/daily': {
    post: authed(TAG_AGENT, 'Journal quotidien Tranoo', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/agents/me-tranoo/daily/prospects/increment': {
    post: authed(TAG_AGENT, 'Incrémenter prospects Tranoo', { responses: { 200: OK } }),
  },
  '/api/agents/me-tranoo/leaderboard': {
    get: authed(TAG_AGENT, 'Leaderboard Tranoo', { responses: { 200: OK } }),
  },
  '/api/agents/me-pro/dashboard': {
    get: authed(TAG_AGENT, 'Dashboard agent Pro', { responses: { 200: OK } }),
  },
  '/api/agents/me-pro/daily': {
    post: authed(TAG_AGENT, 'Journal quotidien Pro', {
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/agents/me-pro/daily/prospects/increment': {
    post: authed(TAG_AGENT, 'Incrémenter prospects Pro', { responses: { 200: OK } }),
  },
  '/api/agents/me-pro/leaderboard': {
    get: authed(TAG_AGENT, 'Leaderboard Pro', { responses: { 200: OK } }),
  },
  '/api/agents/leaderboard': {
    get: authed(TAG_AGENT, 'Leaderboard global', { responses: { 200: OK } }),
  },
  '/api/agents': {
    post: authed(TAG_AGENT, 'Créer agent (admin)', {
      requestBody: jsonBody(null),
      responses: { 201: CREATED },
    }),
  },
  '/api/agents/withdrawals': {
    get: authed(TAG_AGENT, 'Retraits agents (admin)', { responses: { 200: OK } }),
  },
  '/api/agents/admin/backfill-daily-presence': {
    post: authed(TAG_AGENT, 'Backfill présence quotidienne', { responses: { 200: OK } }),
  },
  '/api/agents/admin/consolidated': {
    get: authed(TAG_AGENT, 'Stats consolidées admin', { responses: { 200: OK } }),
  },
  '/api/agents/{id}/referral-stats': {
    get: authed(TAG_AGENT, 'Stats parrainage agent', {
      parameters: [pathParam('id', 'ID agent')],
      responses: { 200: OK },
    }),
  },
  '/api/agents/{id}/pro-monitor': {
    get: authed(TAG_AGENT, 'Monitoring quotidien Pro', {
      parameters: [pathParam('id', 'ID agent')],
      responses: { 200: OK },
    }),
  },
  '/api/agents/{id}/referrals': {
    get: authed(TAG_AGENT, 'Filleuls agent', {
      parameters: [pathParam('id', 'ID agent')],
      responses: { 200: OK },
    }),
  },
  '/api/agents/{id}/withdrawals': {
    post: authed(TAG_AGENT, 'Enregistrer retrait agent', {
      parameters: [pathParam('id', 'ID agent')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
  '/api/agents/{id}/daily/observation': {
    post: authed(TAG_AGENT, 'Observation quotidienne admin', {
      parameters: [pathParam('id', 'ID agent')],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
};
