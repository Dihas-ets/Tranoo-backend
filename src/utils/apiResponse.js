const ErrorCodes = require('./errorCodes');
const { resolveLocale } = require('./i18n');

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
  [ErrorCodes.CAPTCHA_INVALID]: 'Échec du contrôle de sécurité. Veuillez réessayer.',
  [ErrorCodes.CAPTCHA_TOKEN_MISSING]: 'Contrôle de sécurité requis.',
  [ErrorCodes.CAPTCHA_ERROR]: 'Impossible de vérifier le contrôle de sécurité.',
  [ErrorCodes.RATE_LIMITED]: 'Trop de tentatives. Réessayez dans quelques minutes.',
  [ErrorCodes.TRANSITAIRE_ONLY]: 'Réservé aux transitaires',
  [ErrorCodes.TRANSITAIRE_VERIF_ALREADY_VERIFIED]: 'Votre compte est déjà vérifié',
  [ErrorCodes.TRANSITAIRE_VERIF_PENDING]:
    "Une demande est déjà en cours d'examen (délai 24h)",
  [ErrorCodes.TRANSITAIRE_VERIF_CARDS_REQUIRED]:
    'Les photos recto et verso de la carte transitaire sont requises',
  [ErrorCodes.TRANSITAIRE_VERIF_COMPANY_REQUIRED]:
    "Le nom et le numéro de référence de l'entreprise de provenance sont requis",
  [ErrorCodes.TRANSITAIRE_VERIF_REFERENCE_PHONE_INVALID]:
    'Le numéro de référence doit être un numéro de téléphone valide',
  [ErrorCodes.TRANSITAIRE_VERIF_SAVE_FAILED]:
    "Erreur lors de l'enregistrement de la demande",
  [ErrorCodes.TRANSITAIRE_VERIF_SUBMIT_SUCCESS]:
    "Demande de vérification envoyée. Délai d'examen : 24h.",
  [ErrorCodes.TRANSITAIRE_VERIF_SUBMIT_FAILED]:
    "Erreur lors de l'envoi de la demande de vérification",
  [ErrorCodes.TRANSITAIRE_VERIF_STATUS_FAILED]:
    'Erreur lors de la récupération du statut de vérification',
  [ErrorCodes.TRANSITAIRE_VERIF_LIST_FAILED]:
    'Erreur lors de la récupération des demandes',
  [ErrorCodes.TRANSITAIRE_VERIF_DETAIL_FAILED]:
    'Erreur lors de la récupération du détail',
  [ErrorCodes.TRANSITAIRE_VERIF_NOT_FOUND]: 'Transitaire introuvable',
  [ErrorCodes.TRANSITAIRE_VERIF_APPROVE_INVALID]:
    'Seules les demandes en attente peuvent être validées',
  [ErrorCodes.TRANSITAIRE_VERIF_DOCS_MISSING]:
    'Le dossier doit contenir les photos recto et verso de la carte',
  [ErrorCodes.TRANSITAIRE_VERIF_APPROVE_SUCCESS]: 'Demande validée',
  [ErrorCodes.TRANSITAIRE_VERIF_APPROVE_FAILED]: 'Erreur lors de la validation',
  [ErrorCodes.TRANSITAIRE_VERIF_REJECT_MOTIF_REQUIRED]:
    'Le motif du rejet est obligatoire',
  [ErrorCodes.TRANSITAIRE_VERIF_REJECT_INVALID]:
    'Seules les demandes en attente peuvent être rejetées',
  [ErrorCodes.TRANSITAIRE_VERIF_REJECT_SUCCESS]: 'Demande rejetée',
  [ErrorCodes.TRANSITAIRE_VERIF_REJECT_FAILED]: 'Erreur lors du rejet',
};

