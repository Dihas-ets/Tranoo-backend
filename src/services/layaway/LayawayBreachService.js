/**
 * Rupture automatique Layaway.
 * Raisons :
 * - DELAY_WINDOW_EXPIRED : 3 mois post-notif sans régularisation
 * - SCHEDULE_ENDED_UNPAID : fin d'échéancier sans objectif atteint
 *
 * Effet : ANNULE + retenue (défaut 20 %) + blocage des paiements + libération véhicule.
 */

const mongoose = require('mongoose');
const Layaway = require('../../models/Layaway');
const Article = require('../../models/Article');
const Notification = require('../../models/Notification');
const { transition } = require('./LayawayStateMachine');
const { DEFAULTS } = require('../../models/LayawaySettings');
const { computeRefundBreakdown } = require('./LayawayCancellationService');

const BREACH_REASONS = Object.freeze({
  DELAY_WINDOW_EXPIRED: 'DELAY_WINDOW_EXPIRED',
  SCHEDULE_ENDED_UNPAID: 'SCHEDULE_ENDED_UNPAID',
});

const BREACHABLE_STATUSES = new Set(['ACTIF', 'EN_RETARD', 'CONTRAT_SIGNE', 'GELE']);

function breachError(message, code, status = 400, meta) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (meta) err.meta = meta;
  return err;
}

async function releaseVehicleIfNeeded(layaway) {
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

async function notifyBreach(layaway, reason) {
  if (!layaway.buyerId) return;
  const messages = {
    DELAY_WINDOW_EXPIRED:
      'Votre contrat Layaway a été rompu : le retard n’a pas été régularisé dans les 3 mois suivant la notification. ' +
      `Tranoo conserve une retenue de ${layaway.breach?.retentionPercentage ?? DEFAULTS.retentionPercentage} %.`,
    SCHEDULE_ENDED_UNPAID:
      'Votre contrat Layaway a été rompu : l’échéancier est terminé sans que l’objectif de paiement soit atteint. ' +
      `Tranoo conserve une retenue de ${layaway.breach?.retentionPercentage ?? DEFAULTS.retentionPercentage} %.`,
  };
  try {
    await Notification.create({
      recipient: layaway.buyerId,
      sender: 'system',
      title: 'Layaway — contrat rompu',
      message: messages[reason] || 'Votre contrat Layaway a été rompu.',
      type: 'paiement',
      relatedId: layaway._id,
      relatedModel: 'Layaway',
      data: {
        layawayId: String(layaway._id),
        kind: 'BREACH',
        reason,
        retentionAmount: layaway.breach?.retentionAmount,
        refundAmount: layaway.breach?.refundAmount,
      },
    });
  } catch (err) {
    console.error('[LAYAWAY][BREACH] Notif échouée:', err.message);
  }
}

/**
 * Applique la rupture sur un document chargé (save + notif + release véhicule).
 */
async function applyBreach(layaway, reason, now = new Date()) {
  if (!BREACH_REASONS[reason]) {
    throw breachError('Raison de rupture invalide', 'LAYAWAY_BREACH_REASON_INVALID');
  }
  if (layaway.status === 'ANNULE' || layaway.breach?.breachedAt) {
    return { applied: false, reason: 'already_breached', layaway };
  }
  if (!BREACHABLE_STATUSES.has(layaway.status)) {
    throw breachError(
      `Rupture impossible dans l'état ${layaway.status}`,
      'LAYAWAY_BREACH_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }

  const breakdown = computeRefundBreakdown(layaway);

  transition(layaway.status, 'ANNULE');
  layaway.status = 'ANNULE';

  layaway.breach = {
    reason,
    breachedAt: now,
    retentionPercentage: breakdown.retentionPercentage,
    retentionAmount: breakdown.retentionAmount,
    refundAmount: breakdown.refundAmount,
    totalPaid: breakdown.totalPaid,
    currency: breakdown.currency,
  };

  // Annuler les tours encore ouverts
  for (const inst of layaway.schedule?.installments || []) {
    if (['PENDING', 'PARTIALLY_PAID', 'OVERDUE'].includes(inst.status)) {
      inst.status = 'CANCELLED';
    }
  }

  // Clôturer les delays ouverts
  for (const delay of layaway.delays || []) {
    if (delay.status === 'OPEN') {
      delay.status = 'RESOLVED';
      delay.resolvedAt = now;
    }
  }

  if (layaway.payout && layaway.payout.status === 'ELIGIBLE') {
    layaway.payout.status = 'BLOCKED';
  }

  await layaway.save();
  await releaseVehicleIfNeeded(layaway);
  await notifyBreach(layaway, reason);

  return {
    applied: true,
    layawayId: layaway._id,
    status: layaway.status,
    breach: layaway.breach,
    breakdown,
  };
}

async function breachById(layawayId, reason, now = new Date()) {
  if (!mongoose.isValidObjectId(layawayId)) {
    throw breachError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  const layaway = await Layaway.findById(layawayId);
  if (!layaway) {
    throw breachError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  return applyBreach(layaway, reason, now);
}

module.exports = {
  BREACH_REASONS,
  BREACHABLE_STATUSES,
  applyBreach,
  breachById,
};
