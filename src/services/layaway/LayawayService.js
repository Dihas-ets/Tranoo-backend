const mongoose = require('mongoose');
const Article = require('../../models/Article');
const Layaway = require('../../models/Layaway');
const GuaranteeService = require('./GuaranteeService');
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
 * Calcule devis / garantie / échéancier / 1er règlement sans persister.
 * Entrée client : vehicleId, customsCase, frequency, durationMonths [, startDate]
 */
async function buildPlan({
  vehicleId,
  customsCase: customsCaseRaw,
  frequency,
  durationMonths,
  startDate,
}) {
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
  const { frequency: freq, durationMonths: duration } = validateFrequencyAndDuration(
    settings,
    frequency,
    durationMonths,
  );

  const quote = resolveQuote(vehicle, customsCase);
  const guarantee = GuaranteeService.calculate(
    quote,
    settings.guaranteePercentage,
  );
  const schedule = ScheduleService.generate({
    totalAmount: quote,
    startDate: startDate || new Date(),
    durationMonths: duration,
    frequency: freq,
  });
  const firstPayment = computeFirstPayment(guarantee.amount, schedule);

  return {
    vehicle,
    settings,
    customsCase,
    quote,
    guarantee,
    schedule,
    firstPayment,
    appliedParameters: toAppliedParameters(settings),
  };
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

/**
 * Réserve atomiquement un véhicule PUBLIE → RESERVE.
 */
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

function serializePlan(plan, durationMonths) {
  return {
    vehicleId: plan.vehicle._id,
    customsCase: plan.customsCase,
    pricing: {
      quote: plan.quote,
      totalAmount: plan.quote,
      currency: plan.appliedParameters.currency || 'XOF',
      customsCase: plan.customsCase,
    },
    guarantee: {
      percentage: plan.guarantee.percentage,
      calculationBase: plan.guarantee.calculationBase,
      amount: plan.guarantee.amount,
    },
    schedule: {
      frequency: plan.schedule.frequency,
      durationMonths,
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
 * Prévisualisation : calculs backend, rien n'est enregistré.
 */
async function previewCreation(input) {
  const plan = await buildPlan(input);
  const { frequency, durationMonths } = validateFrequencyAndDuration(
    plan.settings,
    input.frequency,
    input.durationMonths,
  );
  const payload = serializePlan(plan, durationMonths);
  payload.schedule.frequency = frequency;
  return payload;
}

/**
 * Création dossier :
 * choix client → calcul backend → snapshot → échéancier persisté → CONTRAT_EN_ATTENTE
 * véhicule PUBLIE → RESERVE
 */
async function createDossier({
  buyerId,
  vehicleId,
  customsCase,
  frequency,
  durationMonths,
  startDate,
}) {
  if (!buyerId) {
    throw layawayError('Acheteur requis', 'LAYAWAY_BUYER_REQUIRED', 401);
  }

  // Rejeter tout montant client éventuel (sécurité)
  const plan = await buildPlan({
    vehicleId,
    customsCase,
    frequency,
    durationMonths,
    startDate,
  });

  await assertNoOpenDossierOnVehicle(vehicleId);
  await reserveVehicle(vehicleId);

  try {
    const duration = Math.round(Number(durationMonths));
    const layaway = new Layaway({
      buyerId,
      vehicleId,
      sellerId: plan.vehicle.vendeur || null,
      pricing: {
        sellerPrice: plan.vehicle.prix ?? null,
        tranooMargin: null,
        additionalFees: 0,
        customsCase: plan.customsCase,
        quote: plan.quote,
        totalAmount: plan.quote,
        currency: plan.appliedParameters.currency || 'XOF',
      },
      guarantee: {
        percentage: plan.guarantee.percentage,
        calculationBase: plan.guarantee.calculationBase,
        amount: plan.guarantee.amount,
        status: 'PENDING',
      },
      schedule: {
        frequency: plan.schedule.frequency,
        durationMonths: duration,
        startDate: plan.schedule.startDate,
        endDate: plan.schedule.endDate,
        numberOfInstallments: plan.schedule.numberOfInstallments,
        installments: plan.schedule.installments,
      },
      appliedParameters: plan.appliedParameters,
      contract: {
        status: 'PENDING',
        documentUrl: plan.settings.defaultContractDocumentUrl || null,
      },
      status: 'BROUILLON',
      aggregates: {
        totalInstallmentsPaid: 0,
        remainingScheduleBalance: plan.quote,
        paidPercentage: 0,
      },
    });

    // BROUILLON → CONTRAT_EN_ATTENTE
    transition('BROUILLON', 'CONTRAT_EN_ATTENTE');
    layaway.status = 'CONTRAT_EN_ATTENTE';

    await layaway.save();

    return {
      layaway,
      firstPayment: plan.firstPayment,
    };
  } catch (error) {
    await releaseVehicleReservation(vehicleId);
    throw error;
  }
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
  return {
    id: layaway._id,
    status: layaway.status,
    vehicleId: layaway.vehicleId,
    pricing: layaway.pricing,
    guarantee: {
      percentage: layaway.guarantee.percentage,
      calculationBase: layaway.guarantee.calculationBase,
      amount: layaway.guarantee.amount,
      status: layaway.guarantee.status,
    },
    schedule: {
      frequency: layaway.schedule.frequency,
      durationMonths: layaway.schedule.durationMonths,
      startDate: layaway.schedule.startDate,
      endDate: layaway.schedule.endDate,
      numberOfInstallments: layaway.schedule.numberOfInstallments,
    },
    contract: {
      status: layaway.contract?.status || 'NONE',
      documentUrl: layaway.contract?.documentUrl || null,
      signedDocumentUrl: layaway.contract?.signedDocumentUrl || null,
      hasSignature: Boolean(layaway.contract?.signatureData),
      signerFirstName: layaway.contract?.signerFirstName || null,
      signerLastName: layaway.contract?.signerLastName || null,
      signedAt: layaway.contract?.signedAt || null,
    },
    aggregates: {
      totalInstallmentsPaid: paid,
      remainingScheduleBalance:
        layaway.aggregates.remainingScheduleBalance ?? totalAmount - paid,
      paidPercentage: layaway.aggregates.paidPercentage || 0,
    },
    firstPayment: firstPayment || null,
    createdAt: layaway.createdAt,
    updatedAt: layaway.updatedAt,
  };
}

module.exports = {
  CUSTOMS_CASES,
  OPEN_DOSSIER_STATUSES,
  buildPlan,
  previewCreation,
  createDossier,
  getDossierForBuyer,
  listDossiersForBuyer,
  buildPublicDossierView,
  computeFirstPaymentFromDoc(layaway) {
    return computeFirstPayment(layaway.guarantee.amount, layaway.schedule);
  },
};
