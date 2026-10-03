const mongoose = require('mongoose');
const Layaway = require('../../models/Layaway');
const Payment = require('../../models/Payment');
const Article = require('../../models/Article');
const Notification = require('../../models/Notification');
const { transition } = require('./LayawayStateMachine');
const {
  resolvePayableAmount,
  planAllocation,
  applyAllocationToLayaway,
  computeMinimumDue,
  computeMaximumPayable,
} = require('./LayawayPaymentAllocation');
const { resolveDelaysAfterPayment } = require('./DelayService');
const { hasSchedule } = require('./LayawayService');

function payError(message, code, status = 400, meta) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (meta) err.meta = meta;
  return err;
}

async function loadOwnedDossier(layawayId, buyerId) {
  if (!mongoose.isValidObjectId(layawayId)) {
    throw payError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  const layaway = await Layaway.findById(layawayId);
  if (!layaway) {
    throw payError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  if (String(layaway.buyerId) !== String(buyerId)) {
    throw payError('Accès refusé', 'LAYAWAY_FORBIDDEN', 403);
  }
  return layaway;
}

const PAYABLE_STATUSES = new Set(['CONTRAT_SIGNE', 'ACTIF', 'EN_RETARD']);

function assertPayable(layaway) {
  if (layaway.status === 'ANNULE' || layaway.breach?.breachedAt) {
    throw payError(
      'Contrat rompu : paiements interdits',
      'LAYAWAY_BREACHED',
      409,
    );
  }
  if (layaway.status === 'GELE') {
    throw payError(
      'Dossier gelé (legacy) : paiements interdits',
      'LAYAWAY_FROZEN',
      409,
    );
  }
  if (layaway.status === 'PAIEMENT_COMPLET' || layaway.status === 'CLOTURE') {
    throw payError('Dossier déjà soldé', 'LAYAWAY_ALREADY_PAID', 409);
  }
  if (!PAYABLE_STATUSES.has(layaway.status)) {
    throw payError(
      `Paiement impossible dans l'état ${layaway.status}`,
      'LAYAWAY_PAYMENT_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }
  if (layaway.contract?.status !== 'SIGNED') {
    throw payError('Contrat non signé', 'LAYAWAY_CONTRACT_NOT_SIGNED', 409);
  }
  if (!hasSchedule(layaway)) {
    throw payError(
      'Échéancier non défini : définissez vos tours avant de payer',
      'LAYAWAY_SCHEDULE_REQUIRED',
      409,
    );
  }
}

async function notifyPaymentComplete(layaway) {
  if (!layaway.buyerId) return;
  try {
    await Notification.create({
      recipient: layaway.buyerId,
      sender: 'system',
      title: 'Layaway — objectif de paiement atteint',
      message:
        'Félicitations, votre objectif de paiement Layaway est atteint. ' +
        'Les modalités de remise du véhicule vous seront communiquées ; ' +
        'l’organisation pratique se fait avec les administrateurs Tranoo.',
      type: 'paiement',
      relatedId: layaway._id,
      relatedModel: 'Layaway',
      data: {
        layawayId: String(layaway._id),
        kind: 'PAYMENT_COMPLETE',
        status: layaway.status,
      },
    });
  } catch (err) {
    console.error('[LAYAWAY][PAYMENT] Notif PAIEMENT_COMPLET échouée:', err.message);
  }
}

/**
 * Quote de paiement : minimum / maximum / détail (sans init FeexPay).
 */
async function quotePayment(layawayId, buyerId, requestedAmount) {
  const layaway = await loadOwnedDossier(layawayId, buyerId);
  assertPayable(layaway);
  const resolved = resolvePayableAmount(layaway, requestedAmount);
  return {
    layawayId: layaway._id,
    status: layaway.status,
    currency: layaway.pricing.currency || 'XOF',
    minimumAmount: resolved.minInfo.minimumAmount,
    maximumAmount: resolved.maxAmount,
    amount: resolved.amount,
    kind: resolved.minInfo.kind,
    guaranteeDue: 0,
    installmentDue: resolved.minInfo.installmentDue,
    targetInstallmentSequence: resolved.minInfo.targetInstallmentSequence,
    breakdownPreview: planAllocation(layaway, resolved.amount),
  };
}

/**
 * Crée un Payment pending lié au dossier.
 */
async function createPaymentIntent(layawayId, buyerId, { amount, method } = {}) {
  const layaway = await loadOwnedDossier(layawayId, buyerId);
  assertPayable(layaway);

  const resolved = resolvePayableAmount(layaway, amount);
  const breakdown = planAllocation(layaway, resolved.amount);
  const customId = `LAYAWAY_${layaway._id}_${Date.now()}`;

  const payment = await Payment.create({
    provider: 'feexpay',
    customId,
    user: String(buyerId),
    amount: resolved.amount,
    currency: layaway.pricing.currency || 'XOF',
    status: 'pending',
    method: method || undefined,
    description: `Layaway ${layaway._id} — ${resolved.minInfo.kind}`,
    type: 'layaway',
    layaway: layaway._id,
    layawayKind: resolved.minInfo.kind,
    layawayGuaranteeAmount: 0,
    layawayInstallmentAmount: breakdown.installmentAmount,
    layawayAllocation: breakdown.allocations,
    layawayAllocationApplied: false,
  });

  return {
    payment,
    quote: {
      minimumAmount: resolved.minInfo.minimumAmount,
      maximumAmount: resolved.maxAmount,
      amount: resolved.amount,
      kind: resolved.minInfo.kind,
      guaranteeDue: 0,
      installmentDue: resolved.minInfo.installmentDue,
      breakdown,
    },
  };
}

async function markVehicleEngaged(vehicleId) {
  await Article.findOneAndUpdate(
    {
      _id: vehicleId,
      source: 'layaway',
      layawayPublicationStatus: { $in: ['RESERVE', 'PUBLIE'] },
    },
    { $set: { layawayPublicationStatus: 'ENGAGE', statut: 'en_attente' } },
  );
}

/**
 * Applique un paiement confirmé (webhook / success).
 * Idempotent : si déjà appliqué, no-op.
 */
async function applyConfirmedPayment(payment) {
  if (!payment || payment.type !== 'layaway' || !payment.layaway) {
    return { applied: false, reason: 'not_layaway' };
  }
  if (payment.status !== 'success') {
    return { applied: false, reason: 'not_success' };
  }
  if (payment.layawayAllocationApplied) {
    return { applied: false, reason: 'already_applied', layawayId: payment.layaway };
  }

  const layaway = await Layaway.findById(payment.layaway);
  if (!layaway) {
    throw payError('Dossier introuvable pour paiement', 'LAYAWAY_NOT_FOUND', 404);
  }

  if (layaway.status === 'ANNULE' || layaway.breach?.breachedAt) {
    throw payError(
      'Contrat rompu : paiement non applicable',
      'LAYAWAY_BREACHED',
      409,
    );
  }

  const plan = planAllocation(layaway, payment.amount);
  const paidAt = new Date();
  const result = applyAllocationToLayaway(layaway, plan, paidAt);

  const wasFirstActivation = layaway.status === 'CONTRAT_SIGNE';
  if (wasFirstActivation) {
    transition(layaway.status, 'ACTIF');
    layaway.status = 'ACTIF';
    await markVehicleEngaged(layaway.vehicleId);
  }

  let becameComplete = false;
  if (result.allInstallmentsPaid) {
    resolveDelaysAfterPayment(layaway, paidAt);
    if (layaway.status === 'ACTIF' || layaway.status === 'EN_RETARD') {
      transition(layaway.status, 'PAIEMENT_COMPLET');
      layaway.status = 'PAIEMENT_COMPLET';
      layaway.paymentCompletedAt = paidAt;
      becameComplete = true;
    } else if (layaway.status === 'CONTRAT_SIGNE') {
      transition('CONTRAT_SIGNE', 'ACTIF');
      layaway.status = 'ACTIF';
      await markVehicleEngaged(layaway.vehicleId);
      transition('ACTIF', 'PAIEMENT_COMPLET');
      layaway.status = 'PAIEMENT_COMPLET';
      layaway.paymentCompletedAt = paidAt;
      becameComplete = true;
    }
  } else {
    resolveDelaysAfterPayment(layaway, paidAt);
  }

  await layaway.save();

  if (becameComplete) {
    await notifyPaymentComplete(layaway);
  }

  payment.layawayGuaranteeAmount = 0;
  payment.layawayInstallmentAmount = plan.installmentAmount;
  payment.layawayAllocation = plan.allocations;
  payment.layawayAllocationApplied = true;
  payment.layawayAllocatedAt = paidAt;
  await payment.save();

  return {
    applied: true,
    layawayId: layaway._id,
    status: layaway.status,
    guaranteeAmount: 0,
    installmentAmount: plan.installmentAmount,
    allocations: plan.allocations,
    aggregates: layaway.aggregates,
  };
}

async function listPayments(layawayId, buyerId) {
  await loadOwnedDossier(layawayId, buyerId);
  const payments = await Payment.find({ layaway: layawayId })
    .sort({ createdAt: -1 })
    .lean();
  return payments;
}

async function getPaymentQuoteInfo(layaway) {
  const minInfo = computeMinimumDue(layaway);
  return {
    minimumAmount: minInfo.minimumAmount,
    maximumAmount: computeMaximumPayable(layaway),
    kind: minInfo.kind,
    guaranteeDue: 0,
    installmentDue: minInfo.installmentDue,
  };
}

module.exports = {
  quotePayment,
  createPaymentIntent,
  applyConfirmedPayment,
  listPayments,
  getPaymentQuoteInfo,
  assertPayable,
  PAYABLE_STATUSES,
};
