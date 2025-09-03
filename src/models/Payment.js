const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    provider: { type: String, default: 'feexpay' },
    transactionId: { type: String, index: true },
    customId: { type: String, index: true },
    achat: { type: mongoose.Schema.Types.ObjectId, ref: 'Achat' },
    user: { type: String, ref: 'User' },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'XOF' },
    status: { type: String, enum: ['pending', 'success', 'failed', 'cancelled'], default: 'pending', index: true },
    method: { type: String },
    description: { type: String },
    rawInitResponse: { type: Object },
    rawWebhookPayload: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);


