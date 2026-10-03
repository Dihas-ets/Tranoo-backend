const mongoose = require('mongoose');
const Article = require('../../models/Article');
const Layaway = require('../../models/Layaway');
const ScheduleService = require('./ScheduleService');
const { computeFirstPayment } = require('./ScheduleService');
const { transition } = require('./LayawayStateMachine');
const {
  ensureSettingsDoc,
  toAppliedParameters,
} = require('./LayawaySettingsService');
const { assertLayawayVehicle } = require('./LayawayCatalogService');

const CUSTOMS_CASES = Object.freeze(['WITH_CUSTOMS', 'WITHOUT_CUSTOMS']);

const OPEN_DOSSIER_STATUSES = Object.freeze([
  'BROUILLON',
  'CONTRAT_EN_ATTENTE',
  'CONTRAT_SIGNE',
  'ACTIF',
  'EN_RETARD',
  'GELE',
  'PAIEMENT_COMPLET',
  'REMISE_EN_ATTENTE',
  'REMISE_VALIDEE',
  'ANNULATION_DEMANDEE',
  'REMBOURSEMENT_EN_COURS',
]);

function layawayError(message, code, status = 400, meta) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (meta) err.meta = meta;
  return err;
}

function hasSchedule(layaway) {
  return Boolean(
    layaway?.schedule?.definedAt ||
      (layaway?.schedule?.numberOfInstallments > 0 &&
        Array.isArray(layaway?.schedule?.installments) &&
        layaway.schedule.installments.length > 0),
  );
}

function computeTourProgress(installments = []) {
  const list = installments || [];
  const toursPaid = list.filter((i) => i.status === 'PAID').length;
  const toursRemaining = list.filter((i) =>
    ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status),
  ).length;
  return { toursPaid, toursRemaining };
}

function normalizeCustomsCase(raw) {
  const value = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_');
  const aliases = {
    WITH_CUSTOMS: 'WITH_CUSTOMS',
    AVEC_DOUANE: 'WITH_CUSTOMS',
    DOUANE: 'WITH_CUSTOMS',
    WITHOUT_CUSTOMS: 'WITHOUT_CUSTOMS',
    SANS_DOUANE: 'WITHOUT_CUSTOMS',
    HORS_DOUANE: 'WITHOUT_CUSTOMS',
  };
  const mapped = aliases[value];
  if (!mapped || !CUSTOMS_CASES.includes(mapped)) {
    throw layawayError('Cas douane invalide', 'LAYAWAY_INVALID_CUSTOMS_CASE');
  }
  return mapped;
}

function resolveQuote(vehicle, customsCase) {
  const pricing = vehicle.layawayPricing || {};
  const quote =
    customsCase === 'WITH_CUSTOMS'
      ? pricing.quoteWithCustoms
      : pricing.quoteWithoutCustoms;

  if (quote == null || !Number.isFinite(Number(quote)) || Number(quote) <= 0) {
    throw layawayError(
      'Devis introuvable pour ce cas douane',
      'LAYAWAY_QUOTE_NOT_FOUND',
      404,
    );
  }
  return Math.round(Number(quote));
}

function validateFrequencyAndDuration(settings, frequency, durationMonths) {
  const freq = String(frequency || '').toUpperCase();
  const allowedFreq = (settings.allowedFrequencies || []).map((f) =>
    String(f).toUpperCase(),
  );
  if (!allowedFreq.includes(freq)) {
    throw layawayError('Fréquence invalide', 'LAYAWAY_INVALID_FREQUENCY');
  }

  const duration = Math.round(Number(durationMonths));
  if (!Number.isInteger(duration) || duration < 1) {
    throw layawayError('Durée invalide', 'LAYAWAY_INVALID_DURATION');
  }
  const allowedDurations = (settings.allowedDurationsMonths || []).map((n) =>
    Math.round(Number(n)),
  );
  if (allowedDurations.length && !allowedDurations.includes(duration)) {
    throw layawayError(
      'Durée non autorisée',
      'LAYAWAY_DURATION_NOT_ALLOWED',
      400,
      { allowedDurationsMonths: allowedDurations },
    );
  }
  if (duration > Number(settings.maxDurationMonths)) {
    throw layawayError(
      `Durée supérieure au maximum (${settings.maxDurationMonths} mois)`,
      'LAYAWAY_DURATION_TOO_LONG',
    );
  }
  return { frequency: freq, durationMonths: duration };
}

/**
 * Calcule devis + échéancier (tours) sans garantie, sans persister.
 */
