/**
 * Remise véhicule Layaway (Phase 5).
 * PAIEMENT_COMPLET → REMISE_EN_ATTENTE (PV signé) → REMISE_VALIDEE (admin).
 *
 * Preuves acheteur actuelles : PV (url) + signature du PV.
 * Pièce d’identité : collectée à la signature du contrat (pas ici).
 * Photos : hors scope pour l’instant (à revoir plus tard).
 */

const mongoose = require('mongoose');
const Layaway = require('../../models/Layaway');
const Article = require('../../models/Article');
const Notification = require('../../models/Notification');
const { transition } = require('./LayawayStateMachine');

function deliveryError(message, code, status = 400, meta) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (meta) err.meta = meta;
  return err;
}

async function loadDossier(layawayId) {
  if (!mongoose.isValidObjectId(layawayId)) {
    throw deliveryError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  const layaway = await Layaway.findById(layawayId);
  if (!layaway) {
    throw deliveryError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  return layaway;
}

function assertBuyerOwns(layaway, buyerId) {
  if (String(layaway.buyerId) !== String(buyerId)) {
    throw deliveryError('Accès refusé', 'LAYAWAY_FORBIDDEN', 403);
  }
}

function serializeDelivery(layaway) {
  const d = layaway.delivery || {};
  return {
    status: d.status || 'NONE',
    pvUrl: d.pvUrl || null,
    hasSignature: Boolean(d.signatureData),
    signatureData: d.signatureData || null,
    signerFirstName: d.signerFirstName || null,
    signerLastName: d.signerLastName || null,
    signedAt: d.signedAt || null,
    notes: d.notes || null,
    submittedAt: d.submittedAt || null,
    validatedAt: d.validatedAt || layaway.deliveryValidatedAt || null,
    validationNotes: d.validationNotes || null,
    rejectedAt: d.rejectedAt || null,
    rejectionReason: d.rejectionReason || null,
    /** Pièce ID déjà sur le contrat (indicatif pour admin) */
    contractIdDocumentUrl: layaway.contract?.idDocumentUrl || null,
  };
}

/**
 * Preuves MVP : PV + signature du PV.
 */
function assertProofs({ pvUrl, signatureData }) {
  if (!pvUrl) {
    throw deliveryError('PV de remise requis (pvUrl)', 'LAYAWAY_DELIVERY_PV_REQUIRED');
  }
  const signature = String(signatureData || '').trim();
  if (!signature) {
    throw deliveryError(
      'Signature du PV requise (signatureData)',
      'LAYAWAY_DELIVERY_PV_SIGNATURE_REQUIRED',
    );
  }
  if (signature.length < 20) {
    throw deliveryError(
      'Données de signature du PV invalides',
      'LAYAWAY_DELIVERY_PV_SIGNATURE_INVALID',
    );
  }
}

/**
 * Acheteur dépose le PV signé → REMISE_EN_ATTENTE.
 * Autorisé depuis PAIEMENT_COMPLET, ou resoumission depuis REMISE_EN_ATTENTE (après rejet).
 */
async function submitDelivery(layawayId, {
  buyerId,
  isAdmin = false,
  pvUrl,
  signatureData,
  firstName,
  lastName,
  notes,
} = {}) {
  const layaway = await loadDossier(layawayId);
  if (!isAdmin) assertBuyerOwns(layaway, buyerId);

  const allowed = new Set(['PAIEMENT_COMPLET', 'REMISE_EN_ATTENTE']);
  if (!allowed.has(layaway.status)) {
    throw deliveryError(
      `Remise impossible dans l'état ${layaway.status}`,
      'LAYAWAY_DELIVERY_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }

  const pv = String(pvUrl || '').trim();
  const signature = String(signatureData || '').trim();
  assertProofs({ pvUrl: pv, signatureData: signature });

  const prenom =
    String(firstName || '').trim() ||
    layaway.contract?.signerFirstName ||
    '';
  const nom =
    String(lastName || '').trim() ||
    layaway.contract?.signerLastName ||
    '';

  const now = new Date();
  layaway.delivery = layaway.delivery || {};
  layaway.delivery.status = 'SUBMITTED';
  layaway.delivery.pvUrl = pv;
  layaway.delivery.signatureData = signature;
  layaway.delivery.signerFirstName = prenom || null;
  layaway.delivery.signerLastName = nom || null;
  layaway.delivery.signedAt = now;
  layaway.delivery.notes =
    notes != null ? String(notes).trim() || null : layaway.delivery.notes;
  layaway.delivery.submittedAt = now;
  layaway.delivery.submittedByUserId = buyerId || null;
  layaway.delivery.rejectedAt = null;
  layaway.delivery.rejectedByUserId = null;
  layaway.delivery.rejectionReason = null;
  layaway.delivery.idDocumentUrl = null;
  layaway.delivery.photoUrls = [];

  if (layaway.status === 'PAIEMENT_COMPLET') {
    transition('PAIEMENT_COMPLET', 'REMISE_EN_ATTENTE');
    layaway.status = 'REMISE_EN_ATTENTE';
  }

  await layaway.save();
  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    delivery: serializeDelivery(layaway),
  };
}

async function getDelivery(layawayId, { buyerId, isAdmin = false } = {}) {
  const layaway = await loadDossier(layawayId);
  if (!isAdmin) assertBuyerOwns(layaway, buyerId);
  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    delivery: serializeDelivery(layaway),
    deliveryValidatedAt: layaway.deliveryValidatedAt,
  };
}

/**
 * Admin valide la remise → REMISE_VALIDEE, payout ELIGIBLE, véhicule REMIS.
 */
async function validateDelivery(layawayId, adminUserId, { notes } = {}) {
  const layaway = await loadDossier(layawayId);
  if (layaway.status !== 'REMISE_EN_ATTENTE') {
    throw deliveryError(
      `Validation remise impossible dans l'état ${layaway.status}`,
      'LAYAWAY_DELIVERY_VALIDATE_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }
  if (layaway.delivery?.status !== 'SUBMITTED') {
    throw deliveryError(
      'PV de remise non soumis',
      'LAYAWAY_DELIVERY_NOT_SUBMITTED',
      409,
    );
  }
  if (!layaway.delivery?.pvUrl || !layaway.delivery?.signatureData) {
    throw deliveryError(
      'PV signé incomplet',
      'LAYAWAY_DELIVERY_PV_INCOMPLETE',
      409,
    );
  }

  const now = new Date();
  transition('REMISE_EN_ATTENTE', 'REMISE_VALIDEE');
  layaway.status = 'REMISE_VALIDEE';

  layaway.delivery.status = 'VALIDATED';
  layaway.delivery.validatedAt = now;
  layaway.delivery.validatedByUserId = adminUserId || null;
  layaway.delivery.validationNotes =
    notes != null ? String(notes).trim() || null : null;
  layaway.deliveryValidatedAt = now;

  const payoutAmount =
    layaway.pricing?.sellerPrice != null
      ? Number(layaway.pricing.sellerPrice)
      : null;
  layaway.payout = layaway.payout || {};
  layaway.payout.status = 'ELIGIBLE';
  layaway.payout.amount = payoutAmount;
  layaway.payout.currency = layaway.pricing?.currency || 'XOF';
  layaway.payout.eligibleAt = now;

  await layaway.save();

  await Article.findOneAndUpdate(
    { _id: layaway.vehicleId, source: 'layaway' },
    {
      $set: {
        layawayPublicationStatus: 'REMIS',
        statut: 'vendu',
        statutVente: 'vendu',
        dateLivraison: now,
      },
    },
  );

  try {
    await Notification.create({
      recipient: layaway.buyerId,
      sender: 'system',
      title: 'Layaway — remise validée',
      message:
        'La remise de votre véhicule Layaway a été validée par Tranoo. La facture sera émise à la clôture.',
      type: 'paiement',
      relatedId: layaway._id,
      relatedModel: 'Layaway',
      data: { layawayId: String(layaway._id), kind: 'DELIVERY_VALIDATED' },
    });
  } catch (err) {
    console.error('[LAYAWAY][DELIVERY] Notif validation échouée:', err.message);
  }

  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    delivery: serializeDelivery(layaway),
    payout: {
      status: layaway.payout.status,
      amount: layaway.payout.amount,
      currency: layaway.payout.currency,
      eligibleAt: layaway.payout.eligibleAt,
    },
    deliveryValidatedAt: layaway.deliveryValidatedAt,
  };
}

/**
 * Admin rejette le PV — reste REMISE_EN_ATTENTE, delivery REJECTED.
 * L’acheteur peut resoumettre.
 */
async function rejectDelivery(layawayId, adminUserId, { reason } = {}) {
  const layaway = await loadDossier(layawayId);
  if (layaway.status !== 'REMISE_EN_ATTENTE') {
    throw deliveryError(
      `Rejet remise impossible dans l'état ${layaway.status}`,
      'LAYAWAY_DELIVERY_REJECT_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }

  const why = String(reason || '').trim();
  if (!why) {
    throw deliveryError(
      'Motif de rejet requis (reason)',
      'LAYAWAY_DELIVERY_REJECT_REASON_REQUIRED',
    );
  }

  const now = new Date();
  layaway.delivery = layaway.delivery || {};
  layaway.delivery.status = 'REJECTED';
  layaway.delivery.rejectedAt = now;
  layaway.delivery.rejectedByUserId = adminUserId || null;
  layaway.delivery.rejectionReason = why;

  await layaway.save();

  try {
    await Notification.create({
      recipient: layaway.buyerId,
      sender: 'system',
      title: 'Layaway — PV de remise refusé',
      message: `Votre PV de remise a été refusé : ${why}. Veuillez le soumettre à nouveau (document + signature).`,
      type: 'paiement',
      relatedId: layaway._id,
      relatedModel: 'Layaway',
      data: { layawayId: String(layaway._id), kind: 'DELIVERY_REJECTED', reason: why },
    });
  } catch (err) {
    console.error('[LAYAWAY][DELIVERY] Notif rejet échouée:', err.message);
  }

  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    delivery: serializeDelivery(layaway),
  };
}

module.exports = {
  submitDelivery,
  getDelivery,
  validateDelivery,
  rejectDelivery,
  serializeDelivery,
  assertProofs,
};
