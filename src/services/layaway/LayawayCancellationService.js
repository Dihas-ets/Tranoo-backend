/**
 * Annulation / remboursement Layaway (Phase 6).
 *
 * Flux : demande → ANNULATION_DEMANDEE → (approve) REMBOURSEMENT_EN_COURS
 *        → (execute) ANNULE
 *        ou (reject) retour previousStatus
 *        ou (approve + refund=0) ANNULE direct
 *
 * Retenue : appliedParameters.retentionPercentage sur base = total payé
 * (garantie + échéances). TODO métier §7 : base exacte de la retenue.
 * Modes : BANK_TRANSFER | CHECK uniquement.
 */

const mongoose = require('mongoose');
const Layaway = require('../../models/Layaway');
const Article = require('../../models/Article');
const Notification = require('../../models/Notification');
const { transition, canTransition } = require('./LayawayStateMachine');
const { DEFAULTS } = require('../../models/LayawaySettings');

const CANCELABLE_STATUSES = new Set([
  'CONTRAT_SIGNE',
  'ACTIF',
  'EN_RETARD',
  'GELE',
]);

const REFUND_MODES = new Set(['BANK_TRANSFER', 'CHECK']);

function cancelError(message, code, status = 400, meta) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (meta) err.meta = meta;
  return err;
}

function roundXof(n) {
  return Math.round(Number(n) || 0);
}

