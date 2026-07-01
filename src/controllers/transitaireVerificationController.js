const User = require('../models/User');
const Subscription = require('../models/Subscription');
const notificationController = require('./notificationController');
const { buildNotificationContent } = require('../utils/notificationI18n');
const {
  internationalPhoneFromDigits,
  canonicalPhoneDigits,
} = require('../utils/phoneNormalize');

const ADMIN_ROLES = new Set([
  'admin',
  'superAdmin',
  'principal',
  'gestionnaire',
  'moderateur',
]);

function isAdminUser(user) {
  if (!user) return false;
  const role = String(user.role || '');
  const typeAdmin = String(user.typeAdmin || '');
  return role === 'admin' || ADMIN_ROLES.has(typeAdmin);
}

function isTransitaireApproved(user) {
  if (!user || user.role !== 'transitaire') return false;
  if (user.transitaireVerification?.statut !== 'approved') return false;
  return hasUploadedVerificationDocs(user);
}

function hasUploadedVerificationDocs(user) {
  const tv = user?.transitaireVerification || {};
  return Boolean(
    String(tv.carteRectoUrl || '').trim() &&
      String(tv.carteVersoUrl || '').trim(),
  );
}

async function hasActiveSubscription(userId) {
  const sub = await Subscription.findOne({ user: userId }).lean();
  if (!sub?.expiresAt) return { active: false, everHad: false };
  const active = new Date(sub.expiresAt) > new Date();
  return { active, everHad: true, expiresAt: sub.expiresAt };
}

function serializeVerification(user) {
  const tv = user.transitaireVerification || {};
  return {
    statut: tv.statut || 'none',
    carteRectoUrl: tv.carteRectoUrl || null,
    carteVersoUrl: tv.carteVersoUrl || null,
    entrepriseProvenanceNom:
      tv.entrepriseProvenanceNom ||
      user.entrepriseProvenance ||
      user.entreprise ||
      null,
    entrepriseProvenanceReference: tv.entrepriseProvenanceReference || null,
    submittedAt: tv.submittedAt || null,
    reviewedAt: tv.reviewedAt || null,
    rejectionMotif: tv.rejectionMotif || null,
  };
}

/** Comptes legacy sans `telephone` : reconstruit depuis telephoneCanonical si possible. */
function ensureTelephoneForSave(user) {
  if (String(user.telephone || '').trim()) return true;
  const canon = String(user.telephoneCanonical || '').trim();
  if (canon.length >= 8 && !/^0+$/.test(canon)) {
    user.telephone = internationalPhoneFromDigits(canon);
    return Boolean(String(user.telephone || '').trim());
  }
  return false;
}

/** Met à jour la vérification sans re-valider tout le document User (comptes legacy). */
async function applyVerificationReviewUpdate(userId, verificationPatch) {
  const user = await User.findOne({ _id: userId, role: 'transitaire' });
  if (!user) return null;

  const base =
    user.transitaireVerification?.toObject?.() ||
    user.transitaireVerification ||
    {};

  const verificationUpdate = {
    ...base,
    ...verificationPatch,
  };

  await User.updateOne(
    { _id: userId },
    { $set: { transitaireVerification: verificationUpdate } },
  );

  return User.findById(userId);
}

async function notifyVerificationDecision(user, adminId, type, i18n, extraData) {
  try {
    const content = buildNotificationContent(i18n);
    await notificationController.createNotification(
      user._id,
      adminId,
      content.title,
      content.message,
      type,
      user._id,
      'User',
      extraData,
      i18n,
    );
  } catch (notifErr) {
    console.error('[TRANSITAIRE_VERIF] notification error:', notifErr);
  }
}

function buildAccessPayload(user, subscriptionInfo) {
  const approved = isTransitaireApproved(user);
  const statut = user.transitaireVerification?.statut || 'none';
  const subscriptionActive = subscriptionInfo?.active === true;

  let gate = 'full_access';
  if (!approved) {
    if (statut === 'pending' || statut === 'pending_resubmit') {
      gate = 'verification_pending';
    } else if (statut === 'rejected') {
      gate = 'verification_rejected';
    } else if (statut === 'approved') {
      gate = 'verification_required';
    } else {
      gate = 'verification_required';
    }
  } else if (!subscriptionActive) {
    gate =
      subscriptionInfo?.everHad === true
        ? 'subscription_expired'
        : 'subscription_required';
  }

  return {
    gate,
    verification: serializeVerification(user),
    hasActiveSubscription: subscriptionActive,
    subscriptionExpiresAt: subscriptionInfo?.expiresAt || null,
  };
}

