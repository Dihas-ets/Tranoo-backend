const mongoose = require('mongoose');
const { STATUSES } = require('../services/layaway/LayawayStateMachine');
const { FREQUENCIES } = require('../services/layaway/ScheduleService');

const installmentSchema = new mongoose.Schema(
  {
    sequence: { type: Number, required: true },
    dueDate: { type: Date, required: true, index: true },
    amount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    remainingAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    paidAt: { type: Date, default: null },
  },
  { _id: true },
);

/** Historique des retards (une entrée ouverte par échéance en défaut). */
const delaySchema = new mongoose.Schema(
  {
    installmentSequence: { type: Number, required: true },
    installmentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    dueDate: { type: Date, required: true },
    graceEndsAt: { type: Date, required: true },
    overdueAt: { type: Date, required: true },
    resolvedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['OPEN', 'RESOLVED'],
      default: 'OPEN',
      index: true,
    },
    notifiedOverdueAt: { type: Date, default: null },
  },
  { _id: true },
);

const layawaySchema = new mongoose.Schema(
  {
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: true,
      index: true,
    },
    sellerId: { type: String, ref: 'User', default: null, index: true },

    pricing: {
      sellerPrice: { type: Number, default: null },
      tranooMargin: { type: Number, default: null },
      additionalFees: { type: Number, default: 0 },
      customsCase: {
        type: String,
        enum: ['WITH_CUSTOMS', 'WITHOUT_CUSTOMS', null],
        default: null,
      },
      quote: { type: Number, required: true },
      totalAmount: { type: Number, required: true },
      currency: { type: String, default: 'XOF' },
    },

    guarantee: {
      percentage: { type: Number, required: true },
      calculationBase: { type: Number, required: true },
      amount: { type: Number, required: true },
      status: {
        type: String,
        enum: ['PENDING', 'PAID', 'REFUNDED', 'RETAINED', 'RELEASED'],
        default: 'PENDING',
      },
      paidAt: { type: Date, default: null },
    },

    schedule: {
      frequency: { type: String, enum: FREQUENCIES, required: true },
      durationMonths: { type: Number, required: true },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      numberOfInstallments: { type: Number, required: true },
      installments: { type: [installmentSchema], default: [] },
    },

    appliedParameters: {
      guaranteePercentage: Number,
      retentionPercentage: Number,
      maxDurationMonths: Number,
      delayGracePeriodDays: Number,
      defaultThresholdMonths: Number,
      currency: String,
      snapshottedAt: { type: Date, default: Date.now },
    },

    contract: {
      status: {
        type: String,
        enum: ['NONE', 'PENDING', 'SIGNED'],
        default: 'NONE',
      },
      documentUrl: { type: String, default: null },
      signedDocumentUrl: { type: String, default: null },
      signerFirstName: { type: String, default: null },
      signerLastName: { type: String, default: null },
      /** Image / traits de signature (data URL base64 ou URL Cloudinary) */
      signatureData: { type: String, default: null },
      /** Pièce d'identité collectée à la signature du contrat */
      idDocumentUrl: { type: String, default: null },
      signedAt: { type: Date, default: null },
      signedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      signedIp: { type: String, default: null },
      signedUserAgent: { type: String, default: null },
    },

    status: {
      type: String,
      enum: STATUSES,
      default: 'BROUILLON',
      index: true,
    },

    aggregates: {
      totalInstallmentsPaid: { type: Number, default: 0 },
      remainingScheduleBalance: { type: Number, default: null },
      paidPercentage: { type: Number, default: 0 },
    },

    delays: { type: [delaySchema], default: [] },

    /** Date de passage en GELE (cron seuil défaut). */
    frozenAt: { type: Date, default: null },
    /** Dernière notif gel (anti-spam). */
    notifiedFrozenAt: { type: Date, default: null },

    /**
     * Remise véhicule (preuves + validation Tranoo).
     * status: NONE | SUBMITTED | VALIDATED | REJECTED
     */
    delivery: {
      status: {
        type: String,
        enum: ['NONE', 'SUBMITTED', 'VALIDATED', 'REJECTED'],
        default: 'NONE',
      },
      /** URL du PV de remise (document) */
      pvUrl: { type: String, default: null },
      /** Signature acheteur du PV (data URL / URL) — obligatoire à la soumission */
      signatureData: { type: String, default: null },
      signerFirstName: { type: String, default: null },
      signerLastName: { type: String, default: null },
      signedAt: { type: Date, default: null },
      /** @deprecated photos / pièce ID : pièce collectée au contrat ; photos hors scope actuel */
      photoUrls: { type: [String], default: [] },
      idDocumentUrl: { type: String, default: null },
      notes: { type: String, default: null },
      submittedAt: { type: Date, default: null },
      submittedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      validatedAt: { type: Date, default: null },
      validatedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      validationNotes: { type: String, default: null },
      rejectedAt: { type: Date, default: null },
      rejectedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      rejectionReason: { type: String, default: null },
    },

    /**
     * Payout vendeur — interdit tant que remise ≠ VALIDATED.
     * status: BLOCKED | ELIGIBLE | PAID
     */
    payout: {
      status: {
        type: String,
        enum: ['BLOCKED', 'ELIGIBLE', 'PAID'],
        default: 'BLOCKED',
      },
      amount: { type: Number, default: null },
      currency: { type: String, default: null },
      eligibleAt: { type: Date, default: null },
      paidAt: { type: Date, default: null },
      paidByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      reference: { type: String, default: null },
      notes: { type: String, default: null },
    },

    /** Facture finale (émise à la clôture, pas au seul 100 % payé). */
    invoice: {
      invoiceNumber: { type: String, default: null },
      amount: { type: Number, default: null },
      currency: { type: String, default: null },
      issuedAt: { type: Date, default: null },
      issuedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
    },

    /**
     * Annulation / remboursement.
     * Modes payout client : BANK_TRANSFER | CHECK uniquement.
     */
    cancellation: {
      status: {
        type: String,
        enum: ['NONE', 'REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED'],
        default: 'NONE',
      },
      previousStatus: { type: String, default: null },
      reason: { type: String, default: null },
      requestedAt: { type: Date, default: null },
      requestedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      /** Snapshot calcul retenue au moment de la demande / approbation */
      totalPaid: { type: Number, default: null },
      retentionPercentage: { type: Number, default: null },
      /** TODO métier : base exacte (MVP = totalPaid) */
      retentionBase: { type: Number, default: null },
      retentionAmount: { type: Number, default: null },
      refundAmount: { type: Number, default: null },
      currency: { type: String, default: null },
      refundMode: {
        type: String,
        enum: ['BANK_TRANSFER', 'CHECK', null],
        default: null,
      },
      bankDetails: {
        accountName: { type: String, default: null },
        bankName: { type: String, default: null },
        ibanOrAccount: { type: String, default: null },
      },
      checkDetails: {
        payeeName: { type: String, default: null },
        mailingAddress: { type: String, default: null },
      },
      approvedAt: { type: Date, default: null },
      approvedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      rejectedAt: { type: Date, default: null },
      rejectedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      rejectionReason: { type: String, default: null },
      executedAt: { type: Date, default: null },
      executedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      executionReference: { type: String, default: null },
      notes: { type: String, default: null },
    },

    paymentCompletedAt: { type: Date, default: null },
    deliveryValidatedAt: { type: Date, default: null },
    invoiceIssuedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

layawaySchema.index({ buyerId: 1, status: 1 });
layawaySchema.index({ vehicleId: 1, status: 1 });
layawaySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Layaway', layawaySchema);