async function buildSchedulePlan({
  vehicleId,
  customsCase: customsCaseRaw,
  frequency,
  durationMonths,
  startDate,
  quote: quoteOverride,
  settings: settingsOverride,
}) {
  const settings = settingsOverride || (await ensureSettingsDoc());
  const { frequency: freq, durationMonths: duration } = validateFrequencyAndDuration(
    settings,
    frequency,
    durationMonths,
  );

  let quote = quoteOverride;
  let vehicle = null;
  let customsCase = customsCaseRaw ? normalizeCustomsCase(customsCaseRaw) : null;

  if (quote == null) {
    if (!vehicleId || !mongoose.isValidObjectId(vehicleId)) {
      throw layawayError('vehicleId invalide', 'LAYAWAY_INVALID_VEHICLE');
    }
    vehicle = await Article.findById(vehicleId);
    assertLayawayVehicle(vehicle);
    if (vehicle.layawayPublicationStatus !== 'PUBLIE') {
      throw layawayError(
        'Véhicule non disponible au Layaway',
        'LAYAWAY_VEHICLE_NOT_AVAILABLE',
        409,
      );
    }
    customsCase = normalizeCustomsCase(customsCaseRaw);
    quote = resolveQuote(vehicle, customsCase);
  }

  const schedule = ScheduleService.generate({
    totalAmount: quote,
    startDate: startDate || new Date(),
    durationMonths: duration,
    frequency: freq,
  });
  const firstPayment = computeFirstPayment(schedule);

  return {
    vehicle,
    settings,
    customsCase,
    quote,
    schedule,
    firstPayment,
    appliedParameters: toAppliedParameters(settings),
    durationMonths: duration,
    frequency: freq,
  };
}

/** @deprecated alias — preview utilise buildSchedulePlan */
async function buildPlan(input) {
  return buildSchedulePlan(input);
}

async function assertNoOpenDossierOnVehicle(vehicleId) {
  const existing = await Layaway.findOne({
    vehicleId,
    status: { $in: OPEN_DOSSIER_STATUSES },
  }).lean();
  if (existing) {
    throw layawayError(
      'Un dossier Layaway est déjà ouvert sur ce véhicule',
      'LAYAWAY_VEHICLE_ALREADY_ENGAGED',
      409,
      { layawayId: existing._id },
    );
  }
}

async function reserveVehicle(vehicleId) {
  const updated = await Article.findOneAndUpdate(
    {
      _id: vehicleId,
      source: 'layaway',
      layawayPublicationStatus: 'PUBLIE',
    },
    {
      $set: {
        layawayPublicationStatus: 'RESERVE',
        statut: 'en_attente',
      },
    },
    { new: true },
  );
  if (!updated) {
    throw layawayError(
      'Véhicule indisponible (déjà réservé ou retiré)',
      'LAYAWAY_VEHICLE_NOT_AVAILABLE',
      409,
    );
  }
  return updated;
}

async function releaseVehicleReservation(vehicleId) {
  await Article.findOneAndUpdate(
    {
      _id: vehicleId,
      source: 'layaway',
      layawayPublicationStatus: 'RESERVE',
    },
    {
      $set: {
        layawayPublicationStatus: 'PUBLIE',
        statut: 'en_ligne',
      },
    },
  );
}

function serializePlan(plan) {
  return {
    vehicleId: plan.vehicle?._id || null,
    customsCase: plan.customsCase,
    pricing: {
      quote: plan.quote,
      totalAmount: plan.quote,
      currency: plan.appliedParameters.currency || 'XOF',
      customsCase: plan.customsCase,
    },
    schedule: {
      frequency: plan.frequency || plan.schedule.frequency,
      durationMonths: plan.durationMonths,
      startDate: plan.schedule.startDate,
      endDate: plan.schedule.endDate,
      numberOfInstallments: plan.schedule.numberOfInstallments,
      installments: plan.schedule.installments,
    },
    firstPayment: plan.firstPayment,
    appliedParameters: plan.appliedParameters,
  };
}

/**
 * Prévisualisation échéancier (après choix fréquence/durée) — sans garantie.
 */
async function previewCreation(input) {
  const plan = await buildSchedulePlan(input);
  return serializePlan(plan);
}

/**
 * Création dossier : sélection véhicule + cas douane uniquement.
 * → réserve véhicule, snapshot devis/params, CONTRAT_EN_ATTENTE, sans échéancier.
 */
