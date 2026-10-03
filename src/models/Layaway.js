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

/** Historique des retards (une entrée ouverte par échéance / tour en défaut). */
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
    /** Deadline de régularisation = notifiedOverdueAt + defaultThresholdMonths */
    regularizationDeadlineAt: { type: Date, default: null, index: true },
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

    /**
     * @deprecated Garantie retirée de la logique finalisée.
     * Conservé optionnel pour docs legacy ; nouveaux dossiers n'utilisent plus ce bloc.
     */
    guarantee: {
      percentage: { type: Number, default: 0 },
      calculationBase: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ['PENDING', 'PAID', 'REFUNDED', 'RETAINED', 'RELEASED', 'NONE'],
        default: 'NONE',
      },
      paidAt: { type: Date, default: null },
    },

    /** Défini après signature via PUT schedule ; absent à la création. */
    schedule: {
      frequency: { type: String, enum: [...FREQUENCIES, null], default: null },
      durationMonths: { type: Number, default: null },
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null, index: true },
      numberOfInstallments: { type: Number, default: null },
      installments: { type: [installmentSchema], default: [] },
      definedAt: { type: Date, default: null },
    },

    appliedParameters: {
      retentionPercentage: Number,
      maxDurationMonths: Number,
      delayGracePeriodDays: Number,
      defaultThresholdMonths: Number,
      currency: String,
      snapshottedAt: { type: Date, default: Date.now },
      /** @deprecated */
      guaranteePercentage: Number,
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
      signatureData: { type: String, default: null },
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
      /** Tours (= installments) soldés */
      toursPaid: { type: Number, default: 0 },
      /** Tours encore à payer */
      toursRemaining: { type: Number, default: 0 },
    },

    delays: { type: [delaySchema], default: [] },

    /**
     * Rupture automatique (retard non régularisé / fin échéancier sans objectif).
     */
    breach: {
      reason: {
        type: String,
        enum: ['DELAY_WINDOW_EXPIRED', 'SCHEDULE_ENDED_UNPAID', null],
        default: null,
      },
      breachedAt: { type: Date, default: null },
      retentionPercentage: { type: Number, default: null },
      retentionAmount: { type: Number, default: null },
      refundAmount: { type: Number, default: null },
      totalPaid: { type: Number, default: null },
      currency: { type: String, default: null },
    },

    /** @deprecated Ancien gel — remplacé par breach / ANNULE */
    frozenAt: { type: Date, default: null },
    notifiedFrozenAt: { type: Date, default: null },

    delivery: {
      status: {
        type: String,
        enum: ['NONE', 'SUBMITTED', 'VALIDATED', 'REJECTED'],
        default: 'NONE',
      },
      pvUrl: { type: String, default: null },
      signatureData: { type: String, default: null },
      signerFirstName: { type: String, default: null },
      signerLastName: { type: String, default: null },
      signedAt: { type: Date, default: null },
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
      totalPaid: { type: Number, default: null },
      retentionPercentage: { type: Number, default: null },
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
layawaySchema.index({ 'breach.breachedAt': 1 });

module.exports = mongoose.model('Layaway', layawaySchema);
