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
    type: { type: String, enum: ['achat', 'publicite', 'vente', 'verification', 'subscription'], default: 'achat' }, // Type de transaction
    duree: { type: String }, // Durée pour les pubs et ventes
    rawInitResponse: { type: Object },
    rawWebhookPayload: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);


