const { resolveLocale } = require('./i18n');

/** @type {Record<string, Record<string, string>>} */
const templates = {
  'delivery.created.title': {
    fr: 'Nouvelle livraison disponible',
    en: 'New delivery available',
    ar: 'توصيل جديد متاح',
  },
  'delivery.created.message': {
    fr: 'Une nouvelle livraison est disponible pour prise en charge.',
    en: 'A new delivery is available for pickup.',
    ar: 'توصيل جديد متاح للاستلام.',
  },
  'delivery.assigned.title': {
    fr: 'Livraison assignée',
    en: 'Delivery assigned',
    ar: 'تم تعيين التوصيل',
  },
  'delivery.assigned.message': {
    fr: 'Une livraison vous a été assignée.',
    en: 'A delivery has been assigned to you.',
    ar: 'تم تعيين توصيل لك.',
  },
  'delivery.picked_up.title': {
    fr: 'Colis récupéré',
    en: 'Package picked up',
    ar: 'تم استلام الطرد',
  },
  'delivery.picked_up.message': {
    fr: 'Le colis a été récupéré par le livreur.',
    en: 'The package has been picked up by the courier.',
    ar: 'استلم السائق الطرد.',
  },
  'delivery.arrived.title': {
    fr: 'Livreur arrivé',
    en: 'Courier arrived',
    ar: 'وصل السائق',
  },
  'delivery.arrived.message': {
    fr: 'Votre livreur est arrivé. Choisissez de payer ou de retourner le colis.',
    en: 'Your courier has arrived. Choose to pay or return the package.',
    ar: 'وصل السائق. اختر الدفع أو إرجاع الطرد.',
  },
  'delivery.delivered.title': {
    fr: 'Colis livré',
    en: 'Package delivered',
    ar: 'تم تسليم الطرد',
  },
  'delivery.delivered.message': {
    fr: 'Le colis a été livré.',
    en: 'The package has been delivered.',
    ar: 'تم تسليم الطرد.',
  },
  'delivery.refused.title': {
    fr: 'Colis refusé',
    en: 'Package refused',
    ar: 'تم رفض الطرد',
  },
  'delivery.refused.message': {
    fr: 'Le colis a été refusé par le client.',
    en: 'The package was refused by the customer.',
    ar: 'رفض العميل الطرد.',
  },
  'delivery.return.title': {
    fr: 'Retour de pièce signalé',
    en: 'Part return reported',
    ar: 'تم الإبلاغ عن إرجاع قطعة',
  },
  'delivery.return.message': {
    fr: "Le chauffeur a signalé un retour de pièce par l'acheteur pour cette livraison.",
    en: 'The driver reported a part return by the buyer for this delivery.',
    ar: 'أبلغ السائق عن إرجاع قطعة من المشتري لهذا التوصيل.',
  },
  'delivery.updated.title': {
    fr: 'Mise à jour livraison',
    en: 'Delivery update',
    ar: 'تحديث التوصيل',
  },
  'delivery.updated.message': {
    fr: 'Votre livraison a été mise à jour.',
    en: 'Your delivery has been updated.',
    ar: 'تم تحديث توصيلك.',
  },
  'delivery.refusedReminder.title': {
    fr: 'Colis refusé - Rappel des conditions',
    en: 'Package refused - Terms reminder',
    ar: 'طرد مرفوض - تذكير بالشروط',
  },
  'delivery.refusedReminder.message': {
    fr: 'Le colis a été refusé. Conformément aux conditions, les frais de livraison restent dus, seuls les frais du colis peuvent être remboursés.',
    en: 'The package was refused. Per the terms, delivery fees remain due; only the item cost may be refunded.',
    ar: 'تم رفض الطرد. وفق الشروط، تبقى رسوم التوصيل مستحقة ويمكن استرداد ثمن القطعة فقط.',
  },
  'payment.balanceUpdated.title': {
    fr: 'Balance mise à jour',
    en: 'Balance updated',
    ar: 'تم تحديث الرصيد',
  },
  'payment.balanceDelivered.message': {
    fr: 'Votre balance a été créditée de {amount} XOF pour une livraison livrée.',
    en: 'Your balance was credited {amount} XOF for a completed delivery.',
    ar: 'تم إضافة {amount} XOF إلى رصيدك مقابل توصيل مكتمل.',
  },
  'payment.balanceRefused.message': {
    fr: 'Votre balance a été créditée de {amount} XOF pour une livraison refusée (frais de livraison).',
    en: 'Your balance was credited {amount} XOF for a refused delivery (delivery fees).',
    ar: 'تم إضافة {amount} XOF إلى رصيدك مقابل توصيل مرفوض (رسوم التوصيل).',
  },
  'payment.balanceConfirmed.message': {
    fr: 'Votre balance a été créditée de {amount} XOF après confirmation de livraison par l’acheteur.',
    en: 'Your balance was credited {amount} XOF after buyer delivery confirmation.',
    ar: 'تم إضافة {amount} XOF إلى رصيدك بعد تأكيد المشتري للتوصيل.',
  },
  'newArticle.buyer.title': {
    fr: 'Nouveau {articleTypeLabel} disponible',
    en: 'New {articleTypeLabel} available',
    ar: '{articleTypeLabel} جديد متاح',
  },
  'newArticle.buyer.message': {
    fr: '{articleTitle}{priceSuffix}',
    en: '{articleTitle}{priceSuffix}',
    ar: '{articleTitle}{priceSuffix}',
  },
  'newArticle.seller.title': {
    fr: 'Article publié',
    en: 'Listing published',
    ar: 'تم نشر الإعلان',
  },
  'newArticle.seller.message': {
    fr: 'Votre {articleTypeLabel} « {articleTitle} » est maintenant en ligne{priceSuffix}.',
    en: 'Your {articleTypeLabel} "{articleTitle}" is now online{priceSuffix}.',
    ar: '{articleTypeLabel} « {articleTitle} » متاح الآن على المنصة{priceSuffix}.',
  },
  'newArticle.admin.title': {
    fr: 'Nouvel article {articleTypeLabel}',
    en: 'New {articleTypeLabel} listing',
    ar: 'إعلان {articleTypeLabel} جديد',
  },
  'newArticle.admin.message': {
    fr: 'Un vendeur a publié : « {articleTitle} »{priceSuffix}',
    en: 'A seller published: "{articleTitle}"{priceSuffix}',
    ar: 'نشر بائع: « {articleTitle} »{priceSuffix}',
  },
  'verification.ready.title': {
    fr: 'Vérification : {articleTitle}',
    en: 'Verification: {articleTitle}',
    ar: 'التحقق: {articleTitle}',
  },
  'verification.ready.titleFallback': {
    fr: 'Vérification terminée',
    en: 'Verification completed',
    ar: 'اكتمل التحقق',
  },
  'verification.ready.message': {
    fr: 'Votre article « {articleTitle} » a été vérifié. Décidez maintenant de votre achat.',
    en: 'Your item "{articleTitle}" has been verified. Decide on your purchase now.',
    ar: 'تم التحقق من « {articleTitle} ». قرّر بشأن شرائك الآن.',
  },
  'verification.ready.messageFallback': {
    fr: 'Votre article a été vérifié. Décidez maintenant de votre achat.',
    en: 'Your item has been verified. Decide on your purchase now.',
    ar: 'تم التحقق من المنتج. قرّر بشأن شرائك الآن.',
  },
  'verification.resultAdmin.title': {
    fr: 'Vérification {actionTitleLabel}{articleSuffix}',
    en: 'Verification {actionTitleLabel}{articleSuffix}',
    ar: 'التحقق {actionTitleLabel}{articleSuffix}',
  },
  'verification.resultAdmin.message': {
    fr: '{buyerName} {actionLabel} la demande de vérification pour l’article « {articleTitle} ».',
    en: '{buyerName} {actionLabel} the verification request for item "{articleTitle}".',
    ar: '{buyerName} {actionLabel} طلب التحقق للمنتج « {articleTitle} ».',
  },
  'alert.vehicle.title': {
    fr: 'Nouvelle alerte véhicule',
    en: 'New vehicle alert',
    ar: 'تنبيه مركبة جديد',
  },
  'alert.vehicle.message': {
    fr: 'Un acheteur recherche {quantity} véhicule(s). Caractéristiques : {details}',
    en: 'A buyer is looking for {quantity} vehicle(s). Details: {details}',
    ar: 'مشتري يبحث عن {quantity} مركبة. التفاصيل: {details}',
  },
  'alert.piece.title': {
    fr: 'Nouvelle alerte pièce',
    en: 'New parts alert',
    ar: 'تنبيه قطع جديد',
  },
  'alert.piece.message': {
    fr: 'Un acheteur recherche {quantity} pièce(s) : {pieceName} pour {marque} {modele}. {details}',
    en: 'A buyer is looking for {quantity} part(s): {pieceName} for {marque} {modele}. {details}',
    ar: 'مشتري يبحث عن {quantity} قطعة: {pieceName} لـ {marque} {modele}. {details}',
  },
  'alert.proposal.title': {
    fr: 'Une proposition correspond à votre alerte',
    en: 'A listing matches your alert',
    ar: 'عرض يطابق تنبيهك',
  },
  'alert.proposal.message': {
    fr: 'Votre alerte a reçu une nouvelle proposition : « {articleTitle} ».',
    en: 'Your alert received a new proposal: "{articleTitle}".',
    ar: 'تلقى تنبيهك عرضاً جديداً: « {articleTitle} ».',
  },
  'article.rejected.title': {
    fr: 'Annonce rejetée',
    en: 'Listing rejected',
    ar: 'تم رفض الإعلان',
  },
  'article.rejected.message': {
    fr: 'Votre {articleTypeLabel} « {articleTitle} » a été rejetée. Motif : {motifRejet}',
    en: 'Your {articleTypeLabel} "{articleTitle}" was rejected. Reason: {motifRejet}',
    ar: 'تم رفض {articleTypeLabel} « {articleTitle} ». السبب: {motifRejet}',
  },
  'chat.new.title': {
    fr: 'Nouvelle discussion',
    en: 'New conversation',
    ar: 'محادثة جديدة',
  },
  'chat.new.message': {
    fr: '{senderName} a initié une discussion concernant votre article « {articleTitle} »',
    en: '{senderName} started a conversation about your listing "{articleTitle}"',
    ar: 'بدأ {senderName} محادثة بخصوص إعلانك « {articleTitle} »',
  },
  'tricycle.newRequest.title': {
    fr: 'Nouvelle demande Tricycle',
    en: 'New Tricycle request',
    ar: 'طلب تريكيلو جديد',
  },
  'tricycle.newRequest.message': {
    fr: '{buyerName} souhaite vous contacter pour un déplacement en tricycle.',
    en: '{buyerName} wants to contact you for a tricycle ride.',
    ar: 'يريد {buyerName} التواصل معك لرحلة تريكيلو.',
  },
  'tricycle.accepted.title': {
    fr: 'Demande Tricycle acceptée',
    en: 'Tricycle request accepted',
    ar: 'تم قبول طلب التريكيلو',
  },
  'tricycle.accepted.message': {
    fr: 'Le chauffeur a accepté votre demande. Vous pouvez maintenant échanger librement.',
    en: 'The driver accepted your request. You can chat freely now.',
    ar: 'قبل السائق طلبك. يمكنك المراسلة الآن.',
  },
  'tricycle.cancelled.title': {
    fr: 'Demande Tricycle annulée',
    en: 'Tricycle request cancelled',
    ar: 'تم إلغاء طلب التريكيلو',
  },
  'tricycle.cancelled.message': {
    fr: 'L’acheteur a annulé sa demande de tricycle.',
    en: 'The buyer cancelled their tricycle request.',
    ar: 'ألغى المشتري طلب التريكيلو.',
  },
  'tricycle.rejected.title': {
    fr: 'Demande Tricycle rejetée',
    en: 'Tricycle request rejected',
    ar: 'تم رفض طلب التريكيلو',
  },
  'tricycle.rejected.message': {
    fr: 'Le chauffeur a rejeté votre demande de tricycle.',
    en: 'The driver rejected your tricycle request.',
    ar: 'رفض السائق طلب التريكيلو.',
  },
  'purchase.validated.title': {
    fr: 'Achat validé',
    en: 'Purchase confirmed',
    ar: 'تم تأكيد الشراء',
  },
  'purchase.validated.message': {
    fr: 'Un achat a été validé',
    en: 'A purchase has been confirmed',
    ar: 'تم تأكيد عملية شراء',
  },
  'transitaireVerification.approved.title': {
    fr: 'Vérification transitaire approuvée',
    en: 'Forwarder verification approved',
    ar: 'تمت الموافقة على التحقق من الوسيط',
  },
  'transitaireVerification.approved.message': {
    fr: 'Votre compte transitaire a été vérifié. Souscrivez à un abonnement pour être visible sur Tranoo.',
    en: 'Your forwarder account has been verified. Subscribe to appear on Tranoo.',
    ar: 'تم التحقق من حساب الوسيط. اشترك ليظهر حسابك على Tranoo.',
  },
  'transitaireVerification.rejected.title': {
    fr: 'Vérification transitaire refusée',
    en: 'Forwarder verification rejected',
    ar: 'تم رفض التحقق من الوسيط',
  },
  'transitaireVerification.rejected.message': {
    fr: 'Votre demande a été rejetée : {rejectionMotif}. Corrigez et renvoyez votre dossier.',
    en: 'Your request was rejected: {rejectionMotif}. Please fix and resubmit your file.',
    ar: 'تم رفض طلبك: {rejectionMotif}. صحّح الملف وأعد إرساله.',
  },
  'transit.purchaseCancelled.title': {
    fr: 'Achat annulé',
    en: 'Purchase cancelled',
    ar: 'تم إلغاء الشراء',
  },
  'transit.purchaseCancelled.message': {
    fr: 'L\'acheteur a annulé l\'achat du véhicule « {articleTitle} » après vérification. La mission est clôturée.',
    en: 'The buyer cancelled the purchase of "{articleTitle}" after verification. The mission is closed.',
    ar: 'ألغى المشتري شراء « {articleTitle} » بعد التحقق. تم إغلاق المهمة.',
  },
  'transit.rejected.title': {
    fr: 'Transitaire indisponible',
    en: 'Forwarder unavailable',
    ar: 'الوسيط غير متاح',
  },
  'transit.rejected.message': {
    fr: 'Le transitaire ne peut pas prendre en charge « {articleTitle} ». Choisissez un autre transitaire depuis votre historique d\'achats.',
    en: 'The forwarder cannot handle "{articleTitle}". Choose another forwarder from your purchase history.',
    ar: 'لا يمكن للوسيط تولي « {articleTitle} ». اختر وسيطاً آخر من سجل مشترياتك.',
  },
};