exports.getMyStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
    if (user.role !== 'transitaire') {
      return res.status(403).json({ message: 'Réservé aux transitaires' });
    }
    const subscriptionInfo = await hasActiveSubscription(user._id);
    res.json(buildAccessPayload(user, subscriptionInfo));
  } catch (error) {
    res.status(500).json({
      message: 'Erreur lors de la récupération du statut de vérification',
      error: error.message,
    });
  }
};

exports.submitVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
    if (user.role !== 'transitaire') {
      return res.status(403).json({ message: 'Réservé aux transitaires' });
    }
    if (isTransitaireApproved(user)) {
      return res.status(400).json({
        code: 'TRANSITAIRE_VERIF_ALREADY_VERIFIED',
        message: 'Votre compte est déjà vérifié',
      });
    }
    if (['pending', 'pending_resubmit'].includes(user.transitaireVerification?.statut)) {
      return res.status(400).json({
        code: 'TRANSITAIRE_VERIF_PENDING',
        message: 'Une demande est déjà en cours d\'examen (délai 24h)',
      });
    }

    const {
      carteRectoUrl,
      carteVersoUrl,
      entrepriseProvenanceNom,
      entrepriseProvenanceReference,
    } = req.body;

    if (!carteRectoUrl || !carteVersoUrl) {
      return res.status(400).json({
        code: 'TRANSITAIRE_VERIF_CARDS_REQUIRED',
        message: 'Les photos recto et verso de la carte transitaire sont requises',
      });
    }
    if (!entrepriseProvenanceNom?.trim() || !entrepriseProvenanceReference?.trim()) {
      return res.status(400).json({
        code: 'TRANSITAIRE_VERIF_COMPANY_REQUIRED',
        message: 'Le nom et le numéro de référence de l\'entreprise de provenance sont requis',
      });
    }
    const referencePhone = canonicalPhoneDigits({
      telephone: String(entrepriseProvenanceReference).replace(/\s+/g, ''),
    });
    if (!/^\d{8,15}$/.test(referencePhone)) {
      return res.status(400).json({
        code: 'TRANSITAIRE_VERIF_REFERENCE_PHONE_INVALID',
        message: 'Le numéro de référence doit être un numéro de téléphone valide',
      });
    }

    const prevStatut = user.transitaireVerification?.statut || 'none';
    const nextStatut =
      prevStatut === 'rejected' ? 'pending_resubmit' : 'pending';

    const verificationUpdate = {
      ...(user.transitaireVerification?.toObject?.() ||
        user.transitaireVerification ||
        {}),
      statut: nextStatut,
      carteRectoUrl: String(carteRectoUrl).trim(),
      carteVersoUrl: String(carteVersoUrl).trim(),
      entrepriseProvenanceNom: String(entrepriseProvenanceNom).trim(),
      entrepriseProvenanceReference: referencePhone,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionMotif: null,
    };

    const entrepriseProvenance = String(entrepriseProvenanceNom).trim();
    ensureTelephoneForSave(user);

    const $set = {
      entrepriseProvenance,
      transitaireVerification: verificationUpdate,
    };
    if (String(user.telephone || '').trim()) {
      $set.telephone = user.telephone;
      if (user.telephoneCanonical) {
        $set.telephoneCanonical = user.telephoneCanonical;
      }
    }

    await User.updateOne({ _id: user._id }, { $set });

    const refreshed = await User.findById(user._id);
    if (!refreshed) {
      return res.status(500).json({
        message: 'Erreur lors de l\'enregistrement de la demande',
      });
    }

    const subscriptionInfo = await hasActiveSubscription(refreshed._id);
    res.status(201).json({
      message: 'Demande de vérification envoyée. Délai d\'examen : 24h.',
      ...buildAccessPayload(refreshed, subscriptionInfo),
    });
  } catch (error) {
    console.error('[TRANSITAIRE_VERIF] submit error:', error);
    res.status(500).json({
      message: 'Erreur lors de l\'envoi de la demande de vérification',
      error: error.message,
    });
  }
};

exports.listDemandes = async (req, res) => {
  try {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
    }
    const { statut } = req.query;
    const filter = { role: 'transitaire' };
    if (statut && statut !== 'all') {
      if (statut === 'pending') {
        filter['transitaireVerification.statut'] = {
          $in: ['pending', 'pending_resubmit'],
        };
      } else {
        filter['transitaireVerification.statut'] = statut;
      }
    } else {
      filter.$or = [
        { 'transitaireVerification.statut': { $in: ['pending', 'pending_resubmit', 'rejected'] } },
        { 'transitaireVerification.statut': { $in: [null, 'none'] } },
        { 'transitaireVerification.statut': { $exists: false } },
      ];
    }

    const users = await User.find(filter)
      .select(
        'nom prenoms email telephone photo entreprise entrepriseProvenance transitaireVerification dateInscription',
      )
      .sort({ 'transitaireVerification.submittedAt': -1, dateInscription: -1 })
      .lean();

    const list = users.map((u) => ({
      _id: u._id,
      nom: u.nom,
      prenoms: u.prenoms,
      email: u.email,
      telephone: u.telephone,
      photo: u.photo,
      entreprise: u.entreprise,
      dateInscription: u.dateInscription,
      verification: serializeVerification(u),
    }));

    res.json(list);
  } catch (error) {
    res.status(500).json({
      message: 'Erreur lors de la récupération des demandes',
      error: error.message,
    });
  }
};