async function createDossier({ buyerId, vehicleId, customsCase: customsCaseRaw }) {
  if (!buyerId) {
    throw layawayError('Acheteur requis', 'LAYAWAY_BUYER_REQUIRED', 401);
  }
  if (!vehicleId || !mongoose.isValidObjectId(vehicleId)) {
    throw layawayError('vehicleId invalide', 'LAYAWAY_INVALID_VEHICLE');
  }

  const vehicle = await Article.findById(vehicleId);
  assertLayawayVehicle(vehicle);

  if (vehicle.layawayPublicationStatus !== 'PUBLIE') {
    throw layawayError(
      'Véhicule non disponible au Layaway',
      'LAYAWAY_VEHICLE_NOT_AVAILABLE',
      409,
    );
  }

  const settings = await ensureSettingsDoc();
  const customsCase = normalizeCustomsCase(customsCaseRaw);
  const quote = resolveQuote(vehicle, customsCase);
  const appliedParameters = toAppliedParameters(settings);

  await assertNoOpenDossierOnVehicle(vehicleId);
  await reserveVehicle(vehicleId);

  try {
    const layaway = new Layaway({
      buyerId,
      vehicleId,
      sellerId: vehicle.vendeur || null,
      pricing: {
        sellerPrice: vehicle.prix ?? null,
        tranooMargin: null,
        additionalFees: 0,
        customsCase,
        quote,
        totalAmount: quote,
        currency: appliedParameters.currency || 'XOF',
      },
      guarantee: {
        percentage: 0,
        calculationBase: 0,
        amount: 0,
        status: 'NONE',
      },
      schedule: {
        frequency: null,
        durationMonths: null,
        startDate: null,
        endDate: null,
        numberOfInstallments: null,
        installments: [],
        definedAt: null,
      },
      appliedParameters,
      contract: {
        status: 'PENDING',
        documentUrl: settings.defaultContractDocumentUrl || null,
      },
      status: 'BROUILLON',
      aggregates: {
        totalInstallmentsPaid: 0,
        remainingScheduleBalance: quote,
        paidPercentage: 0,
        toursPaid: 0,
        toursRemaining: 0,
      },
    });

    transition('BROUILLON', 'CONTRAT_EN_ATTENTE');
    layaway.status = 'CONTRAT_EN_ATTENTE';

    await layaway.save();

    return { layaway, firstPayment: null };
  } catch (error) {
    await releaseVehicleReservation(vehicleId);
    throw error;
  }
}

/**
 * Définition de l'échéancier (tours) après signature du contrat.
 */
