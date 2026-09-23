/**
 * Remise véhicule Layaway (Phase 5).
 * PAIEMENT_COMPLET → REMISE_EN_ATTENTE (preuves) → REMISE_VALIDEE (admin).
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

function normalizeUrlList(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  return arr
    .map((u) => String(u || '').trim())
    .filter(Boolean);
}

function serializeDelivery(layaway) {
  const d = layaway.delivery || {};
  return {
    status: d.status || 'NONE',
    pvUrl: d.pvUrl || null,
    photoUrls: d.photoUrls || [],
    idDocumentUrl: d.idDocumentUrl || null,
    notes: d.notes || null,
    submittedAt: d.submittedAt || null,
    validatedAt: d.validatedAt || layaway.deliveryValidatedAt || null,
    validationNotes: d.validationNotes || null,
    rejectedAt: d.rejectedAt || null,
    rejectionReason: d.rejectionReason || null,
  };
}

function assertProofs({ pvUrl, photoUrls, idDocumentUrl }) {
  if (!pvUrl) {
    throw deliveryError('PV de remise requis (pvUrl)', 'LAYAWAY_DELIVERY_PV_REQUIRED');
  }
  if (!idDocumentUrl) {
    throw deliveryError(
      'Pièce d’identité requise (idDocumentUrl)',
      'LAYAWAY_DELIVERY_ID_REQUIRED',
    );
  }
  if (!photoUrls || photoUrls.length < 1) {
    throw deliveryError(
      'Au moins une photo de remise requise (photoUrls)',
      'LAYAWAY_DELIVERY_PHOTOS_REQUIRED',
    );
  }
}

/**
 * Acheteur (ou admin) dépose les preuves et passe en REMISE_EN_ATTENTE.
 * Autorisé depuis PAIEMENT_COMPLET, ou resoumission depuis REMISE_EN_ATTENTE (après rejet).
 */
async function submitDelivery(layawayId, {
  buyerId,
  isAdmin = false,
  pvUrl,
  photoUrls,
  idDocumentUrl,
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
  const photos = normalizeUrlList(photoUrls);
  const idDoc = String(idDocumentUrl || '').trim();
  assertProofs({ pvUrl: pv, photoUrls: photos, idDocumentUrl: idDoc });

  const now = new Date();
  layaway.delivery = layaway.delivery || {};
  layaway.delivery.status = 'SUBMITTED';
  layaway.delivery.pvUrl = pv;
  layaway.delivery.photoUrls = photos;
  layaway.delivery.idDocumentUrl = idDoc;
  layaway.delivery.notes = notes != null ? String(notes).trim() || null : layaway.delivery.notes;
  layaway.delivery.submittedAt = now;
  layaway.delivery.submittedByUserId = buyerId || null;
  layaway.delivery.rejectedAt = null;
  layaway.delivery.rejectedByUserId = null;
  layaway.delivery.rejectionReason = null;

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
      'Preuves de remise non soumises',
      'LAYAWAY_DELIVERY_NOT_SUBMITTED',
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
 * Admin rejette les preuves — reste REMISE_EN_ATTENTE, delivery REJECTED.
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
      title: 'Layaway — preuves de remise refusées',
      message: `Vos preuves de remise ont été refusées : ${why}. Veuillez les soumettre à nouveau.`,
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
