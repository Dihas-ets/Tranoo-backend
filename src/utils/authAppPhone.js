/**
 * Téléphone + authApp (tranoo | tranoo_pro) + rôle.
 * Un numéro canonique = un seul compte par application mobile.
 */
const User = require('../models/User');
const {
  canonicalPhoneDigits,
  internationalPhoneFromDigits,
  phoneLookupVariants,
} = require('./phoneNormalize');
const {
  BUYER_ROLES,
  PRO_ROLES,
  MOBILE_AUTH_APPS,
  normalizeAppParam,
  authAppLabel,
  authAppFromRole,
  rolesForAuthApp,
  roleBelongsToAuthApp,
} = require('./authAppRoles');

function prepareUserPhoneFields(user, { telephone, countryCode, nationalNumber } = {}) {
  const canon = canonicalPhoneDigits({ telephone, countryCode, nationalNumber });
  if (!canon) return null;
  user.telephoneCanonical = canon;
  user.telephone = internationalPhoneFromDigits(canon);
  if (!user.authApp && user.role) {
    user.authApp = authAppFromRole(user.role);
  }
  return canon;
}

async function findUsersByPhoneDigits(phoneDigits) {
  if (!phoneDigits) return [];
  const seen = new Set();
  const users = [];

  const add = (u) => {
    if (!u) return;
    const id = String(u._id);
    if (seen.has(id)) return;
    seen.add(id);
    users.push(u);
  };

  const canon = canonicalPhoneDigits({ telephone: phoneDigits });
  if (canon) {
    const byCanon = await User.find({ telephoneCanonical: canon });
    byCanon.forEach(add);
  }

  for (const v of phoneLookupVariants(phoneDigits)) {
    const list = await User.find({ telephone: v });
    list.forEach(add);
  }

  return users;
}

async function findUserByPhoneAndApp(phoneDigits, app) {
  const allowedRoles = rolesForAuthApp(app);
  if (!allowedRoles) {
    return { user: null, error: 'app_required' };
  }

  const candidates = await findUsersByPhoneDigits(phoneDigits);
  const matched = candidates.filter((u) => allowedRoles.has(u.role));

  if (matched.length === 0) {
    return { user: null, error: 'not_found', authApp: authAppLabel(app) };
  }
  if (matched.length === 1) {
    return { user: matched[0], error: null, authApp: authAppLabel(app) };
  }

  console.warn('[AUTH_PHONE] conflit numéro / app / rôle', {
    phoneDigits,
    authApp: authAppLabel(app),
    matches: matched.map((u) => ({ uid: u.uid, role: u.role, email: u.email })),
  });
  return {
    user: null,
    error: 'ambiguous',
    authApp: authAppLabel(app),
    candidates: matched,
  };
}

async function assertPhoneNotTaken({
  telephoneCanonical,
  authApp,
  excludeUserId,
  role,
} = {}) {
  const resolvedAuthApp = authApp || authAppFromRole(role);
  if (
    !telephoneCanonical ||
    !resolvedAuthApp ||
    telephoneCanonical.length < 8 ||
    /^0+$/.test(telephoneCanonical)
  ) {
    return;
  }

  const existingCanon = await User.findOne({
    telephoneCanonical,
    authApp: resolvedAuthApp,
    ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
  });
  if (existingCanon) {
    const err = new Error(
      resolvedAuthApp === 'tranoo_pro'
        ? 'Ce numéro est déjà utilisé sur Tranoo Pro.'
        : 'Ce numéro est déjà utilisé sur Tranoo.'
    );
    err.code = 'phone_taken';
    throw err;
  }

  const appParam = resolvedAuthApp === 'tranoo_pro' ? 'pro' : 'buyer';
  const { user, error } = await findUserByPhoneAndApp(telephoneCanonical, appParam);
  if (user && (!excludeUserId || String(user._id) !== String(excludeUserId))) {
    const err = new Error(
      resolvedAuthApp === 'tranoo_pro'
        ? 'Ce numéro est déjà utilisé sur Tranoo Pro.'
        : 'Ce numéro est déjà utilisé sur Tranoo.'
    );
    err.code = 'phone_taken';
    throw err;
  }
  if (error === 'ambiguous') {
    const err = new Error(
      'Ce numéro est associé à plusieurs comptes. Contactez le support.'
    );
    err.code = 'phone_ambiguous';
    throw err;
  }
}

function phoneConflictMessage(err) {
  if (err?.code === 'phone_taken' || err?.code === 'phone_ambiguous') {
    return err.message;
  }
  if (err?.code === 11000 && err?.keyPattern?.telephoneCanonical) {
    return 'Ce numéro est déjà utilisé pour cette application.';
  }
  return null;
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
  prepareUserPhoneFields,
  findUsersByPhoneDigits,
  findUserByPhoneAndApp,
  assertPhoneNotTaken,
  phoneConflictMessage,
};