async function defineSchedule(layawayId, buyerId, { frequency, durationMonths, startDate } = {}) {
  if (!mongoose.isValidObjectId(layawayId)) {
    throw layawayError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  const layaway = await Layaway.findById(layawayId);
  if (!layaway) {
    throw layawayError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  if (String(layaway.buyerId) !== String(buyerId)) {
    throw layawayError('Accès refusé', 'LAYAWAY_FORBIDDEN', 403);
  }

  if (layaway.status !== 'CONTRAT_SIGNE') {
    throw layawayError(
      'L’échéancier ne peut être défini qu’après signature du contrat',
      'LAYAWAY_SCHEDULE_DEFINE_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }
  if (layaway.contract?.status !== 'SIGNED') {
    throw layawayError('Contrat non signé', 'LAYAWAY_CONTRACT_NOT_SIGNED', 409);
  }
  if (hasSchedule(layaway)) {
    throw layawayError(
      'Échéancier déjà défini',
      'LAYAWAY_SCHEDULE_ALREADY_DEFINED',
      409,
    );
  }
  if (layaway.breach?.breachedAt) {
    throw layawayError(
      'Dossier rompu : échéancier impossible',
      'LAYAWAY_BREACHED',
      409,
    );
  }

  const settings = await ensureSettingsDoc();
  const plan = await buildSchedulePlan({
    frequency,
    durationMonths,
    startDate,
    quote: layaway.pricing.totalAmount,
    settings,
  });

  const now = new Date();
  const tours = computeTourProgress(plan.schedule.installments);

  layaway.schedule = {
    frequency: plan.frequency,
    durationMonths: plan.durationMonths,
    startDate: plan.schedule.startDate,
    endDate: plan.schedule.endDate,
    numberOfInstallments: plan.schedule.numberOfInstallments,
    installments: plan.schedule.installments,
    definedAt: now,
  };
  layaway.aggregates.remainingScheduleBalance = plan.quote;
  layaway.aggregates.toursPaid = tours.toursPaid;
  layaway.aggregates.toursRemaining = tours.toursRemaining;

  await layaway.save();

  return {
    layaway,
    firstPayment: plan.firstPayment,
  };
}

async function getDossierForBuyer(layawayId, buyerId) {
  if (!mongoose.isValidObjectId(layawayId)) {
    throw layawayError('Identifiant invalide', 'LAYAWAY_NOT_FOUND', 404);
  }
  const layaway = await Layaway.findById(layawayId)
    .populate('vehicleId')
    .populate('buyerId', 'nom prenoms email telephone');
  if (!layaway) {
    throw layawayError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  if (String(layaway.buyerId._id || layaway.buyerId) !== String(buyerId)) {
    throw layawayError('Accès refusé', 'LAYAWAY_FORBIDDEN', 403);
  }
  return layaway;
}

async function listDossiersForBuyer(buyerId, { status } = {}) {
  const filter = { buyerId };
  if (status) filter.status = String(status).toUpperCase();
  return Layaway.find(filter)
    .sort({ createdAt: -1 })
    .populate('vehicleId', 'titre photos marque modele type layawayPublicationStatus');
}

function buildPublicDossierView(layaway, firstPayment) {
  const totalAmount = layaway.pricing.totalAmount;
  const paid = layaway.aggregates.totalInstallmentsPaid || 0;
  const scheduleDefined = hasSchedule(layaway);
  const tours = computeTourProgress(layaway.schedule?.installments);

  return {
    id: layaway._id,
    status: layaway.status,
    vehicleId: layaway.vehicleId,
    pricing: layaway.pricing,
    scheduleDefined,
    schedule: scheduleDefined
      ? {
          frequency: layaway.schedule.frequency,
          durationMonths: layaway.schedule.durationMonths,
          startDate: layaway.schedule.startDate,
          endDate: layaway.schedule.endDate,
          numberOfInstallments: layaway.schedule.numberOfInstallments,
          definedAt: layaway.schedule.definedAt || null,
        }
      : null,
    contract: {
      status: layaway.contract?.status || 'NONE',
      documentUrl: layaway.contract?.documentUrl || null,
      signedDocumentUrl: layaway.contract?.signedDocumentUrl || null,
      hasSignature: Boolean(layaway.contract?.signatureData),
      idDocumentUrl: layaway.contract?.idDocumentUrl || null,
      signerFirstName: layaway.contract?.signerFirstName || null,
      signerLastName: layaway.contract?.signerLastName || null,
      signedAt: layaway.contract?.signedAt || null,
    },
    aggregates: {
      totalInstallmentsPaid: paid,
      remainingScheduleBalance:
        layaway.aggregates.remainingScheduleBalance ?? totalAmount - paid,
      paidPercentage: layaway.aggregates.paidPercentage || 0,
      toursPaid: layaway.aggregates.toursPaid ?? tours.toursPaid,
      toursRemaining: layaway.aggregates.toursRemaining ?? tours.toursRemaining,
    },
    breach: layaway.breach?.breachedAt
      ? {
          reason: layaway.breach.reason,
          breachedAt: layaway.breach.breachedAt,
          retentionPercentage: layaway.breach.retentionPercentage,
          retentionAmount: layaway.breach.retentionAmount,
          refundAmount: layaway.breach.refundAmount,
          totalPaid: layaway.breach.totalPaid,
        }
      : null,
    delivery: {
      status: layaway.delivery?.status || 'NONE',
      submittedAt: layaway.delivery?.submittedAt || null,
      validatedAt: layaway.deliveryValidatedAt || layaway.delivery?.validatedAt || null,
      rejectionReason: layaway.delivery?.rejectionReason || null,
    },
    payout: {
      status: layaway.payout?.status || 'BLOCKED',
      amount: layaway.payout?.amount ?? layaway.pricing?.sellerPrice ?? null,
    },
    invoice: {
      invoiceNumber: layaway.invoice?.invoiceNumber || null,
      issuedAt: layaway.invoiceIssuedAt || layaway.invoice?.issuedAt || null,
    },
    cancellation: {
      status: layaway.cancellation?.status || 'NONE',
      refundAmount: layaway.cancellation?.refundAmount ?? null,
      refundMode: layaway.cancellation?.refundMode || null,
      requestedAt: layaway.cancellation?.requestedAt || null,
    },
    timestamps: {
      paymentCompletedAt: layaway.paymentCompletedAt || null,
      deliveryValidatedAt: layaway.deliveryValidatedAt || null,
      invoiceIssuedAt: layaway.invoiceIssuedAt || null,
      closedAt: layaway.closedAt || null,
    },
    firstPayment: firstPayment || null,
    createdAt: layaway.createdAt,
    updatedAt: layaway.updatedAt,
  };
}

module.exports = {
  CUSTOMS_CASES,
  OPEN_DOSSIER_STATUSES,
  hasSchedule,
  computeTourProgress,
  buildPlan,
  buildSchedulePlan,
  previewCreation,
  createDossier,
  defineSchedule,
  getDossierForBuyer,
  listDossiersForBuyer,
  buildPublicDossierView,
  computeFirstPaymentFromDoc(layaway) {
    if (!hasSchedule(layaway)) return null;
    return computeFirstPayment(layaway.schedule);
  },
};
