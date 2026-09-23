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
