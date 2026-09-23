const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    provider: { type: String, default: 'feexpay' },
    transactionId: { type: String, index: true },
    customId: { type: String, index: true },
    achat: { type: mongoose.Schema.Types.ObjectId, ref: 'Achat' },
    publicite: { type: mongoose.Schema.Types.ObjectId, ref: 'Publicite' }, // Pour les demandes de pub
    user: { type: String, ref: 'User' },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'XOF' },
    status: { type: String, enum: ['pending', 'success', 'failed', 'cancelled'], default: 'pending', index: true },
    method: { type: String },
    description: { type: String },
    type: {
      type: String,
      enum: ['achat', 'publicite', 'vente', 'verification', 'subscription', 'layaway'],
      default: 'achat',
    },
    duree: { type: String }, // Durée pour les pubs et ventes
    rawInitResponse: { type: Object },
    rawWebhookPayload: { type: Object },

    // --- Layaway ---
    layaway: { type: mongoose.Schema.Types.ObjectId, ref: 'Layaway', index: true },
    layawayKind: { type: String, enum: ['FIRST', 'INSTALLMENT', 'NONE', null], default: null },
    layawayGuaranteeAmount: { type: Number, default: 0 },
    layawayInstallmentAmount: { type: Number, default: 0 },
    layawayAllocation: {
      type: [
        {
          sequence: Number,
          amount: Number,
          installmentId: String,
        },
      ],
      default: [],
    },
    layawayAllocationApplied: { type: Boolean, default: false, index: true },
    layawayAllocatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Idempotence webhook : une même transaction prestataire ne doit pas créer 2 succès distincts
paymentSchema.index(
  { transactionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      transactionId: { $type: 'string', $gt: '' },
      type: 'layaway',
    },
  },
);

module.exports = mongoose.model('Payment', paymentSchema);


