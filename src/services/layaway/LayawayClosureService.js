/**
 * Facture finale + clôture Layaway (Phase 5).
 * Facture liée à la clôture (pas au seul 100 % payé).
 * REMISE_VALIDEE → CLOTURE + invoiceIssuedAt / closedAt.
 */

const mongoose = require('mongoose');
const Layaway = require('../../models/Layaway');
const Notification = require('../../models/Notification');
const { nextInvoiceNumber } = require('../../utils/invoiceNumberService');
const { transition } = require('./LayawayStateMachine');

function closureError(message, code, status = 400, meta) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (meta) err.meta = meta;
  return err;
}

async function loadDossier(layawayId) {
  if (!mongoose.isValidObjectId(layawayId)) {
    throw closureError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  const layaway = await Layaway.findById(layawayId);
  if (!layaway) {
    throw closureError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  return layaway;
}

function serializeInvoice(layaway) {
  const inv = layaway.invoice || {};
  return {
    invoiceNumber: inv.invoiceNumber || null,
    amount: inv.amount ?? null,
    currency: inv.currency || layaway.pricing?.currency || 'XOF',
    issuedAt: inv.issuedAt || layaway.invoiceIssuedAt || null,
  };
}

/**
 * Clôture admin : émet la facture + passe en CLOTURE.
 * Prérequis : REMISE_VALIDEE (remise validée).
 * Le payout peut être encore ELIGIBLE (non bloquant).
 */
async function closeDossier(layawayId, adminUserId, { notes } = {}) {
  const layaway = await loadDossier(layawayId);

  if (layaway.status === 'CLOTURE') {
    throw closureError('Dossier déjà clôturé', 'LAYAWAY_ALREADY_CLOSED', 409);
  }
  if (layaway.status !== 'REMISE_VALIDEE') {
    throw closureError(
      `Clôture impossible dans l'état ${layaway.status}`,
      'LAYAWAY_CLOSE_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }
  if (layaway.delivery?.status !== 'VALIDATED') {
    throw closureError(
      'Clôture impossible : remise non validée',
      'LAYAWAY_CLOSE_DELIVERY_REQUIRED',
      409,
    );
  }

  const now = new Date();
  const invoiceNumber = await nextInvoiceNumber();
  const amount = Number(layaway.pricing?.totalAmount) || 0;
  const currency = layaway.pricing?.currency || 'XOF';

  layaway.invoice = {
    invoiceNumber,
    amount,
    currency,
    issuedAt: now,
    issuedByUserId: adminUserId || null,
  };
  layaway.invoiceIssuedAt = now;

  transition('REMISE_VALIDEE', 'CLOTURE');
  layaway.status = 'CLOTURE';
  layaway.closedAt = now;
  if (notes != null) {
    layaway.delivery = layaway.delivery || {};
    const prev = layaway.delivery.validationNotes || '';
    const extra = String(notes).trim();
    if (extra) {
      layaway.delivery.validationNotes = prev
        ? `${prev} | Clôture: ${extra}`
        : `Clôture: ${extra}`;
    }
  }

  await layaway.save();

  try {
    await Notification.create({
      recipient: layaway.buyerId,
      sender: 'system',
      title: 'Layaway — dossier clôturé',
      message: `Votre dossier Layaway est clôturé. Facture ${invoiceNumber}.`,
      type: 'paiement',
      relatedId: layaway._id,
      relatedModel: 'Layaway',
      data: {
        layawayId: String(layaway._id),
        kind: 'CLOSED',
        invoiceNumber,
      },
    });
  } catch (err) {
    console.error('[LAYAWAY][CLOSE] Notif clôture échouée:', err.message);
  }

  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    invoice: serializeInvoice(layaway),
    timestamps: {
      paymentCompletedAt: layaway.paymentCompletedAt,
      deliveryValidatedAt: layaway.deliveryValidatedAt,
      invoiceIssuedAt: layaway.invoiceIssuedAt,
      closedAt: layaway.closedAt,
    },
    payout: {
      status: layaway.payout?.status || 'BLOCKED',
      amount: layaway.payout?.amount ?? null,
      paidAt: layaway.payout?.paidAt || null,
    },
  };
}

async function getInvoice(layawayId, { buyerId, isAdmin = false } = {}) {
  const layaway = await loadDossier(layawayId);
  if (!isAdmin && String(layaway.buyerId) !== String(buyerId)) {
    throw closureError('Accès refusé', 'LAYAWAY_FORBIDDEN', 403);
  }
  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    invoice: serializeInvoice(layaway),
    timestamps: {
      paymentCompletedAt: layaway.paymentCompletedAt,
      deliveryValidatedAt: layaway.deliveryValidatedAt,
      invoiceIssuedAt: layaway.invoiceIssuedAt,
      closedAt: layaway.closedAt,
    },
  };
}

module.exports = {
  closeDossier,
  getInvoice,
  serializeInvoice,
};