const articleTypeLabels = {
  piece: { fr: 'pièce', en: 'part', ar: 'قطعة' },
  moto: { fr: 'moto', en: 'motorcycle', ar: 'دراجة' },
  vehicle: { fr: 'véhicule', en: 'vehicle', ar: 'مركبة' },
};

const verificationActionLabels = {
  approved: { fr: 'a validé', en: 'has approved', ar: 'وافق على' },
  rejected: { fr: 'a rejeté', en: 'has rejected', ar: 'رفض' },
};

const verificationActionTitleLabels = {
  approved: { fr: 'validée', en: 'approved', ar: 'مقبولة' },
  rejected: { fr: 'rejetée', en: 'rejected', ar: 'مرفوضة' },
};

function normalizeLocale(locale) {
  const l = String(locale || 'fr').toLowerCase().split('-')[0];
  if (l === 'en' || l === 'ar') return l;
  return 'fr';
}

function resolveUserLocale(user, req) {
  const fromUser = user?.langue;
  if (fromUser) return normalizeLocale(fromUser);
  return resolveLocale(req);
}

function articleTypeLabel(articleType, locale) {
  const t = String(articleType || 'vehicle').toLowerCase();
  if (t === 'piece') return articleTypeLabels.piece[locale] || articleTypeLabels.piece.fr;
  if (t === 'moto') return articleTypeLabels.moto[locale] || articleTypeLabels.moto.fr;
  return articleTypeLabels.vehicle[locale] || articleTypeLabels.vehicle.fr;
}

