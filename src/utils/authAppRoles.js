/**
 * Rôles et authApp (tranoo | tranoo_pro) — sans dépendance au modèle User
 * (évite la dépendance circulaire User ↔ authAppPhone).
 */
const BUYER_ROLES = new Set(['acheteur']);
const PRO_ROLES = new Set(['vendeur', 'livreur', 'chauffeur', 'transitaire']);
const MOBILE_AUTH_APPS = new Set(['tranoo', 'tranoo_pro']);

function normalizeAppParam(app) {
  const a = String(app || '').trim().toLowerCase();
  if (a === 'pro' || a === 'tranoo_pro' || a === 'vendor') return 'pro';
  if (a === 'buyer' || a === 'tranoo' || a === 'acheteur') return 'buyer';
  return null;
}

function authAppLabel(app) {
  const appNorm = normalizeAppParam(app);
  if (appNorm === 'buyer') return 'tranoo';
  if (appNorm === 'pro') return 'tranoo_pro';
  return null;
}

function authAppFromRole(role) {
  if (BUYER_ROLES.has(role)) return 'tranoo';
  if (PRO_ROLES.has(role)) return 'tranoo_pro';
  return null;
}

function rolesForAuthApp(app) {
  const appNorm = normalizeAppParam(app);
  if (appNorm === 'buyer') return BUYER_ROLES;
  if (appNorm === 'pro') return PRO_ROLES;
  return null;
}

function roleBelongsToAuthApp(role, authApp) {
  if (!authApp || !MOBILE_AUTH_APPS.has(authApp)) return false;
  if (authApp === 'tranoo') return BUYER_ROLES.has(role);
  if (authApp === 'tranoo_pro') return PRO_ROLES.has(role);
  return false;
}

module.exports = {
  BUYER_ROLES,
  PRO_ROLES,
  MOBILE_AUTH_APPS,
  normalizeAppParam,
  authAppLabel,
  authAppFromRole,
  rolesForAuthApp,
  roleBelongsToAuthApp,
};