/** fr / en / ar — used when Accept-Language is set */
const LOCALIZED_MESSAGES = {
  [ErrorCodes.CAPTCHA_INVALID]: {
    fr: MESSAGES_FR[ErrorCodes.CAPTCHA_INVALID],
    en: 'Security check failed. Please try again.',
    ar: 'فشل التحقق الأمني. يرجى المحاولة مرة أخرى.',
  },
  [ErrorCodes.CAPTCHA_TOKEN_MISSING]: {
    fr: MESSAGES_FR[ErrorCodes.CAPTCHA_TOKEN_MISSING],
    en: 'Security check required.',
    ar: 'التحقق الأمني مطلوب.',
  },
  [ErrorCodes.CAPTCHA_ERROR]: {
    fr: MESSAGES_FR[ErrorCodes.CAPTCHA_ERROR],
    en: 'Unable to verify security check.',
    ar: 'تعذر التحقق من الأمان.',
  },
  [ErrorCodes.RATE_LIMITED]: {
    fr: MESSAGES_FR[ErrorCodes.RATE_LIMITED],
    en: 'Too many attempts. Try again in a few minutes.',
    ar: 'محاولات كثيرة. أعد المحاولة بعد قليل.',
  },
  [ErrorCodes.TRANSITAIRE_ONLY]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_ONLY],
    en: 'Reserved for forwarders',
    ar: 'مخصص لوسطاء الشحن',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_ALREADY_VERIFIED]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_ALREADY_VERIFIED],
    en: 'Your account is already verified',
    ar: 'حسابك موثق بالفعل',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_PENDING]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_PENDING],
    en: 'A request is already under review (24h processing time)',
    ar: 'طلب قيد المراجعة بالفعل (مهلة 24 ساعة)',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_CARDS_REQUIRED]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_CARDS_REQUIRED],
    en: 'Front and back photos of the forwarder card are required',
    ar: 'صور بطاقة الوسيط (الوجه والظهر) مطلوبة',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_COMPANY_REQUIRED]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_COMPANY_REQUIRED],
    en: 'Origin company name and reference phone are required',
    ar: 'اسم شركة المنشأ ورقم المرجع مطلوبان',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_REFERENCE_PHONE_INVALID]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_REFERENCE_PHONE_INVALID],
    en: 'Reference must be a valid phone number',
    ar: 'يجب أن يكون المرجع رقم هاتف صالحاً',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_SAVE_FAILED]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_SAVE_FAILED],
    en: 'Failed to save the request',
    ar: 'تعذر حفظ الطلب',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_SUBMIT_SUCCESS]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_SUBMIT_SUCCESS],
    en: 'Verification request sent. Review within 24h.',
    ar: 'تم إرسال طلب التحقق. المراجعة خلال 24 ساعة.',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_SUBMIT_FAILED]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_SUBMIT_FAILED],
    en: 'Failed to submit verification request',
    ar: 'تعذر إرسال طلب التحقق',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_STATUS_FAILED]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_STATUS_FAILED],
    en: 'Failed to load verification status',
    ar: 'تعذر تحميل حالة التحقق',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_LIST_FAILED]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_LIST_FAILED],
    en: 'Failed to load requests',
    ar: 'تعذر تحميل الطلبات',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_DETAIL_FAILED]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_DETAIL_FAILED],
    en: 'Failed to load details',
    ar: 'تعذر تحميل التفاصيل',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_NOT_FOUND]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_NOT_FOUND],
    en: 'Forwarder not found',
    ar: 'الوسيط غير موجود',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_APPROVE_INVALID]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_APPROVE_INVALID],
    en: 'Only pending requests can be approved',
    ar: 'يمكن الموافقة على الطلبات المعلقة فقط',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_DOCS_MISSING]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_DOCS_MISSING],
    en: 'File must include front and back card photos',
    ar: 'يجب أن يتضمن الملف صور البطاقة',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_APPROVE_SUCCESS]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_APPROVE_SUCCESS],
    en: 'Request approved',
    ar: 'تمت الموافقة على الطلب',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_APPROVE_FAILED]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_APPROVE_FAILED],
    en: 'Approval failed',
    ar: 'فشلت الموافقة',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_REJECT_MOTIF_REQUIRED]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_REJECT_MOTIF_REQUIRED],
    en: 'Rejection reason is required',
    ar: 'سبب الرفض مطلوب',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_REJECT_INVALID]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_REJECT_INVALID],
    en: 'Only pending requests can be rejected',
    ar: 'يمكن رفض الطلبات المعلقة فقط',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_REJECT_SUCCESS]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_REJECT_SUCCESS],
    en: 'Request rejected',
    ar: 'تم رفض الطلب',
  },
  [ErrorCodes.TRANSITAIRE_VERIF_REJECT_FAILED]: {
    fr: MESSAGES_FR[ErrorCodes.TRANSITAIRE_VERIF_REJECT_FAILED],
    en: 'Rejection failed',
    ar: 'فشل الرفض',
  },
  [ErrorCodes.FORBIDDEN]: {
    fr: MESSAGES_FR[ErrorCodes.FORBIDDEN],
    en: 'Access denied',
    ar: 'تم رفض الوصول',
  },
  [ErrorCodes.NOT_FOUND]: {
    fr: MESSAGES_FR[ErrorCodes.NOT_FOUND],
    en: 'Resource not found',
    ar: 'المورد غير موجود',
  },
  [ErrorCodes.USER_NOT_FOUND]: {
    fr: MESSAGES_FR[ErrorCodes.USER_NOT_FOUND],
    en: 'User not found. Please sign in again.',
    ar: 'المستخدم غير موجود. يرجى إعادة تسجيل الدخول.',
  },
  [ErrorCodes.INTERNAL_ERROR]: {
    fr: MESSAGES_FR[ErrorCodes.INTERNAL_ERROR],
    en: 'Error. Please try again.',
    ar: 'خطأ. يرجى المحاولة مرة أخرى.',
  },
};

function localizedMessage(code, locale = 'fr') {
  const entry = LOCALIZED_MESSAGES[code];
  if (!entry) return MESSAGES_FR[code] ?? MESSAGES_FR[ErrorCodes.INTERNAL_ERROR];
  return entry[locale] ?? entry.fr ?? MESSAGES_FR[ErrorCodes.INTERNAL_ERROR];
}

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code
 * @param {Record<string, unknown>} [extra]
 * @param {import('express').Request} [req]
 */
function sendError(res, status, code, extra = {}, req) {
  const { message: customMessage, ...rest } = extra;
  const locale = req ? resolveLocale(req) : 'fr';
  const message = customMessage ?? localizedMessage(code, locale);
  return res.status(status).json({
    success: false,
    code,
    message,
    ...rest,
  });
}

/**
 * @param {import('express').Response} res
 * @param {string} code
 * @param {Record<string, unknown>} [data]
 * @param {number} [status]
 * @param {import('express').Request} [req]
 */
function sendSuccessMessage(res, code, data = {}, status = 200, req) {
  const locale = req ? resolveLocale(req) : 'fr';
  const message = localizedMessage(code, locale);
  return res.status(status).json({ success: true, code, message, ...data });
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
  LOCALIZED_MESSAGES,
  localizedMessage,
  sendError,
  sendSuccessMessage,
  sendPhoneConflict,
  sendSuccess,
};
