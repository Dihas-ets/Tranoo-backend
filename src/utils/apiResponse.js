const ErrorCodes = require('./errorCodes');

/** French fallback messages (legacy clients + logs). */
const MESSAGES_FR = {
  [ErrorCodes.TOKEN_MISSING]: 'Token manquant ou invalide',
  [ErrorCodes.TOKEN_INVALID]: 'Token invalide',
  [ErrorCodes.USER_NOT_FOUND]: 'Utilisateur non trouvé. Veuillez vous reconnecter.',
  [ErrorCodes.ACCOUNT_BLOCKED]: "Votre compte a été bloqué. Contactez l'administration.",
  [ErrorCodes.SESSION_REQUIRED]: 'Session web requise. Veuillez vous reconnecter.',
  [ErrorCodes.SESSION_REVOKED]: 'Votre session a été ouverte ailleurs. Reconnexion requise.',
  [ErrorCodes.SESSION_INACTIVE]: 'Session expirée après inactivité. Veuillez vous reconnecter.',
  [ErrorCodes.INVALID_PHONE]: "Numéro invalide. Vérifiez l'indicatif pays et le numéro saisi.",
  [ErrorCodes.APP_REQUIRED]: 'Application requise (tranoo ou tranoo_pro).',
  [ErrorCodes.ACCOUNT_AMBIGUOUS]:
    'Plusieurs comptes partagent ce numéro. Contactez le support.',
  [ErrorCodes.ACCOUNT_NOT_FOUND]: 'Aucun compte trouvé pour ce numéro.',
  [ErrorCodes.OTP_SEND_FAILED]:
    "Impossible d'envoyer le code. Vérifiez le numéro ou réessayez.",
  [ErrorCodes.MISSING_FIELDS]: 'Champs requis manquants.',
  [ErrorCodes.OTP_INVALID_OR_EXPIRED]: 'Code invalide ou expiré.',
  [ErrorCodes.DEVICE_MISMATCH]: 'Ce téléphone ne correspond pas à la demande.',
  [ErrorCodes.REQUEST_INVALID]: 'Demande invalide.',
  [ErrorCodes.OTP_EXPIRED]: 'Code expiré. Redemandez un code.',
  [ErrorCodes.OTP_LOCKED]: 'Trop de tentatives. Redemandez un code.',
  [ErrorCodes.OTP_INCORRECT]: 'Code incorrect.',
  [ErrorCodes.VERIFY_FIRST]: "Veuillez d'abord vérifier le code.",
  [ErrorCodes.PASSWORD_TOO_SHORT]: 'Mot de passe trop court.',
  [ErrorCodes.PASSWORD_UPDATE_FAILED]:
    'Impossible de mettre à jour le mot de passe. Contactez le support.',
  [ErrorCodes.NOT_AUTHENTICATED]: 'Utilisateur non authentifié',
  [ErrorCodes.FORBIDDEN]: 'Accès refusé',
  [ErrorCodes.ACCESS_DENIED]: 'Accès refusé',
  [ErrorCodes.NOT_FOUND]: 'Ressource introuvable',
  [ErrorCodes.NO_UPDATE_DATA]: 'Aucune donnée à mettre à jour',
  [ErrorCodes.DESCRIPTION_TOO_LONG]: 'Description trop longue (max 500 caractères)',
  [ErrorCodes.USER_INCOMPLETE]:
    'Informations utilisateur incomplètes (uid/firebase ou _id manquant)',
  [ErrorCodes.VENDEUR_TYPE_SELLERS_ONLY]: 'vendeurType réservé aux vendeurs',
  [ErrorCodes.VENDEUR_TYPE_INVALID]: 'vendeurType invalide',
  [ErrorCodes.PHONE_ALREADY_USED]: 'Ce numéro est déjà utilisé pour cette application.',
  [ErrorCodes.PHONE_AMBIGUOUS]:
    'Ce numéro est associé à plusieurs comptes. Contactez le support.',
  [ErrorCodes.PROFILE_UPDATE_FAILED]: 'Erreur lors de la mise à jour du profil',
  [ErrorCodes.FIREBASE_EMAIL_SYNC_FAILED]:
    'Email mis à jour en base mais pas dans Firebase',
  [ErrorCodes.GALLERY_TRANSITAIRE_ONLY]: 'transitaireGallery réservé aux transitaires',
  [ErrorCodes.GALLERY_MUST_BE_ARRAY]: 'transitaireGallery doit être un tableau',
  [ErrorCodes.GALLERY_MAX_ITEMS]: 'Maximum 20 éléments dans la galerie',
  [ErrorCodes.GALLERY_INVALID_ITEM]: 'Élément de galerie invalide',
  [ErrorCodes.GALLERY_ITEM_TYPE_URL]:
    'Chaque élément doit avoir un type (image|video) et une url',
  [ErrorCodes.FCM_TOKEN_REQUIRED]: 'Token FCM requis',
  [ErrorCodes.ARTICLE_ID_REQUIRED]: 'articleId requis',
  [ErrorCodes.FILE_REQUIRED]: 'Aucun fichier envoyé',
  [ErrorCodes.INTERNAL_ERROR]: 'Erreur. Réessayez.',
  [ErrorCodes.VALIDATION_ERROR]: 'Données invalides.',
};

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code
 * @param {Record<string, unknown>} [extra]
 */
function sendError(res, status, code, extra = {}) {
  const { message: customMessage, ...rest } = extra;
  const message =
    customMessage ?? MESSAGES_FR[code] ?? MESSAGES_FR[ErrorCodes.INTERNAL_ERROR];
  return res.status(status).json({
    success: false,
    code,
    message,
    ...rest,
  });
}

/**
 * @param {import('express').Response} res
 * @param {unknown} err
 * @returns {import('express').Response | null}
 */
function sendPhoneConflict(res, err) {
  if (err?.code === 'phone_ambiguous') {
    return sendError(res, 409, ErrorCodes.PHONE_AMBIGUOUS);
  }
  if (
    err?.code === 'phone_taken' ||
    (err?.code === 11000 && err?.keyPattern?.telephoneCanonical)
  ) {
    return sendError(res, 409, ErrorCodes.PHONE_ALREADY_USED, {
      message: err?.message || MESSAGES_FR[ErrorCodes.PHONE_ALREADY_USED],
    });
  }
  return null;
}

/**
 * @param {import('express').Response} res
 * @param {Record<string, unknown>} [data]
 * @param {number} [status]
 */
function sendSuccess(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

module.exports = {
  ErrorCodes,
  MESSAGES_FR,
  sendError,
  sendPhoneConflict,
  sendSuccess,
};
