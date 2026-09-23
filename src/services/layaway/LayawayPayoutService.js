/**
 * Gate payout vendeur Layaway (Phase 5).
 * Interdit tant que remise ≠ VALIDATED / statut ≠ REMISE_VALIDEE|CLOTURE.
 */

const mongoose = require('mongoose');
const Layaway = require('../../models/Layaway');

function payoutError(message, code, status = 400, meta) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (meta) err.meta = meta;
  return err;
}

async function loadDossier(layawayId) {
  if (!mongoose.isValidObjectId(layawayId)) {
    throw payoutError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  const layaway = await Layaway.findById(layawayId);
  if (!layaway) {
    throw payoutError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  return layaway;
}

function serializePayout(layaway) {
  const p = layaway.payout || {};
  return {
    status: p.status || 'BLOCKED',
    amount: p.amount ?? layaway.pricing?.sellerPrice ?? null,
    currency: p.currency || layaway.pricing?.currency || 'XOF',
    eligibleAt: p.eligibleAt || null,
    paidAt: p.paidAt || null,
    reference: p.reference || null,
    notes: p.notes || null,
    deliveryStatus: layaway.delivery?.status || 'NONE',
    dossierStatus: layaway.status,
  };
}

/**
 * Gate métier : payout autorisé seulement après remise validée.
 */
function assertPayoutAllowed(layaway) {
  const deliveryOk = layaway.delivery?.status === 'VALIDATED';
  const statusOk = ['REMISE_VALIDEE', 'CLOTURE'].includes(layaway.status);
  if (!deliveryOk || !statusOk) {
    throw payoutError(
      'Payout interdit : remise non validée',
      'LAYAWAY_PAYOUT_BLOCKED',
      409,
      {
        dossierStatus: layaway.status,
        deliveryStatus: layaway.delivery?.status || 'NONE',
        payoutStatus: layaway.payout?.status || 'BLOCKED',
      },
    );
  }
  return true;
}

async function getPayout(layawayId) {
  const layaway = await loadDossier(layawayId);
  return {
    layawayId: layaway._id,
    payout: serializePayout(layaway),
    gateOpen: (() => {
      try {
        assertPayoutAllowed(layaway);
        return true;
      } catch {
        return false;
      }
    })(),
  };
}

/**
 * Admin marque le payout vendeur comme versé.
 */
async function markPayoutPaid(layawayId, adminUserId, { reference, notes, amount } = {}) {
  const layaway = await loadDossier(layawayId);
  assertPayoutAllowed(layaway);

  if (layaway.payout?.status === 'PAID') {
    throw payoutError(
      'Payout déjà marqué comme versé',
      'LAYAWAY_PAYOUT_ALREADY_PAID',
      409,
    );
  }

  const now = new Date();
  layaway.payout = layaway.payout || {};
  if (amount != null && Number.isFinite(Number(amount))) {
    layaway.payout.amount = Number(amount);
  } else if (layaway.payout.amount == null && layaway.pricing?.sellerPrice != null) {
    layaway.payout.amount = Number(layaway.pricing.sellerPrice);
  }
  layaway.payout.currency = layaway.payout.currency || layaway.pricing?.currency || 'XOF';
  layaway.payout.status = 'PAID';
  layaway.payout.paidAt = now;
  layaway.payout.paidByUserId = adminUserId || null;
  if (reference != null) layaway.payout.reference = String(reference).trim() || null;
  if (notes != null) layaway.payout.notes = String(notes).trim() || null;

  await layaway.save();

  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    payout: serializePayout(layaway),
  };
}

module.exports = {
  getPayout,
  markPayoutPaid,
  assertPayoutAllowed,
  serializePayout,
};