function expandParams(params, locale) {
  const out = { ...(params || {}) };
  if (out.articleType && !out.articleTypeLabel) {
    out.articleTypeLabel = articleTypeLabel(out.articleType, locale);
  }
  if (out.action && !out.actionLabel) {
    const key = out.action === 'approve' ? 'approved' : 'rejected';
    out.actionLabel =
      verificationActionLabels[key]?.[locale] ||
      verificationActionLabels[key]?.fr ||
      out.action;
    out.actionTitleLabel =
      verificationActionTitleLabels[key]?.[locale] ||
      verificationActionTitleLabels[key]?.fr ||
      out.action;
  }
  if (out.articleTitle && !out.articleSuffix) {
    out.articleSuffix = out.articleTitle ? ` — ${out.articleTitle}` : '';
  }
  return out;
}

function formatTemplate(key, locale, params = {}) {
  const entry = templates[key];
  if (!entry) return key;
  const loc = normalizeLocale(locale);
  let text = entry[loc] ?? entry.fr ?? key;
  const expanded = expandParams(params, loc);
  text = text.replace(/\{(\w+)\}/g, (_, name) => {
    const val = expanded[name];
    return val === undefined || val === null ? '' : String(val);
  });
  return text;
}

/**
 * @param {{ titleKey: string, messageKey: string, params?: Record<string, unknown> }} spec
 */
function buildNotificationContent(spec) {
  const { titleKey, messageKey, params = {} } = spec;
  return {
    titleKey,
    messageKey,
    i18nParams: params,
    title: formatTemplate(titleKey, 'fr', params),
    message: formatTemplate(messageKey, 'fr', params),
  };
}

function localizedPushTexts(spec, locale) {
  const { titleKey, messageKey, params = {} } = spec;
  return {
    title: formatTemplate(titleKey, locale, params),
    body: formatTemplate(messageKey, locale, params),
  };
}

module.exports = {
  templates,
  formatTemplate,
  buildNotificationContent,
  localizedPushTexts,
  resolveUserLocale,
  articleTypeLabel,
};