async function loadDossier(layawayId) {
  if (!mongoose.isValidObjectId(layawayId)) {
    throw cancelError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  const layaway = await Layaway.findById(layawayId);
  if (!layaway) {
    throw cancelError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  return layaway;
}

function assertBuyerOwns(layaway, buyerId) {
  if (String(layaway.buyerId) !== String(buyerId)) {
    throw cancelError('Accès refusé', 'LAYAWAY_FORBIDDEN', 403);
  }
}

/**
 * Montants retenue / remboursement (pur, testable).
 * Base MVP = total payé (garantie si PAID + échéances).
 */
function computeRefundBreakdown(layaway) {
  const guaranteePaid =
    layaway.guarantee?.status === 'PAID'
      ? roundXof(layaway.guarantee.amount)
      : 0;
  const installmentsPaid = roundXof(layaway.aggregates?.totalInstallmentsPaid);
  const totalPaid = guaranteePaid + installmentsPaid;

  const pctRaw = Number(layaway.appliedParameters?.retentionPercentage);
  const retentionPercentage =
    Number.isFinite(pctRaw) && pctRaw >= 0 ? pctRaw : DEFAULTS.retentionPercentage;

  const retentionBase = totalPaid; // TODO métier : autre base possible
  const retentionAmount =
    totalPaid > 0 ? roundXof((retentionBase * retentionPercentage) / 100) : 0;
  const refundAmount = Math.max(0, totalPaid - retentionAmount);

  return {
    totalPaid,
    retentionPercentage,
    retentionBase,
    retentionAmount,
    refundAmount,
    currency: layaway.pricing?.currency || 'XOF',
    guaranteePaid,
    installmentsPaid,
  };
}

function serializeCancellation(layaway) {
  const c = layaway.cancellation || {};
  return {
    status: c.status || 'NONE',
    previousStatus: c.previousStatus || null,
    reason: c.reason || null,
    requestedAt: c.requestedAt || null,
    totalPaid: c.totalPaid ?? null,
    retentionPercentage: c.retentionPercentage ?? null,
    retentionBase: c.retentionBase ?? null,
    retentionAmount: c.retentionAmount ?? null,
    refundAmount: c.refundAmount ?? null,
    currency: c.currency || layaway.pricing?.currency || 'XOF',
    refundMode: c.refundMode || null,
    bankDetails: c.bankDetails || null,
    checkDetails: c.checkDetails || null,
    approvedAt: c.approvedAt || null,
    rejectedAt: c.rejectedAt || null,
    rejectionReason: c.rejectionReason || null,
    executedAt: c.executedAt || null,
    executionReference: c.executionReference || null,
    notes: c.notes || null,
  };
}

function requireRefundDestination(mode, { bankDetails, checkDetails }) {
  if (mode === 'BANK_TRANSFER') {
    const name = String(bankDetails?.accountName || '').trim();
    const bank = String(bankDetails?.bankName || '').trim();
    const account = String(bankDetails?.ibanOrAccount || '').trim();
    if (!name || !bank || !account) {
      throw cancelError(
        'Coordonnées bancaires requises (accountName, bankName, ibanOrAccount)',
        'LAYAWAY_REFUND_BANK_REQUIRED',
      );
    }
    return {
      bankDetails: { accountName: name, bankName: bank, ibanOrAccount: account },
      checkDetails: null,
    };
  }
  if (mode === 'CHECK') {
    const payee = String(checkDetails?.payeeName || '').trim();
    const addr = String(checkDetails?.mailingAddress || '').trim();
    if (!payee || !addr) {
      throw cancelError(
        'Chèque : payeeName et mailingAddress requis',
        'LAYAWAY_REFUND_CHECK_REQUIRED',
      );
    }
    return {
      bankDetails: null,
      checkDetails: { payeeName: payee, mailingAddress: addr },
    };
  }
  throw cancelError(
    'Mode remboursement invalide (BANK_TRANSFER | CHECK)',
    'LAYAWAY_REFUND_MODE_INVALID',
  );
}

async function notifyBuyer(layaway, title, message, kind, extra = {}) {
  try {
    await Notification.create({
      recipient: layaway.buyerId,
      sender: 'system',
      title,
      message,
      type: 'paiement',
      relatedId: layaway._id,
      relatedModel: 'Layaway',
      data: { layawayId: String(layaway._id), kind, ...extra },
    });
  } catch (err) {
    console.error('[LAYAWAY][CANCEL] Notif échouée:', err.message);
  }
}

async function releaseVehicleIfNeeded(layaway) {
  // Si véhicule encore réservé / engagé (pas remis), le remettre disponible
  await Article.findOneAndUpdate(
    {
      _id: layaway.vehicleId,
      source: 'layaway',
      layawayPublicationStatus: { $in: ['RESERVE', 'ENGAGE'] },
    },
    {
      $set: {
        layawayPublicationStatus: 'PUBLIE',
        statut: 'en_ligne',
      },
    },
  );
}

/**
 * Acheteur demande l'annulation.
 */
async function requestCancellation(layawayId, buyerId, { reason, refundMode, bankDetails, checkDetails } = {}) {
  const layaway = await loadDossier(layawayId);
  assertBuyerOwns(layaway, buyerId);

  if (!CANCELABLE_STATUSES.has(layaway.status)) {
    throw cancelError(
      `Annulation impossible dans l'état ${layaway.status}`,
      'LAYAWAY_CANCEL_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }
  if (layaway.status === 'ANNULATION_DEMANDEE' || layaway.cancellation?.status === 'REQUESTED') {
    throw cancelError(
      'Une demande d’annulation est déjà en cours',
      'LAYAWAY_CANCEL_ALREADY_REQUESTED',
      409,
    );
  }

  const why = String(reason || '').trim();
  if (!why) {
    throw cancelError('Motif d’annulation requis (reason)', 'LAYAWAY_CANCEL_REASON_REQUIRED');
  }

  const breakdown = computeRefundBreakdown(layaway);
  let dest = { bankDetails: null, checkDetails: null };
  let mode = null;

  if (breakdown.refundAmount > 0) {
    mode = String(refundMode || '').toUpperCase();
    if (!REFUND_MODES.has(mode)) {
      throw cancelError(
        'Mode remboursement requis : BANK_TRANSFER ou CHECK',
        'LAYAWAY_REFUND_MODE_REQUIRED',
      );
    }
    dest = requireRefundDestination(mode, { bankDetails, checkDetails });
  }

  const previousStatus = layaway.status;
  const now = new Date();

  transition(previousStatus, 'ANNULATION_DEMANDEE');
  layaway.status = 'ANNULATION_DEMANDEE';

  layaway.cancellation = {
    status: 'REQUESTED',
    previousStatus,
    reason: why,
    requestedAt: now,
    requestedByUserId: buyerId,
    totalPaid: breakdown.totalPaid,
    retentionPercentage: breakdown.retentionPercentage,
    retentionBase: breakdown.retentionBase,
    retentionAmount: breakdown.retentionAmount,
    refundAmount: breakdown.refundAmount,
    currency: breakdown.currency,
    refundMode: mode,
    bankDetails: dest.bankDetails,
    checkDetails: dest.checkDetails,
    approvedAt: null,
    approvedByUserId: null,
    rejectedAt: null,
    rejectedByUserId: null,
    rejectionReason: null,
    executedAt: null,
    executedByUserId: null,
    executionReference: null,
    notes: null,
  };

  await layaway.save();

  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    cancellation: serializeCancellation(layaway),
    breakdown,
  };
}

async function getCancellation(layawayId, { buyerId, isAdmin = false } = {}) {
  const layaway = await loadDossier(layawayId);
  if (!isAdmin) assertBuyerOwns(layaway, buyerId);
  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    cancellation: serializeCancellation(layaway),
    preview: computeRefundBreakdown(layaway),
  };
}

/**
 * Admin approuve → REMBOURSEMENT_EN_COURS, ou ANNULE si refundAmount = 0.
 * Peut recalculer / ajuster le mode si fourni.
 */
async function approveCancellation(layawayId, adminUserId, {
  refundMode,
  bankDetails,
  checkDetails,
  notes,
  retentionAmount,
  refundAmount,
} = {}) {
  const layaway = await loadDossier(layawayId);
  if (layaway.status !== 'ANNULATION_DEMANDEE') {
    throw cancelError(
      `Approbation impossible dans l'état ${layaway.status}`,
      'LAYAWAY_CANCEL_APPROVE_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }

  const breakdown = computeRefundBreakdown(layaway);
  let retAmt =
    retentionAmount != null && Number.isFinite(Number(retentionAmount))
      ? roundXof(retentionAmount)
      : layaway.cancellation?.retentionAmount ?? breakdown.retentionAmount;
  let refAmt =
    refundAmount != null && Number.isFinite(Number(refundAmount))
      ? roundXof(refundAmount)
      : layaway.cancellation?.refundAmount ?? breakdown.refundAmount;

  // Cohérence soft : si admin override partiel, garder l'autre
  if (retentionAmount != null && refundAmount == null) {
    refAmt = Math.max(0, breakdown.totalPaid - retAmt);
  }
  if (refundAmount != null && retentionAmount == null) {
    retAmt = Math.max(0, breakdown.totalPaid - refAmt);
  }

  let mode = layaway.cancellation?.refundMode || null;
  if (refAmt > 0) {
    if (refundMode) mode = String(refundMode).toUpperCase();
    if (!REFUND_MODES.has(mode)) {
      throw cancelError(
        'Mode remboursement requis pour approuver (BANK_TRANSFER | CHECK)',
        'LAYAWAY_REFUND_MODE_REQUIRED',
      );
    }
    const dest = requireRefundDestination(mode, {
      bankDetails: bankDetails || layaway.cancellation?.bankDetails,
      checkDetails: checkDetails || layaway.cancellation?.checkDetails,
    });
    layaway.cancellation.bankDetails = dest.bankDetails;
    layaway.cancellation.checkDetails = dest.checkDetails;
    layaway.cancellation.refundMode = mode;
  }

  const now = new Date();
  layaway.cancellation.status = 'APPROVED';
  layaway.cancellation.totalPaid = breakdown.totalPaid;
  layaway.cancellation.retentionPercentage = breakdown.retentionPercentage;
  layaway.cancellation.retentionBase = breakdown.retentionBase;
  layaway.cancellation.retentionAmount = retAmt;
  layaway.cancellation.refundAmount = refAmt;
  layaway.cancellation.currency = breakdown.currency;
  layaway.cancellation.approvedAt = now;
  layaway.cancellation.approvedByUserId = adminUserId || null;
  if (notes != null) layaway.cancellation.notes = String(notes).trim() || null;

  if (refAmt <= 0) {
    // Rien à rembourser → clôture annulation directe
    transition('ANNULATION_DEMANDEE', 'ANNULE');
    layaway.status = 'ANNULE';
    layaway.cancellation.status = 'COMPLETED';
    layaway.cancellation.executedAt = now;
    layaway.cancellation.executedByUserId = adminUserId || null;
    if (layaway.guarantee?.status === 'PAID') {
      layaway.guarantee.status = 'RETAINED';
    }
    await layaway.save();
    await releaseVehicleIfNeeded(layaway);
    await notifyBuyer(
      layaway,
      'Layaway — annulation confirmée',
      'Votre dossier Layaway a été annulé. Aucun remboursement n’était dû.',
      'CANCEL_COMPLETED',
    );
  } else {
    transition('ANNULATION_DEMANDEE', 'REMBOURSEMENT_EN_COURS');
    layaway.status = 'REMBOURSEMENT_EN_COURS';
    await layaway.save();
    await notifyBuyer(
      layaway,
      'Layaway — remboursement en cours',
      `Votre annulation est approuvée. Remboursement de ${refAmt} ${breakdown.currency} en cours (${mode}).`,
      'CANCEL_APPROVED',
      { refundAmount: refAmt, refundMode: mode },
    );
  }

  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    cancellation: serializeCancellation(layaway),
  };
}

/**
 * Admin refuse → retour au previousStatus.
 */
async function rejectCancellation(layawayId, adminUserId, { reason } = {}) {
  const layaway = await loadDossier(layawayId);
  if (layaway.status !== 'ANNULATION_DEMANDEE') {
    throw cancelError(
      `Rejet impossible dans l'état ${layaway.status}`,
      'LAYAWAY_CANCEL_REJECT_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }

  const why = String(reason || '').trim();
  if (!why) {
    throw cancelError(
      'Motif de rejet requis (reason)',
      'LAYAWAY_CANCEL_REJECT_REASON_REQUIRED',
    );
  }

  const previous = layaway.cancellation?.previousStatus;
  if (!previous || !canTransition('ANNULATION_DEMANDEE', previous)) {
    throw cancelError(
      `Impossible de restaurer le statut ${previous || '?'}`,
      'LAYAWAY_CANCEL_RESTORE_FORBIDDEN',
      409,
      { previousStatus: previous },
    );
  }

  const now = new Date();
  transition('ANNULATION_DEMANDEE', previous);
  layaway.status = previous;
  layaway.cancellation.status = 'REJECTED';
  layaway.cancellation.rejectedAt = now;
  layaway.cancellation.rejectedByUserId = adminUserId || null;
  layaway.cancellation.rejectionReason = why;

  await layaway.save();

  await notifyBuyer(
    layaway,
    'Layaway — annulation refusée',
    `Votre demande d’annulation a été refusée : ${why}`,
    'CANCEL_REJECTED',
    { reason: why },
  );

  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    cancellation: serializeCancellation(layaway),
  };
}

/**
 * Admin confirme l’exécution du remboursement → ANNULE.
 */
async function executeRefund(layawayId, adminUserId, { reference, notes } = {}) {
  const layaway = await loadDossier(layawayId);
  if (layaway.status !== 'REMBOURSEMENT_EN_COURS') {
    throw cancelError(
      `Exécution remboursement impossible dans l'état ${layaway.status}`,
      'LAYAWAY_REFUND_EXECUTE_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }

  const now = new Date();
  transition('REMBOURSEMENT_EN_COURS', 'ANNULE');
  layaway.status = 'ANNULE';

  layaway.cancellation.status = 'COMPLETED';
  layaway.cancellation.executedAt = now;
  layaway.cancellation.executedByUserId = adminUserId || null;
  if (reference != null) {
    layaway.cancellation.executionReference = String(reference).trim() || null;
  }
  if (notes != null) {
    const extra = String(notes).trim();
    if (extra) {
      layaway.cancellation.notes = layaway.cancellation.notes
        ? `${layaway.cancellation.notes} | ${extra}`
        : extra;
    }
  }

  // Garantie : partie retenue / partie remboursée — MVP : REFUNDED si refund>0
  if (layaway.guarantee?.status === 'PAID') {
    layaway.guarantee.status =
      (layaway.cancellation.refundAmount || 0) > 0 ? 'REFUNDED' : 'RETAINED';
  }

  // Bloquer payout vendeur si encore eligible
  if (layaway.payout && layaway.payout.status === 'ELIGIBLE') {
    layaway.payout.status = 'BLOCKED';
  }

  await layaway.save();
  await releaseVehicleIfNeeded(layaway);

  await notifyBuyer(
    layaway,
    'Layaway — remboursement effectué',
    `Votre dossier est annulé. Remboursement de ${layaway.cancellation.refundAmount} ${layaway.cancellation.currency || 'XOF'} confirmé.`,
    'REFUND_EXECUTED',
    {
      refundAmount: layaway.cancellation.refundAmount,
      reference: layaway.cancellation.executionReference,
    },
  );

  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    cancellation: serializeCancellation(layaway),
  };
}

module.exports = {
  CANCELABLE_STATUSES,
  REFUND_MODES,
  computeRefundBreakdown,
  requestCancellation,
  getCancellation,
  approveCancellation,
  rejectCancellation,
  executeRefund,
  serializeCancellation,
};