exports.getDemandeByUserId = async (req, res) => {
  try {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
    }
    const user = await User.findOne({
      _id: req.params.userId,
      role: 'transitaire',
    }).lean();
    if (!user) {
      return res.status(404).json({ message: 'Transitaire introuvable' });
    }
    const subscriptionInfo = await hasActiveSubscription(user._id);
    res.json({
      _id: user._id,
      nom: user.nom,
      prenoms: user.prenoms,
      email: user.email,
      telephone: user.telephone,
      photo: user.photo,
      entreprise: user.entreprise,
      pays: user.pays,
      ville: user.ville,
      dateInscription: user.dateInscription,
      hasActiveSubscription: subscriptionInfo.active,
      verification: serializeVerification(user),
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erreur lors de la récupération du détail',
      error: error.message,
    });
  }
};

exports.approveDemande = async (req, res) => {
  try {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
    }
    const user = await User.findOne({
      _id: req.params.userId,
      role: 'transitaire',
    });
    if (!user) {
      return res.status(404).json({ message: 'Transitaire introuvable' });
    }
    if (!['pending', 'pending_resubmit'].includes(user.transitaireVerification?.statut)) {
      return res.status(400).json({
        message: 'Seules les demandes en attente peuvent être validées',
      });
    }
    if (!hasUploadedVerificationDocs(user)) {
      return res.status(400).json({
        code: 'TRANSITAIRE_VERIF_DOCS_MISSING',
        message: 'Le dossier doit contenir les photos recto et verso de la carte',
      });
    }

    const refreshed = await applyVerificationReviewUpdate(user._id, {
      statut: 'approved',
      reviewedAt: new Date(),
      reviewedBy: req.user._id,
      rejectionMotif: null,
    });
    if (!refreshed) {
      return res.status(404).json({ message: 'Transitaire introuvable' });
    }

    await notifyVerificationDecision(
      refreshed,
      req.user._id,
      'transitaire_verification_approved',
      {
        titleKey: 'transitaireVerification.approved.title',
        messageKey: 'transitaireVerification.approved.message',
      },
      { gate: 'subscription_required' },
    );

    res.json({
      message: 'Demande validée',
      verification: serializeVerification(refreshed),
    });
  } catch (error) {
    console.error('[TRANSITAIRE_VERIF] approve error:', error);
    res.status(500).json({
      message: 'Erreur lors de la validation',
      error: error.message,
    });
  }
};

exports.rejectDemande = async (req, res) => {
  try {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
    }
    const motif = String(req.body?.motif || req.body?.rejectionMotif || '').trim();
    if (!motif) {
      return res.status(400).json({ message: 'Le motif du rejet est obligatoire' });
    }

    const user = await User.findOne({
      _id: req.params.userId,
      role: 'transitaire',
    });
    if (!user) {
      return res.status(404).json({ message: 'Transitaire introuvable' });
    }
    if (!['pending', 'pending_resubmit'].includes(user.transitaireVerification?.statut)) {
      return res.status(400).json({
        message: 'Seules les demandes en attente peuvent être rejetées',
      });
    }

    const refreshed = await applyVerificationReviewUpdate(user._id, {
      statut: 'rejected',
      reviewedAt: new Date(),
      reviewedBy: req.user._id,
      rejectionMotif: motif,
    });
    if (!refreshed) {
      return res.status(404).json({ message: 'Transitaire introuvable' });
    }

    await notifyVerificationDecision(
      refreshed,
      req.user._id,
      'transitaire_verification_rejected',
      {
        titleKey: 'transitaireVerification.rejected.title',
        messageKey: 'transitaireVerification.rejected.message',
        params: { rejectionMotif: motif },
      },
      { gate: 'verification_rejected', rejectionMotif: motif },
    );

    res.json({
      message: 'Demande rejetée',
      verification: serializeVerification(refreshed),
    });
  } catch (error) {
    console.error('[TRANSITAIRE_VERIF] reject error:', error);
    res.status(500).json({
      message: 'Erreur lors du rejet',
      error: error.message,
    });
  }
};

exports.isTransitaireApproved = isTransitaireApproved;
exports.buildAccessPayload = buildAccessPayload;
exports.hasUploadedVerificationDocs = hasUploadedVerificationDocs;
